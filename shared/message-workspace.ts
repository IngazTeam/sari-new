import { z } from "zod";
export const messageWorkspaceInput = z
  .object({ period: z.enum(["7d", "30d", "90d"]).default("30d") })
  .strict();
export type MessageWorkspaceInput = z.infer<typeof messageWorkspaceInput>;
export const messageKinds = ["text", "voice", "image", "document"] as const;
export const messageSentiments = [
  "positive",
  "negative",
  "neutral",
  "happy",
  "angry",
  "sad",
  "frustrated",
] as const;
/** N UTC calendar days including the current partial day, captured at whole-second precision. */
export function messageWindow(
  period: MessageWorkspaceInput["period"],
  now = new Date()
) {
  const days = Number(period.slice(0, -1));
  if (![7, 30, 90].includes(days)) throw Error("Invalid message period");
  const end = new Date(Math.floor(now.getTime() / 1000) * 1000),
    start = new Date(end);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const dates = Array.from({ length: days }, (_, i) =>
    new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10)
  );
  return {
    from: start.toISOString(),
    through: end.toISOString(),
    sqlFrom: start.toISOString().slice(0, 19).replace("T", " "),
    sqlThrough: end.toISOString().slice(0, 19).replace("T", " "),
    dates,
  };
}
