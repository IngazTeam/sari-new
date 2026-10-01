import { createContext, useContext, useSyncExternalStore } from "react";
import type { AssistantOptionPreviewModel } from "./assistant-option-preview-model";
export const AssistantOptionPreviewContext =
  createContext<AssistantOptionPreviewModel | null>(null);
function useModel() {
  const model = useContext(AssistantOptionPreviewContext);
  if (!model) throw Error("Missing option preview context");
  useSyncExternalStore(model.subscribe, model.snapshot);
  return model;
}
export const trpc: any = {
  auth: {
    me: {
      useQuery: () => {
        const model = useModel();
        return { data: { id: model.actorId } };
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
    return { botSettings: { get: { invalidate: async () => model.notify() } } };
  },
  botSettings: {
    get: {
      useQuery: () => {
        const model = useModel();
        try {
          return {
            data: model.settings(),
            isLoading: false,
            isError: false,
            refetch: () => model.review(),
          };
        } catch {
          return {
            data: undefined,
            isLoading: false,
            isError: true,
            refetch: () => model.review(),
          };
        }
      },
    },
    updateOption: {
      useMutation: () => {
        const model = useModel();
        return { mutateAsync: (input: unknown) => model.save(input) };
      },
    },
    takeoverWorkspace: {
      useQuery: ({ page }: { page: number }) => {
        const model = useModel();
        const refetch = async () => {
          if (model.mode === "list-error") model.mode = "normal";
          model.notify();
          return { data: model.listing(page) };
        };
        try {
          return {
            data: model.listing(page),
            isError: false,
            isLoading: false,
            isFetching: false,
            refetch,
          };
        } catch {
          return {
            data: undefined,
            isError: true,
            isLoading: false,
            isFetching: false,
            refetch,
          };
        }
      },
    },
  },
};
