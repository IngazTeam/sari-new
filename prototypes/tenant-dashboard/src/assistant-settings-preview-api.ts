import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import type { AssistantSettingsPreviewModel } from "./assistant-settings-preview-model";
export const AssistantSettingsPreviewContext =
  createContext<AssistantSettingsPreviewModel | null>(null);
function useModel() {
  const model = useContext(AssistantSettingsPreviewContext);
  if (!model) throw Error("Missing settings preview");
  useSyncExternalStore(model.subscribe, model.snapshot);
  return model;
}
type Operation = "settings" | "discount" | "margin" | "preview" | "send";
function useMutation(operation: Operation, callbacks: any = {}) {
  const model = useModel(),
    [state, setState] = useState({
      isPending: false,
      isError: false,
      isSuccess: false,
    });
  const mutateAsync = async (input: any) => {
    setState({ isPending: true, isError: false, isSuccess: false });
    try {
      const result =
        operation === "settings"
          ? await model.save(input)
          : operation === "preview"
            ? await model.preview(input)
            : operation === "send"
              ? await model.sendTest()
              : await model.savePolicy(operation, input);
      setState({ isPending: false, isError: false, isSuccess: true });
      callbacks.onSuccess?.(result, input);
      return result;
    } catch (error) {
      setState({ isPending: false, isError: true, isSuccess: false });
      callbacks.onError?.(error, input);
      throw error;
    } finally {
      callbacks.onSettled?.();
    }
  };
  return {
    ...state,
    mutateAsync,
    mutate: (input: any) => {
      void mutateAsync(input).catch(() => {});
    },
    reset: () =>
      setState({ isPending: false, isError: false, isSuccess: false }),
  };
}
function useQuery(kind: "settings" | "status" | "discount" | "margin") {
  const model = useModel();
  const refetch = () =>
    kind === "settings"
      ? model.review()
      : kind === "status"
        ? model.refreshStatus()
        : model.reviewPolicy(kind);
  try {
    return {
      data:
        kind === "settings"
          ? model.settings()
          : kind === "status"
            ? model.status()
            : model.policy(kind),
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch,
    };
  } catch {
    return {
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      refetch,
    };
  }
}
export const trpc: any = {
  auth: {
    me: {
      useQuery: () => {
        const model = useModel();
        return {
          data: { id: model.actorId },
          refetch: async () => ({ data: { id: model.actorId } }),
        };
      },
    },
  },
  merchants: {
    getCurrent: {
      useQuery: () => {
        const model = useModel();
        return { data: { id: model.merchantId } };
      },
    },
  },
  useUtils: () => {
    const model = useModel();
    return {
      botSettings: {
        get: { invalidate: async () => model.notify() },
        shouldRespond: {
          invalidate: async () => {
            await model.refreshStatus();
          },
        },
      },
    };
  },
  botSettings: {
    get: { useQuery: () => useQuery("settings") },
    shouldRespond: { useQuery: () => useQuery("status") },
    update: {
      useMutation: (callbacks: any) => useMutation("settings", callbacks),
    },
    sendTestMessage: {
      useMutation: (callbacks: any) => useMutation("send", callbacks),
    },
    getDiscountPolicy: { useQuery: () => useQuery("discount") },
    getMarginPolicy: { useQuery: () => useQuery("margin") },
    updateDiscountPolicy: {
      useMutation: (callbacks: any) => useMutation("discount", callbacks),
    },
    updateMarginPolicy: {
      useMutation: (callbacks: any) => useMutation("margin", callbacks),
    },
  },
  ai: { chat: { useMutation: () => useMutation("preview") } },
  virtualAgents: { preview: { useMutation: () => useMutation("preview") } },
};
