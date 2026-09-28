import { z } from "zod";

export const workingTimeSchema = z
  .string()
  .length(5)
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const workingDaysSchema = z
  .string()
  .max(13)
  .regex(/^(?:[0-6](?:,[0-6])*)?$/)
  .refine(
    value =>
      value === "" ||
      (value.split(",").every(day => day.length === 1) &&
        new Set(value.split(",")).size === value.split(",").length)
  );

export type BotWorkingSchedule = {
  workingHoursEnabled?: boolean | number | null;
  workingHoursStart?: string | null;
  workingHoursEnd?: string | null;
  workingDays?: string | null;
};
export type WorkingScheduleErrors = Partial<
  Record<
    "workingHoursStart" | "workingHoursEnd" | "workingDays",
    "time" | "differentTimes" | "days"
  >
>;

/** Validate the merged schedule, including partial API updates. Empty days mean
 * no scheduled replies. Overnight shifts are valid; equal endpoints are not. */
export function getWorkingScheduleErrors(
  patch: BotWorkingSchedule,
  previous: BotWorkingSchedule = {}
): WorkingScheduleErrors {
  const fields = [
    "workingHoursEnabled",
    "workingHoursStart",
    "workingHoursEnd",
    "workingDays",
  ] as const;
  if (!fields.some(field => patch[field] !== undefined)) return {};
  const merged = {
    ...previous,
    ...Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    ),
  };
  const enabled = Boolean(merged.workingHoursEnabled);
  const errors: WorkingScheduleErrors = {};
  for (const field of ["workingHoursStart", "workingHoursEnd"] as const) {
    if (
      (enabled || patch[field] !== undefined) &&
      !workingTimeSchema.safeParse(merged[field]).success
    )
      errors[field] = "time";
  }
  if (
    (enabled || patch.workingDays !== undefined) &&
    !workingDaysSchema.safeParse(merged.workingDays).success
  )
    errors.workingDays = "days";
  if (
    enabled &&
    !errors.workingHoursStart &&
    !errors.workingHoursEnd &&
    merged.workingHoursStart === merged.workingHoursEnd
  )
    errors.workingHoursEnd = "differentTimes";
  return errors;
}

export class InvalidWorkingScheduleError extends Error {
  constructor(readonly fields: WorkingScheduleErrors) {
    super("Review the working schedule");
    this.name = "InvalidWorkingScheduleError";
  }
}
