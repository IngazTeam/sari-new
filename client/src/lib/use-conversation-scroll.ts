import { useLayoutEffect, useRef, useState } from "react";

/** Incoming polling must not move a reader away from the message they are reading. */
export function useConversationScroll(
  context: string,
  rows: ReadonlyArray<{ id: number }> | undefined,
  latest: boolean
) {
  // A cached response can arrive before the message panel mounts. A callback
  // ref reruns positioning when that panel becomes available with unchanged rows.
  const [end, endRef] = useState<HTMLDivElement | null>(null);
  const previous = useRef<
    { context: string; height: number; lastId: number | undefined } | undefined
  >(undefined);
  const [unseen, setUnseen] = useState(false);
  const jump = () => {
    const viewport = end?.closest("[data-radix-scroll-area-viewport]");
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
    setUnseen(false);
  };
  useLayoutEffect(() => {
    const viewport = end?.closest("[data-radix-scroll-area-viewport]");
    if (!viewport || !rows) {
      previous.current = undefined;
      setUnseen(false);
      return;
    }
    const before = previous.current,
      lastId = rows.at(-1)?.id;
    const changedContext = !before || before.context !== context;
    if (changedContext) {
      viewport.scrollTop = latest ? viewport.scrollHeight : 0;
      setUnseen(false);
    } else if (latest && before.lastId !== lastId) {
      if (before.height - viewport.scrollTop - viewport.clientHeight <= 72) {
        viewport.scrollTop = viewport.scrollHeight;
        setUnseen(false);
      } else setUnseen(true);
    }
    previous.current = { context, height: viewport.scrollHeight, lastId };
    // Radix enables the viewport's overflow after mounting its scrollbar.
    // Reapply the initial position once that first layout has completed.
    const frame = changedContext ? requestAnimationFrame(() => {
      if (previous.current?.context !== context) return;
      viewport.scrollTop = latest ? viewport.scrollHeight : 0;
      previous.current.height = viewport.scrollHeight;
    }) : undefined;
    const onScroll = () => {
      if (
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <=
        72
      )
        setUnseen(false);
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      viewport.removeEventListener("scroll", onScroll);
    };
  }, [context, end, rows, latest]);
  return { endRef, unseen, jump };
}
