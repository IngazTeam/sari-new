import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import type { PersonaPreviewModel } from "./persona-preview-model";
export const PersonaPreviewContext = createContext<PersonaPreviewModel | null>(
  null
);
function useModel() {
  const model = useContext(PersonaPreviewContext);
  if (!model) throw Error("Persona preview context missing");
  useSyncExternalStore(model.subscribe, model.snapshot);
  return model;
}
function useMutation(
  name: "saveReviewed" | "delete" | "reorder" | "seedTemplates" | "preview",
  callbacks: any = {}
) {
  const model = useModel(),
    [isPending, setPending] = useState(false);
  const mutateAsync = async (input: any) => {
    setPending(true);
    try {
      const result =
        name === "saveReviewed"
          ? await model.save(input)
          : name === "preview"
            ? {
                response:
                  "مثال ثابت لتصميم الرد فقط · Fixed sample reply for layout only.",
                source: "guardrail" as const,
                historyMessageCount: input.history?.length ?? 0,
                historyTruncated: false,
              }
            : await model.action(name, input);
      callbacks.onSuccess?.(result, input);
      return result;
    } catch (error) {
      callbacks.onError?.(error);
      throw error;
    } finally {
      setPending(false);
      callbacks.onSettled?.();
    }
  };
  return {
    isPending,
    mutateAsync,
    mutate: (input: any) => {
      void mutateAsync(input).catch(() => {});
    },
  };
}
export const trpc: any = {
  useUtils: () => {
    const model = useModel();
    return {
      virtualAgents: {
        list: { invalidate: async () => model.notify() },
        listReview: { invalidate: async () => model.notify() },
        getSaveReceipt: { fetch: (input: any) => model.receipt(input) },
      },
    };
  },
  virtualAgents: {
    listReview: {
      useQuery: () => {
        const model = useModel();
        try {
          return {
            data: model.list(),
            isLoading: false,
            isError: false,
            refetch: async () => {
              try {
                return { data: model.list() };
              } catch (error) {
                return { error };
              }
            },
          };
        } catch {
          return {
            data: undefined,
            isLoading: false,
            isError: true,
            refetch: async () => {
              model.mode = "normal";
              model.notify();
              try {
                return { data: model.list() };
              } catch (error) {
                return { error };
              }
            },
          };
        }
      },
    },
    ...Object.fromEntries(
      ["saveReviewed", "delete", "reorder", "seedTemplates", "preview"].map(
        name => [
          name,
          {
            useMutation: (callbacks: any) =>
              useMutation(name as Parameters<typeof useMutation>[0], callbacks),
          },
        ]
      )
    ),
  },
  ai: {
    chat: {
      useMutation: (callbacks: any) => useMutation("preview", callbacks),
    },
  },
};
