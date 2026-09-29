import { z } from "zod";
const instant = z
  .string()
  .max(40)
  .refine(
    value =>
      z.string().datetime({ offset: true }).safeParse(value).success ||
      z.string().date().safeParse(value).success,
    "Use an ISO timestamp or UTC date"
  );
const at = (value: string, end = false) =>
  new Date(
    value.length === 10 ? value + (end ? "T23:59:59Z" : "T00:00:00Z") : value
  );
export const legacyMessageRangeInput = z
  .object({ startDate: instant.optional(), endDate: instant.optional() })
  .strict()
  .superRefine((value, ctx) => {
    if (Boolean(value.startDate) !== Boolean(value.endDate)) {
      ctx.addIssue({
        code: "custom",
        message: "Both range bounds are required",
      });
      return;
    }
    if (value.startDate && value.endDate) {
      const from = at(value.startDate),
        through = at(value.endDate, true),
        days =
          Math.floor(through.getTime() / 86400000) -
          Math.floor(from.getTime() / 86400000) +
          1;
      if (from > through || days > 90)
        ctx.addIssue({
          code: "custom",
          message: "Range must be ordered and include at most 90 UTC dates",
        });
    }
  });
export const legacyMessageLimitInput = z
  .object({ limit: z.number().int().min(1).max(50).default(10) })
  .strict();
export const legacyMessageDaysInput = z
  .object({ days: z.number().int().min(1).max(90).default(30) })
  .strict();
export function legacyMessageWindow(
  input: z.input<typeof legacyMessageRangeInput>,
  now = new Date(),
  days = 30
) {
  const selection = legacyMessageRangeInput.parse(input);
  legacyMessageDaysInput.parse({ days });
  const through = selection.endDate
      ? at(selection.endDate, true)
      : new Date(now),
    from = selection.startDate ? at(selection.startDate) : new Date(now);
  if (!selection.startDate) {
    from.setUTCHours(0, 0, 0, 0);
    from.setUTCDate(from.getUTCDate() - days + 1);
  }
  through.setTime(Math.floor(through.getTime() / 1000) * 1000);
  from.setTime(Math.floor(from.getTime() / 1000) * 1000);
  const first = new Date(from);
  first.setUTCHours(0, 0, 0, 0);
  const size =
    Math.floor(through.getTime() / 86400000) -
    Math.floor(from.getTime() / 86400000) +
    1;
  return {
    from: from.toISOString(),
    through: through.toISOString(),
    sqlFrom: from.toISOString().slice(0, 19).replace("T", " "),
    sqlThrough: through.toISOString().slice(0, 19).replace("T", " "),
    dates: Array.from({ length: size }, (_, i) =>
      new Date(first.getTime() + i * 86400000).toISOString().slice(0, 10)
    ),
  };
}
