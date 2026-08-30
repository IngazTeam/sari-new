import { setTimeout as delay } from "node:timers/promises";

import { resolveSariTaskType } from "../../ai/task-catalog";
import type { ActiveConnectorCredential } from "./repository";

export type ActivationEvidence = {
  job_id: string;
  trace_id: string;
  run_manifest_id: string;
  route: string;
  duration_ms: number;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

type FetchLike = typeof fetch;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECEIPT_TEXT = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

function gatewayApiBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("ZahyPi activation gateway URL is invalid");
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "" || path === "/") {
    url.pathname = "/v1";
  } else if (path !== "/v1") {
    throw new Error("ZahyPi activation gateway URL path is invalid");
  }
  return url.toString().replace(/\/$/, "");
}

async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("ZahyPi activation response is not JSON");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("ZahyPi activation response is empty");
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > 64_000) {
      await reader.cancel();
      throw new Error("ZahyPi activation response is too large");
    }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("ZahyPi activation response is invalid");
  }
  return parsed as Record<string, unknown>;
}

function evidenceFromJob(job: Record<string, unknown>): ActivationEvidence {
  if (job.status !== "completed") throw new Error("ZahyPi activation job did not complete");
  if (typeof job.run_manifest_id !== "string" || !UUID.test(job.run_manifest_id)) {
    throw new Error("ZahyPi activation job is missing a valid run manifest");
  }
  if (typeof job.job_id !== "string" || !UUID.test(job.job_id)) throw new Error("ZahyPi activation job ID is invalid");
  if (typeof job.trace_id !== "string" || !RECEIPT_TEXT.test(job.trace_id)) throw new Error("ZahyPi activation trace is invalid");
  if (typeof job.route !== "string" || !RECEIPT_TEXT.test(job.route)) throw new Error("ZahyPi activation route is invalid");
  if (!Number.isInteger(job.duration_ms) || Number(job.duration_ms) < 0 || Number(job.duration_ms) > 86_400_000) {
    throw new Error("ZahyPi activation duration is invalid");
  }
  const usage = job.usage;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) throw new Error("ZahyPi activation usage is invalid");
  const normalizedUsage = {} as ActivationEvidence["usage"];
  for (const field of ["prompt_tokens", "completion_tokens", "total_tokens"] as const) {
    const value = (usage as Record<string, unknown>)[field];
    if (!Number.isInteger(value) || Number(value) < 0) throw new Error("ZahyPi activation usage is invalid");
    normalizedUsage[field] = Number(value);
  }
  if (normalizedUsage.total_tokens < Math.max(normalizedUsage.prompt_tokens, normalizedUsage.completion_tokens)) {
    throw new Error("ZahyPi activation usage totals are invalid");
  }
  return {
    job_id: job.job_id,
    trace_id: job.trace_id,
    run_manifest_id: job.run_manifest_id,
    route: job.route,
    duration_ms: Number(job.duration_ms),
    usage: normalizedUsage,
  };
}

export function createActivationVerifier({
  fetchImpl = fetch,
  timeoutMs = 10_000,
}: {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
} = {}) {
  async function verify({
    credential,
    activationId,
    generation,
  }: {
    credential: ActiveConnectorCredential;
    activationId: string;
    generation: number;
  }): Promise<ActivationEvidence> {
    if (credential.generation !== generation) throw new Error("ZahyPi activation generation mismatch");
    const taskType = credential.taskTypes.includes("sari.reply")
      ? "sari.reply"
      : credential.taskTypes[0];
    if (!taskType) throw new Error("ZahyPi activation has no task types");
    const contract = resolveSariTaskType(taskType);
    const tenant = `activation-${activationId}`;
    const traceId = `activation-trace-g${generation}`;
    const idempotencyKey = `${activationId}:verify:g${generation}`;
    const deadline = Date.now() + timeoutMs;
    const apiBaseUrl = gatewayApiBaseUrl(credential.baseUrl);
    const headers = {
      Authorization: `Bearer ${credential.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-ZahyPi-Project": credential.projectId,
      "X-ZahyPi-Tenant": tenant,
      "X-Task-Type": contract.taskType,
      "X-Trace-ID": traceId,
      "X-Data-Classification": contract.dataClassification,
      "X-External-Processing": contract.externalProcessing,
      "Idempotency-Key": idempotencyKey,
    };
    const input = { ...contract.sampleInput, operationId: tenant };

    async function request(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("ZahyPi activation verification timed out");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      try {
        const response = await fetchImpl(url, {
          redirect: "error",
          ...init,
          headers: init?.headers ?? headers,
          signal: controller.signal,
        });
        const body = await boundedJson(response);
        if (!response.ok) throw new Error(`ZahyPi activation request failed with HTTP ${response.status}`);
        return body;
      } finally {
        clearTimeout(timer);
      }
    }

    let job = await request(`${apiBaseUrl}/jobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ task_type: contract.taskType, input }),
    });
    const jobId = job.job_id;
    if (typeof jobId !== "string" || !UUID.test(jobId)) throw new Error("ZahyPi activation job ID is invalid");

    while (job.status === "queued" || job.status === "running") {
      if (Date.now() + 100 >= deadline) throw new Error("ZahyPi activation verification timed out");
      await delay(100);
      job = await request(`${apiBaseUrl}/jobs/${jobId}`, {
        method: "GET",
        headers,
      });
      if (job.job_id !== jobId) throw new Error("ZahyPi activation job identity changed");
    }

    return evidenceFromJob(job);
  }

  return { verify };
}

export const activationVerifier = createActivationVerifier();
