export function parseWorkingDays(value: string): number[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .filter(part => /^[0-6]$/.test(part))
        .map(Number)
    )
  ).sort();
}
export function toggleWorkingDay(value: string, day: number) {
  const days = parseWorkingDays(value);
  if (!Number.isInteger(day) || day < 0 || day > 6) return days.join(",");
  return (
    days.includes(day)
      ? days.filter(item => item !== day)
      : [...days, day].sort()
  ).join(",");
}
