import { parseAgentKeywords } from "./virtual-agent-form";

type RoutableAgent = {
  id: number;
  isActive: boolean | number;
  isDefault: boolean | number;
  sortOrder: number;
  triggerKeywords: unknown;
  shiftStart?: string | null;
  shiftEnd?: string | null;
};
export function agentLocalTime(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}
export function isAgentOnShift(
  start: string | null | undefined,
  end: string | null | undefined,
  time: string
) {
  if (!start && !end) return true;
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (
    !start ||
    !end ||
    !valid.test(start) ||
    !valid.test(end) ||
    !valid.test(time) ||
    start === end
  )
    return false;
  return start < end
    ? time >= start && time < end
    : time >= start || time < end;
}
export function selectVirtualAgent<T extends RoutableAgent>(
  agents: readonly T[],
  message: string,
  time = agentLocalTime()
) {
  const available = agents
    .filter(
      a => Boolean(a.isActive) && isAgentOnShift(a.shiftStart, a.shiftEnd, time)
    )
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const text = message.toLocaleLowerCase().trim();
  const matched = text
    ? available.find(a =>
        parseAgentKeywords(a.triggerKeywords).some(k =>
          text.includes(k.toLocaleLowerCase())
        )
      )
    : undefined;
  if (matched) return { agent: matched, reason: "keyword" as const };
  const preferred = available.find(a => Boolean(a.isDefault));
  if (preferred) return { agent: preferred, reason: "default" as const };
  return available[0]
    ? { agent: available[0], reason: "order" as const }
    : null;
}
export function moveAgentIds(
  ids: readonly number[],
  id: number,
  direction: -1 | 1
) {
  const next = [...ids],
    from = next.indexOf(id),
    to = from + direction;
  if (from < 0 || to < 0 || to >= next.length) return next;
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function isCompleteAgentOrder(
  existingIds: readonly number[],
  orderedIds: readonly number[]
) {
  return (
    existingIds.length === orderedIds.length &&
    new Set(orderedIds).size === orderedIds.length &&
    orderedIds.every(id => existingIds.includes(id))
  );
}
