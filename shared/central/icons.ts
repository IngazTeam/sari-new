const paths: Record<string, string> = {
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
  "arrow-up-left": '<path d="M17 17 7 7m0 10V7h10"/>',
  "arrow-left": '<path d="M19 12H5m7-7-7 7 7 7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  "double-check": '<path d="m2 12 4 4L16 6m-5 8 2 2L23 6"/>',
  sparkles:
    '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3ZM20 2v4m-2-2h4"/>',
  bag: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  store:
    '<path d="m4 3-2 6a3 3 0 0 0 5 2 3 3 0 0 0 5 0 3 3 0 0 0 5 0 3 3 0 0 0 5-2l-2-6H4ZM4 12v9h16v-9M9 21v-6h6v6M7 3l-1 6m6-6v6m5-6 1 6"/>',
  messages:
    '<path d="M21 11a7 7 0 0 1-7 7H9l-5 3v-7a7 7 0 0 1 0-11h10a7 7 0 0 1 7 7v1Z"/><path d="M8 8h9M8 12h5"/>',
  users:
    '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M17 3a4 4 0 0 1 0 8m2 3a6 6 0 0 1 3 5v2"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-3 0h6"/>',
  "credit-card":
    '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20M6 15h4m3 0h2"/>',
  "graduation-cap":
    '<path d="m2 9 10-6 10 6-10 6L2 9Zm4 3v5c4 3 8 3 12 0v-5m4-3v8"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-14 5h3m4 0h3"/>',
  "shield-check":
    '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/>',
  whatsapp:
    '<path d="M21 11.7A9 9 0 0 1 7.2 19.5L2 21l1.5-5.2A9 9 0 1 1 21 11.7Z"/><path d="M8.3 6.8c-.8.2-1.4 1.1-1 2.5.8 2.8 3.2 5.2 6 6 1.4.4 2.3-.2 2.5-1l-2.5-1.4-.9.9a9.4 9.4 0 0 1-3-3l.9-.9-1.4-2.5-.6-.6Z"/>',
  qr: '<path d="M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0h2v2h-2zm6 0v6h-6m-2-10v2m6-2h2M3 12h4m5-9v4m0 14v-4"/>',
  "book-open":
    '<path d="M12 5C9 3 6 3 2 4v16c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v16"/>',
  sliders:
    '<path d="M4 21v-7m0-4V3m8 18V9m0-4V3m8 18v-3m0-4V3M1 10h6m2-5h6m2 9h6"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>',
  send: '<path d="m22 2-7 20-4-9L2 9l20-7Zm0 0L11 13"/>',
  rotate: '<path d="M3 10a9 9 0 1 1 2 8M3 3v7h7"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chart: '<path d="M3 3v18h18M7 16v-5m5 5V7m5 9V4"/>',
  leaf: '<path d="M20 3c-9 0-16 1-16 9a8 8 0 0 0 8 8c8 0 8-8 8-17ZM3 21 15 9"/>',
  zap: '<path d="m13 2-9 12h7l-1 8L21 9h-8l1-7"/>',
};
export function icon(name: string, extraClass = "") {
  return `<svg class="${extraClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sparkles}</svg>`;
}
