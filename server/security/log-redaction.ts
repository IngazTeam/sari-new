const SENSITIVE_KEY = /(authorization|cookie|password|passwd|secret|token|api[_-]?key|access[_-]?key|refresh[_-]?token|message|content|payload|phone|email)/i;
const MAX_DEPTH = 5;
const MAX_STRING_LENGTH = 2_000;

function redactString(input: string): string {
  return input
    .slice(0, MAX_STRING_LENGTH)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+\b/gi, '[REDACTED_KEY]')
    .replace(/([?&](?:token|secret|password|api[_-]?key)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/(?<!\d)(?:\+|00)?\d[\d\s()-]{7,}\d(?!\d)/g, match => {
      const digits = match.replace(/\D/g, '');
      return digits.length >= 9 ? `***${digits.slice(-4)}` : match;
    });
}

export function redactLogValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      ...(process.env.NODE_ENV === 'development' && value.stack ? { stack: redactString(value.stack) } : {}),
    };
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);

    if (Array.isArray(value)) {
      return value.slice(0, 50).map(item => redactLogValue(item, depth + 1, seen));
    }

    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
      result[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactLogValue(child, depth + 1, seen);
    }
    return result;
  }

  return redactString(String(value));
}

let consoleRedactionInstalled = false;

/** Last-resort guard for legacy direct console calls in production. */
export function installProductionConsoleRedaction(): void {
  if (process.env.NODE_ENV !== 'production' || consoleRedactionInstalled) return;
  consoleRedactionInstalled = true;

  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[level].bind(console);
    console[level] = ((...args: unknown[]) => original(...args.map(arg => redactLogValue(arg)))) as typeof console[typeof level];
  }
}
