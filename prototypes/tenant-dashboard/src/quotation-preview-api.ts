import { useMemo } from "react";
import { model, templates, usePreviewVersion } from "./quotation-preview-state";
// This adapter exists only in the prototype build. It has no network implementation.
const reads: Record<string, (input: any) => any> = {
  templateWorkspace: input => templates.workspace(input),
  templateDetail: input => templates.detail(input.id),
  templateReceipt: input => templates.receipt(input.requestId),
  workspace: input => model.workspace(input),
  detail: input => model.detail(input.id),
  sendWorkspace: input => model.sendWorkspace(input.quotationId),
  receipt: input => model.receipt(input.requestId),
  review: input => {
    model.access(true);
    return model.reviews.get(input.requestId) ?? null;
  },
  delivery: input => {
    model.access(true);
    return model.deliveries.get(input.requestId) ?? null;
  },
};
const query = (name: string) => ({
  useQuery: (input: any, options?: { enabled?: boolean }) => {
    const version = usePreviewVersion(),
      key = JSON.stringify(input),
      enabled = options?.enabled !== false;
    const source = name.startsWith("template") ? templates : model;
    const result = useMemo(() => {
      if (!enabled || source.mode === "loading")
        return { data: undefined, error: null };
      try {
        return { data: reads[name](input), error: null };
      } catch (error) {
        return { data: undefined, error };
      }
    }, [version, key, enabled]);
    return {
      ...result,
      isFetching: enabled && source.mode === "loading",
      refetch: async () => {
        try {
          const data = reads[name](input);
          source.changed();
          return { data, error: null };
        } catch (error) {
          source.changed();
          return { data: undefined, error };
        }
      },
    };
  },
});
const mutation = (action: (input: any) => any) => ({
  useMutation: () => ({ mutateAsync: async (input: any) => action(input) }),
});
const api = {
  workspace: query("workspace"),
  detail: query("detail"),
  sendWorkspace: query("sendWorkspace"),
  create: mutation(input => model.mutate("create", input)),
  change: mutation(input => model.mutate("status", input)),
  target: mutation(input => model.mutate("target", input)),
  prepareReview: mutation(input => model.prepare(input)),
  sendReviewed: mutation(input => model.send(input)),
};
const utilities = Object.fromEntries(
  Object.entries(reads).map(([name, read]) => [
    name,
    {
      fetch: async (input: any) => read(input),
      invalidate: async () => {
        model.changed();
      },
    },
  ])
);
const templateUtilities = {
  workspace: utilities.templateWorkspace,
  detail: utilities.templateDetail,
  receipt: utilities.templateReceipt,
};
export const trpc = {
  sariBrain: {
    quotations: api,
    quotationTemplates: {
      workspace: query("templateWorkspace"),
      detail: query("templateDetail"),
      write: mutation(input => templates.write(input)),
    },
  },
  useUtils: () => ({
    sariBrain: {
      quotations: utilities,
      quotationTemplates: templateUtilities,
      getQuotationTemplates: { invalidate: async () => templates.changed() },
    },
  }),
};
