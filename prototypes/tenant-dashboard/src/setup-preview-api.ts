import { setup, useSetupVersion } from "./setup-preview-state";
import { useRef } from "react";
function query(
  read: () => unknown,
  enabled = true,
  progress = false,
  input: unknown = null
) {
  const version = useSetupVersion();
  const cache = useRef<
    { key: string; data: unknown; error: unknown } | undefined
  >(undefined);
  const key = JSON.stringify([version, enabled, input]);
  if (cache.current?.key !== key) {
    let data: unknown,
      error: unknown = null;
    try {
      if (enabled) data = read();
    } catch (e) {
      error = e;
    }
    cache.current = { key, data, error };
  }
  return {
    ...cache.current,
    isLoading: progress && setup.mode === "loading",
    isFetching: progress && setup.mode === "loading",
    isError: !!cache.current.error,
    refetch: async () => {
      setup.changed();
      return { data: read() };
    },
  };
}
const never = {
  useMutation: () => ({
    mutateAsync: async () => {
      throw Error("Provider calls are disabled in the local prototype");
    },
  }),
};
const invalidate = async () => {};
const utils = {
  setupWizard: {
    getProgress: { fetch: async () => setup.read() },
    completionReceipt: { fetch: setup.recover },
  },
  merchants: {
    getCurrent: { invalidate },
    getOnboardingStatus: { invalidate },
  },
  products: { list: { invalidate } },
  services: { list: { invalidate } },
};
export const trpc = {
  useUtils: () => utils,
  setupWizard: {
    getProgress: { useQuery: () => query(setup.read, true, true) },
    saveProgress: { useMutation: () => ({ mutateAsync: setup.save }) },
    reviewSetup: { useMutation: () => ({ mutateAsync: setup.review }) },
    completeSetup: { useMutation: () => ({ mutateAsync: setup.complete }) },
    getTemplates: {
      useQuery: (input: { language: string }) =>
        query(() => setup.templates(input.language), true, false, input),
    },
    previewTemplate: {
      useQuery: (
        input: { templateId: number; language: string },
        options: { enabled: boolean }
      ) => query(() => setup.template(input), options.enabled, false, input),
    },
  },
  analysis: {
    previewAnalysis: { useMutation: () => ({ mutateAsync: setup.website }) },
  },
  testSari: {
    createConversation: never,
    saveMessage: never,
    sendMessage: never,
    markAsDeal: never,
  },
};
