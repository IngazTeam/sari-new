# Sari ZahyPi Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sari expose a secure ZahyPi one-click connector and execute all text/decision AI through governed task contracts.

**Architecture:** Sari owns a typed task catalog and submits business inputs to ZahyPi jobs. Signed bootstrap and verify endpoints install generation-scoped encrypted credentials and prove a real tenant-isolated job before activation. OpenAI remains explicit rollback plus voice and embeddings.

**Tech Stack:** Node.js 22.17, TypeScript, Express, MySQL 8.4, Drizzle ORM, Vitest, React/tRPC.

**Spec:** `/Users/omarhamdy/Documents/GitHub/zahypi-platform/docs/superpowers/specs/2026-08-29-sari-governed-one-click-design.md`

## Global Constraints

- Do not modify or commit unrelated worktree changes.
- Do not deploy while either Sari GitHub Actions job is red.
- Do not create a permanent staging environment.
- Do not log or return raw API keys, HMAC secrets, prompts, model responses or customer data.
- Use `FIELD_ENCRYPTION_KEY` for stored credentials; production fails closed if it is absent.
- All customer AI requests carry project, merchant tenant, task type, trace and idempotency context.
- Red data never falls back automatically to OpenAI.

---

### Task 1: Restore a Green Sari Baseline

**Files:**
- Modify only the files proven by the current failing CI logs.
- Test: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: GitHub Actions run for current `origin/main`.
- Produces: one green quality/build job and one green MySQL integration job.

- [ ] **Step 1: Capture the current failing assertions**

Run:

```bash
gh run list --repo IngazTeam/sari-new --branch main --limit 1
gh run view <run-id> --repo IngazTeam/sari-new --log-failed
```

Expected: every failure is mapped to a specific test, schema or MySQL query.

- [ ] **Step 2: Reproduce only the failing contract locally**

Run the named Vitest file against MySQL 8.4. Expected: the same assertion or database code fails.

- [ ] **Step 3: Add or correct the smallest regression test, then the root implementation**

Do not weaken schema constraints or skip integration tests. Preserve Drizzle error wrapping in tests
by asserting `error.cause.code` where appropriate.

- [ ] **Step 4: Run both release gates**

```bash
pnpm check
pnpm pretest:release
pnpm test:release
pnpm db:check
pnpm build
```

- [ ] **Step 5: Commit only the baseline fix files**

```bash
git add <exact-baseline-files>
git commit -m "fix: restore sari release gates"
```

### Task 2: Add the Canonical Sari Task Catalog

**Files:**
- Create: `server/ai/task-catalog.ts`
- Create: `server/ai/task-catalog.test.ts`
- Create: `docs/integrations/zahypi/README.md`
- Create: `scripts/build-zahypi-requirements-pack.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `SARI_TASK_CATALOG`, `resolveSariTaskType(name)`, `activeSariTaskTypes()` and a deterministic requirements ZIP builder.

- [ ] **Step 1: Write catalog contract tests**

Tests require unique canonical names, valid `sari.*` syntax, aliases that cannot collide, bounded
schemas, at least five golden and five rejection cases, and no active `sari.invoke` task.

- [ ] **Step 2: Verify the tests fail because the catalog is absent**

```bash
pnpm vitest run server/ai/task-catalog.test.ts
```

- [ ] **Step 3: Implement the typed catalog and alias resolver**

```ts
export type SariTaskContract = {
  taskType: `sari.${string}`;
  aliases: readonly `sari.${string}`[];
  execution: "sync" | "async";
  dataClassification: "green" | "amber" | "red";
  externalProcessing: "allow" | "deny";
  humanReviewRequired: boolean;
  timeoutMs: number;
  fallback: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  goldenCases: readonly Record<string, unknown>[];
  rejectionCases: readonly Record<string, unknown>[];
};
```

- [ ] **Step 4: Build a deterministic pack from the catalog**

The script writes the required eight files per task, inventory, security matrix, code/UI map,
manifest and SHA-256 list to a temporary directory, then emits one ZIP. It rejects secrets,
symlinks, absolute paths, duplicate names and output larger than 1.5 MB.

- [ ] **Step 5: Run and validate the pack**

```bash
pnpm zahypi:pack
unzip -t artifacts/SARI_ZAHYPI_REQUIREMENTS_PACK_2026-08-29.zip
```

- [ ] **Step 6: Commit the catalog and deterministic builder**

```bash
git add server/ai/task-catalog.ts server/ai/task-catalog.test.ts docs/integrations/zahypi/README.md scripts/build-zahypi-requirements-pack.mjs package.json
git commit -m "feat(ai): define governed sari task catalog"
```

### Task 3: Add Connector Storage and Credential Resolution

**Files:**
- Create: `drizzle/0050_zahypi_connector_state.sql`
- Create: `drizzle/schema_zahypi_connector.ts`
- Create: `server/integrations/zahypi-connector/repository.ts`
- Create: `server/integrations/zahypi-connector/repository.test.ts`
- Modify: `drizzle/schema.ts`
- Modify: `server/db_ai_settings.ts`

**Interfaces:**
- Produces: `activateConnectorCredential`, `getActiveConnectorCredential`, `reserveConnectorReceipt`, `completeConnectorReceipt`, `resolveZahyPiRuntimeConfig` source `connector|database|environment`.

- [ ] **Step 1: Write failing repository tests**

Cover encrypted storage, one active generation, downgrade rejection, exact replay, conflicting replay,
superseding, no key in DTOs and fail-closed decryption.

- [ ] **Step 2: Add migration and Drizzle schema**

Create credentials and receipts with the unique keys and indexes defined in the spec. The migration
is additive and has no destructive down operation in production automation.

- [ ] **Step 3: Implement transaction-safe repository operations**

Use one MySQL connection for `SELECT ... FOR UPDATE`, supersede and insert. Hash task lists from
their sorted canonical JSON representation.

- [ ] **Step 4: Give connector credentials runtime precedence**

The resolver returns only presence, prefix and source to administrative consumers; decryption occurs
only at the outbound ZahyPi boundary.

- [ ] **Step 5: Run focused and schema tests**

```bash
pnpm vitest run server/integrations/zahypi-connector/repository.test.ts server/ai-settings-secrets-pentest.test.ts
pnpm db:check
```

- [ ] **Step 6: Commit storage and resolution**

```bash
git add drizzle/0050_zahypi_connector_state.sql drizzle/schema_zahypi_connector.ts drizzle/schema.ts server/integrations/zahypi-connector/repository.ts server/integrations/zahypi-connector/repository.test.ts server/db_ai_settings.ts
git commit -m "feat(ai): store one-click zahypi credentials"
```

### Task 4: Add Signed Bootstrap and Verify Endpoints

**Files:**
- Create: `server/integrations/zahypi-connector/protocol.ts`
- Create: `server/integrations/zahypi-connector/routes.ts`
- Create: `server/integrations/zahypi-connector/activation-verifier.ts`
- Create: `server/integrations/zahypi-connector/protocol.test.ts`
- Create: `server/integrations/zahypi-connector/routes.test.ts`
- Modify: `server/_core/index.ts`
- Modify: `server/_core/validateEnv.ts`

**Interfaces:**
- Produces: Express routers for `/zahypi/bootstrap`, `/zahypi/verify`, `/api/zahypi/bootstrap`, `/api/zahypi/verify`.

- [ ] **Step 1: Write failing signature and endpoint tests**

Cover valid requests, 300-second freshness, malformed/changed body, duplicate JSON keys, wrong
project, unknown fields, bad generation, bad hashes, missing/wrong idempotency, 64 KB limit,
non-JSON content, exact/conflicting replay and sanitized errors.

- [ ] **Step 2: Implement canonical signing and strict parsing**

```ts
export function connectorSignature(secret: string, timestamp: string, raw: Buffer): string {
  return `v1=${createHmac("sha256", secret).update(timestamp).update("\n").update(raw).digest("hex")}`;
}
```

Use `timingSafeEqual` only after equal-length validation.

- [ ] **Step 3: Mount raw-body routes before global JSON parsing**

Use route-specific `express.raw({ type: "application/json", limit: "64kb" })` and a dedicated
rate limiter. Never reconstruct signed bytes with `JSON.stringify(req.body)`.

- [ ] **Step 4: Implement live verification**

Submit `admin.health` as a synthetic activation tenant with generation-bound idempotency, poll the
exact job to terminal state, and return only job ID, trace ID, run manifest ID, route, duration and
token counts.

- [ ] **Step 5: Run endpoint, security and environment tests**

```bash
pnpm vitest run server/integrations/zahypi-connector/protocol.test.ts server/integrations/zahypi-connector/routes.test.ts server/_core/validateEnv-zahypi.test.ts
```

- [ ] **Step 6: Commit the connector HTTP boundary**

```bash
git add server/integrations/zahypi-connector server/_core/index.ts server/_core/validateEnv.ts
git commit -m "feat(ai): expose signed zahypi activation connector"
```

### Task 5: Route Business AI Through Governed Jobs

**Files:**
- Modify: `server/ai/zahypi-client.ts`
- Modify: `server/ai/openai.ts`
- Modify: every production call site identified by `rg "taskType:" server --glob '!**/*.test.ts'`
- Test: `server/ai/zahypi-client.test.ts`
- Test: `server/ai/openai-zahypi.test.ts`
- Create: `server/ai/zahypi-governed-jobs.test.ts`

**Interfaces:**
- Produces: `requestZahyPiTask(contract, businessInput, messages, context)` with bounded submit/poll and validated output.

- [ ] **Step 1: Write failing governed-job tests**

Assert `/v1/jobs`, task and tenant headers, business input, idempotency, polling, manifest presence,
terminal error handling, 429 retry, timeout, circuit breaker and no automatic OpenAI fallback.

- [ ] **Step 2: Implement submit and bounded polling**

Use the task contract timeout, exponential bounded poll, abort propagation and one idempotency key
per caller operation. A successful task requires `run_manifest_id` and a schema-valid result.

- [ ] **Step 3: Replace free-form task strings with catalog constants**

Map `sari.action.selection` to `sari.sales.next-best-action`; remove production use of `sari.invoke`.
Each caller supplies a bounded business input rather than a database record dump.

- [ ] **Step 4: Keep OpenAI isolated to explicit modes**

Text uses OpenAI only when the selected text provider is `openai`. Whisper and embeddings continue
to call OpenAI regardless of text provider. Provider change clears cached configuration and is audited.

- [ ] **Step 5: Run all AI integration tests**

```bash
pnpm vitest run server/ai/task-catalog.test.ts server/ai/zahypi-client.test.ts server/ai/zahypi-context-propagation.test.ts server/ai/openai-zahypi.test.ts server/ai/zahypi-governed-jobs.test.ts server/_core/llm-zahypi.test.ts server/_core/trpc-zahypi.test.ts
```

- [ ] **Step 6: Commit governed runtime routing**

Stage only the AI files reported by `git diff --name-only` and commit:

```bash
git commit -m "feat(ai): execute sari tasks through zahypi foundry"
```

### Task 6: Improve Admin Truth and Rollback Controls

**Files:**
- Modify: `server/routers-ai-settings.ts`
- Modify: `client/src/pages/admin/AISettings.tsx`
- Test: `server/ai-settings-secrets-pentest.test.ts`
- Create: `server/ai-provider-audit-pentest.test.ts`

**Interfaces:**
- Produces: actual provider, credential source, activation generation, task count, last verification and explicit rollback mutation.

- [ ] **Step 1: Write failing truth and authorization tests**

Require admin permission, no secret return, clear separation between text and voice/embedding,
activation evidence and an audit record for every provider switch.

- [ ] **Step 2: Implement factual settings DTO and rollback mutation**

The UI cannot edit a connector key. It may test it, inspect prefix/source, activate ZahyPi after
verification, or explicitly roll text back to OpenAI.

- [ ] **Step 3: Run focused UI/backend tests and build**

```bash
pnpm vitest run server/ai-settings-secrets-pentest.test.ts server/ai-provider-audit-pentest.test.ts
pnpm check
pnpm build
```

- [ ] **Step 4: Commit admin controls**

```bash
git add server/routers-ai-settings.ts client/src/pages/admin/AISettings.tsx server/ai-settings-secrets-pentest.test.ts server/ai-provider-audit-pentest.test.ts
git commit -m "feat(ai): expose truthful zahypi activation controls"
```

### Task 7: Release and Production Proof

**Files:**
- Modify: `docs/PRODUCTION_RELEASE_RUNBOOK.md`
- Create: `docs/SARI_ZAHYPI_PRODUCTION_EVIDENCE_AR_2026-08-29.md`

**Interfaces:**
- Produces: deployed SHA, backup/restore proof, migration proof, activation receipt, tenant A/B tests and rollback evidence.

- [ ] **Step 1: Require green remote CI and a clean exact SHA**

- [ ] **Step 2: Take an encrypted backup and restore it into a temporary isolated MySQL database**

Apply migrations 9 through 50, run pre/postflights and the connector E2E suite, then destroy only
the explicitly named temporary database after evidence is recorded.

- [ ] **Step 3: Deploy with the canonical production script**

Use `scripts/deploy-production.sh` with the exact SHA, verified backup reference and secret files.
Do not use `git pull && pm2 restart` or build inside the serving rollback directory.

- [ ] **Step 4: Run internal production canary**

Verify one synchronous reply, one next action, one asynchronous analysis and one outcome. Repeat
with two merchants and assert cross-tenant 404. Verify 401, 403, 429, timeout and circuit-open paths.

- [ ] **Step 5: Prove rollback and return to ZahyPi**

Switch text to OpenAI, run one synthetic text task, verify Whisper/embedding unchanged, switch back
to the verified ZahyPi generation and confirm a new trace.

- [ ] **Step 6: Commit only the evidence and runbook update**

```bash
git add docs/PRODUCTION_RELEASE_RUNBOOK.md docs/SARI_ZAHYPI_PRODUCTION_EVIDENCE_AR_2026-08-29.md
git commit -m "docs: record sari zahypi production activation"
```

