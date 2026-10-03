export type OccasionType =
  | 'ramadan'
  | 'eid_fitr'
  | 'eid_adha'
  | 'national_day'
  | 'new_year'
  | 'hijri_new_year';

type OccasionDefinition = {
  name: string;
  discountPercent: number;
};

export type DetectedOccasion = OccasionDefinition & {
  type: OccasionType;
  year: number;
};

export type UpcomingOccasion = DetectedOccasion & {
  date: string;
  daysUntil: number;
};

const RIYADH_TIMEZONE = 'Asia/Riyadh';
const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_CALENDAR_SCAN_DAYS = 370;

const OCCASIONS: Record<OccasionType, OccasionDefinition> = {
  ramadan: { name: 'رمضان المبارك', discountPercent: 20 },
  eid_fitr: { name: 'عيد الفطر المبارك', discountPercent: 25 },
  eid_adha: { name: 'عيد الأضحى المبارك', discountPercent: 25 },
  national_day: { name: 'اليوم الوطني السعودي', discountPercent: 23 },
  new_year: { name: 'رأس السنة الميلادية', discountPercent: 15 },
  hijri_new_year: { name: 'رأس السنة الهجرية', discountPercent: 15 },
};

export const OCCASION_PREFIXES: Record<OccasionType, string> = {
  ramadan: 'RAMADAN',
  eid_fitr: 'EIDFITR',
  eid_adha: 'EIDADHA',
  national_day: 'NATIONAL',
  new_year: 'NEWYEAR',
  hijri_new_year: 'HIJRI',
};

const gregorianFormatter = new Intl.DateTimeFormat('en-u-ca-gregory-nu-latn', {
  timeZone: RIYADH_TIMEZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

const ummAlQuraFormatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
  timeZone: RIYADH_TIMEZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

function calendarParts(formatter: Intl.DateTimeFormat, date: Date): { year: number; month: number; day: number } {
  const values = Object.fromEntries(
    formatter.formatToParts(date)
      .filter(part => part.type === 'year' || part.type === 'month' || part.type === 'day')
      .map(part => [part.type, Number(part.value)]),
  );
  if (![values.year, values.month, values.day].every(Number.isSafeInteger)) {
    throw new Error('The runtime does not support the required Saudi calendar');
  }
  return { year: values.year, month: values.month, day: values.day };
}

function riyadhGregorianParts(date: Date) {
  return calendarParts(gregorianFormatter, date);
}

function riyadhDateKey(date: Date): string {
  const { year, month, day } = riyadhGregorianParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function riyadhNoon(date: Date): Date {
  const { year, month, day } = riyadhGregorianParts(date);
  return new Date(Date.UTC(year, month - 1, day, 9, 0, 0));
}

export function getOccasionDiscountPercentage(type: OccasionType): number {
  return OCCASIONS[type].discountPercent;
}

/** Detect every matching fixed/lunar occasion; two calendars may overlap. */
export function detectCurrentOccasions(at: Date = new Date()): DetectedOccasion[] {
  const gregorian = riyadhGregorianParts(at);
  const types: OccasionType[] = [];
  if (gregorian.month === 9 && gregorian.day === 23) types.push('national_day');
  if (gregorian.month === 1 && gregorian.day === 1) types.push('new_year');

  const hijri = calendarParts(ummAlQuraFormatter, at);
  if (hijri.month === 9) types.push('ramadan');
  else if (hijri.month === 10 && hijri.day >= 1 && hijri.day <= 4) types.push('eid_fitr');
  else if (hijri.month === 12 && hijri.day >= 10 && hijri.day <= 13) types.push('eid_adha');
  else if (hijri.month === 1 && hijri.day === 1) types.push('hijri_new_year');

  return types.map(type => ({ type, year: gregorian.year, ...OCCASIONS[type] }));
}

/** Compatibility helper for callers that need only the primary match. */
export function detectCurrentOccasion(at: Date = new Date()): DetectedOccasion | null {
  return detectCurrentOccasions(at)[0] ?? null;
}

/** Return today's active occasions or the next start within a bounded year. */
export function getUpcomingOccasions(at: Date = new Date()): UpcomingOccasion[] {
  const start = riyadhNoon(at);
  const upcoming = new Map<OccasionType, UpcomingOccasion>();

  for (let offset = 0; offset <= MAX_CALENDAR_SCAN_DAYS && upcoming.size < 6; offset += 1) {
    const cursor = new Date(start.getTime() + (offset * DAY_MS));
    const previousTypes = new Set(
      detectCurrentOccasions(new Date(cursor.getTime() - DAY_MS)).map(item => item.type),
    );
    for (const current of detectCurrentOccasions(cursor)) {
      if (upcoming.has(current.type) || (offset > 0 && previousTypes.has(current.type))) continue;
      upcoming.set(current.type, {
        ...current,
        date: riyadhDateKey(cursor),
        daysUntil: offset,
      });
    }
  }

  return Array.from(upcoming.values()).sort((left, right) => left.daysUntil - right.daysUntil);
}

export function getOccasionEndDate(type: OccasionType, at: Date): Date {
  let cursor = riyadhNoon(at);
  for (let offset = 1; offset <= 40; offset += 1) {
    const next = new Date(cursor.getTime() + DAY_MS);
    if (!detectCurrentOccasions(next).some(occasion => occasion.type === type)) {
      const { year, month, day } = riyadhGregorianParts(next);
      // Riyadh has a fixed UTC+3 offset and no daylight-saving transition.
      return new Date(Date.UTC(year, month - 1, day, -3, 0, 0) - 1);
    }
    cursor = next;
  }
  throw new Error('Unable to determine occasion end date');
}

export function generateOccasionMessage(
  occasionName: string,
  customerName: string | null,
  discountCode: string,
  discountPercent: number,
  businessName: string,
): string {
  const greeting = customerName ? `مرحباً ${customerName}!` : 'مرحباً!';
  return `${greeting}

🎉 *${occasionName}* 🎉

بمناسبة ${occasionName}، يسرنا في ${businessName} أن نقدم لك عرضاً خاصاً:

✨ *خصم ${discountPercent}%* على جميع منتجاتنا!

🎁 استخدم كود الخصم: *${discountCode}*

⏰ العرض محدود ولفترة محدودة فقط!

📦 تسوق الآن واستمتع بأفضل العروض

نتمنى لك ${occasionName} سعيداً! 🌙✨`;
}

