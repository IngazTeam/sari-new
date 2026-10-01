const embeddedPages = new Set(['/knowledge-groups.html','/sales-knowledge.html','/brain-preview.html','/reply-quality.html','/knowledge-activity.html','/personas.html','/assistant-options.html','/assistant-settings.html','/dashboard.html','/sales-analytics.html','/messages-analytics.html','/inbox.html']);
export function previewPolicy(pathname, query) {
  const ancestor = embeddedPages.has(pathname) && query.get('embed') === 'brain' ? "'self'" : "'none'";
  const media = pathname === '/inbox.html' ? "; media-src 'self' blob:" : '';
  return `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors ${ancestor}${media}`;
}
