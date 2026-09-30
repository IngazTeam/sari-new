export function useLocation() {
  return [
    "/merchant/setup-wizard",
    (path: string) => {
      location.hash = "#/page" + path;
    },
  ] as const;
}
