export const trpc = new Proxy(
  {},
  {
    get() {
      throw Error("Live API is unavailable in this standalone prototype");
    },
  }
);
