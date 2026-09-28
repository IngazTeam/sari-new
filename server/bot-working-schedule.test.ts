import { describe, expect, it } from "vitest";
import {
  getWorkingScheduleErrors,
  workingDaysSchema,
  workingTimeSchema,
} from "../shared/bot-working-schedule";

describe("working schedule contract", () => {
  const saved = {
    workingHoursEnabled: true,
    workingHoursStart: "09:00",
    workingHoursEnd: "18:00",
    workingDays: "1,2,3,4,5",
  };
  it.each(["99:99", "24:00", "09:60", "9:00", "", "09:00:00", "09:00\n"])(
    "rejects invalid time %s",
    time => {
      expect(workingTimeSchema.safeParse(time).success).toBe(false);
      expect(
        getWorkingScheduleErrors({ workingHoursStart: time }, saved)
      ).toMatchObject({ workingHoursStart: "time" });
    }
  );
  it.each(["NaN", "1,1", "7", "-1", "1,,2", "1, 2", "1\n"])(
    "rejects invalid days %s",
    days => {
      expect(workingDaysSchema.safeParse(days).success).toBe(false);
      expect(getWorkingScheduleErrors({ workingDays: days }, saved)).toEqual({
        workingDays: "days",
      });
    }
  );
  it("validates partial updates against previous endpoints", () => {
    expect(
      getWorkingScheduleErrors({ workingHoursEnd: "09:00" }, saved)
    ).toEqual({ workingHoursEnd: "differentTimes" });
    expect(
      getWorkingScheduleErrors(
        { workingHoursStart: "22:00", workingHoursEnd: "02:00" },
        saved
      )
    ).toEqual({});
  });
  it("accepts an empty week and permits disabling a legacy invalid schedule", () => {
    expect(getWorkingScheduleErrors({ workingDays: "" }, saved)).toEqual({});
    expect(
      getWorkingScheduleErrors(
        { workingHoursEnabled: false },
        { ...saved, workingHoursStart: "invalid" }
      )
    ).toEqual({});
    expect(
      getWorkingScheduleErrors({}, { ...saved, workingHoursStart: "invalid" })
    ).toEqual({});
    expect(
      getWorkingScheduleErrors(
        { workingHoursEnabled: true },
        { ...saved, workingHoursStart: "invalid" }
      )
    ).toEqual({ workingHoursStart: "time" });
  });
});
