/** Database timestamp strings are UTC; browser form values are local time. */
export function parseMerchantDate(value: string | Date): Date {
  if (value instanceof Date) return new Date(value.getTime());
  return new Date(/[Zz]$|[+-]\d{2}:?\d{2}$/.test(value) ? value : value.replace(' ', 'T') + 'Z');
}

export function merchantDateTimeInput(value: string | Date | null): string {
  if (!value) return '';
  const date = parseMerchantDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
