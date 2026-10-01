import { createContext, useContext, useSyncExternalStore } from "react";
import { MessagesPreviewModel } from "./messages-preview-model";
export const MessagesPreviewContext =
  createContext<MessagesPreviewModel | null>(null);
function useRead(
  name: "merchant" | "messages",
  input: any,
  options?: { enabled?: boolean }
) {
  const model = useContext(MessagesPreviewContext);
  if (!model) throw Error("Missing local message model");
  useSyncExternalStore(model.subscribe, model.snapshot);
  if (options?.enabled === false)
    return {
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: async () => ({ data: undefined }),
    };
  return {
    ...model.read(name, input),
    refetch: () => model.refetch(name, input),
  };
}
export const trpc: any = {
  merchants: {
    getCurrent: {
      useQuery: (input: any, options: any) =>
        useRead("merchant", input, options),
    },
  },
  messageWorkspace: {
    read: {
      useQuery: (input: any, options: any) =>
        useRead("messages", input, options),
    },
  },
};
