import { normalizeCustomerText } from "./customer-decision";

/** Questions, conditions and negations never authorize cancelling an existing commitment. */
export function requestedBookingCancellationId(text: string): number | null {
  const normalized = normalizeCustomerText(text).replace(/[٠-٩]/g, x =>
    String("٠١٢٣٤٥٦٧٨٩".indexOf(x))
  );
  const match =
    normalized.match(
      /^(?:(?:من فضلك|لو سمحت) )?(?:(?:اريد|ابغى|ابي|عايز|عاوز|بدي) الغاء|الغي?|الغاء) (?:الحجز|حجزي|الموعد|موعدي)(?: رقم)?\s*#?(\d+)(?: من فضلك)?[.!،]*$/
    ) ??
    normalized.match(
      /^(?:please )?(?:cancel|i want to cancel) (?:my |the )?(?:booking|appointment)(?: number)?\s*#?(\d+)(?: please)?[.!]*$/
    );
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
export function explicitBookingCancellation(text: string, bookingId: number) {
  return (
    Number.isSafeInteger(bookingId) &&
    bookingId > 0 &&
    requestedBookingCancellationId(text) === bookingId
  );
}
