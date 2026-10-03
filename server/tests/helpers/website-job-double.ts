import { randomUUID } from "node:crypto";
/** Provider-pipeline tests use this isolated store double; persistence/fences are tested in MySQL. */
export function websiteJobDouble(merchant: (id: number) => Promise<any>) {
  const jobs = new Map<number, any>();
  return {
    begin: async (_actor: number, merchantId: number, jobId: string) => {
      const existing = jobs.get(merchantId);
      if (
        existing &&
        (existing.jobId === jobId || existing.status === "running")
      )
        return {
          created: false,
          jobId: existing.jobId,
          alreadyRunning: existing.status === "running",
          execution: null,
        };
      jobs.set(merchantId, {
        merchantId,
        jobId,
        status: "running",
        progress: 0,
        currentStep: "scraping",
      });
      const record = await merchant(merchantId);
      return {
        created: true,
        jobId,
        alreadyRunning: false,
        execution: { merchantId, jobId, token: randomUUID() },
        merchant: record,
        websiteUrl: record.websiteUrl,
      };
    },
    read: async (_actor: number, merchantId: number, jobId: string) =>
      jobs.get(merchantId)?.jobId === jobId
        ? jobs.get(merchantId)
        : { merchantId, jobId, status: "idle" },
    advance: async (scope: any, currentStep?: string, progress?: number) => {
      if (currentStep)
        jobs.set(scope.merchantId, {
          merchantId: scope.merchantId,
          jobId: scope.jobId,
          status: "running",
          currentStep,
          progress,
        });
    },
    finish: async (scope: any, result: any) => {
      jobs.set(scope.merchantId, {
        ...result,
        merchantId: scope.merchantId,
        jobId: scope.jobId,
        status: "completed",
      });
    },
    fail: async (scope: any) => {
      jobs.set(scope.merchantId, {
        merchantId: scope.merchantId,
        jobId: scope.jobId,
        status: "error",
        issue: "processing_failed",
      });
    },
  };
}
