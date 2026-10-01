import React, { useSyncExternalStore } from "react";
const subscribe = (listener: () => void) => {
  addEventListener("popstate", listener);
  return () => removeEventListener("popstate", listener);
};
export function useSearch() {
  return useSyncExternalStore(subscribe, () => location.search.slice(1));
}
export function updatePreviewSearch(params: URLSearchParams) {
  history.pushState(null, "", location.pathname + "?" + params.toString());
  dispatchEvent(new PopStateEvent("popstate"));
}
export function useLocation() {
  useSearch();
  return [
    "/merchant/message-analytics",
    (path: string) => {
      const params = new URLSearchParams(path.split("?")[1]);
      updatePreviewSearch(params);
    },
  ] as const;
}
export function Link({ href, ...props }: React.ComponentProps<"a">) {
  return <a {...props} href={"./#/page" + href} />;
}
