/**
 * Centralized Logger Module for Sari
 * Provides consistent logging with context and optional external service integration
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
    [key: string]: unknown;
}

interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: string;
    context?: LogContext;
    error?: Error;
}

/**
 * Format timestamp in ISO format
 */
function getTimestamp(): string {
    return new Date().toISOString();
}

/**
 * Format log entry for console output
 */
function formatLogEntry(entry: LogEntry): string {
    const { level, message, timestamp, context } = entry;
    const levelIcon = {
        debug: '🔍',
        info: '📘',
        warn: '⚠️',
        error: '❌',
    }[level];

    let output = `${levelIcon} [${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (context && Object.keys(context).length > 0) {
        output += ` | ${JSON.stringify(context)}`;
    }

    return output;
}

/**
 * Send log to external service (Sentry, Datadog, etc.)
 * Placeholder for future integration
 */
async function sendToExternalService(entry: LogEntry): Promise<void> {
    // Future: integrate with Sentry, Datadog, or other monitoring services
    // Example with Sentry:
    // if (entry.level === 'error' && entry.error) {
    //   Sentry.captureException(entry.error, { extra: entry.context });
    // }
}

/**
 * Log debug message (only in development)
 */
export function logDebug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'development') return;

    const entry: LogEntry = {
        level: 'debug',
        message,
        timestamp: getTimestamp(),
        context,
    };

    console.log(formatLogEntry(entry));
}

/**
 * Log info message
 */
export function logInfo(message: string, context?: LogContext): void {
    const entry: LogEntry = {
        level: 'info',
        message,
        timestamp: getTimestamp(),
        context,
    };

    console.log(formatLogEntry(entry));
}

/**
 * Log warning message
 */
export function logWarn(message: string, context?: LogContext): void {
    const entry: LogEntry = {
        level: 'warn',
        message,
        timestamp: getTimestamp(),
        context,
    };

    console.warn(formatLogEntry(entry));
}

/**
 * Log error message
 * This is the primary function for error tracking
 */
export function logError(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorObj = error instanceof Error ? error : undefined;

    const entry: LogEntry = {
        level: 'error',
        message,
        timestamp: getTimestamp(),
        context: {
            ...context,
            ...(errorObj && {
                errorName: errorObj.name,
                errorMessage: errorObj.message,
                stack: errorObj.stack,
            }),
        },
        error: errorObj,
    };

    console.error(formatLogEntry(entry));

    // Send to external service in production
    if (process.env.NODE_ENV === 'production') {
        sendToExternalService(entry).catch(console.error);
    }
}

/**
 * Create a child logger with preset context
 * Useful for adding request ID, user ID, etc.
 */
export function createChildLogger(defaultContext: LogContext) {
    return {
        debug: (message: string, context?: LogContext) =>
            logDebug(message, { ...defaultContext, ...context }),
        info: (message: string, context?: LogContext) =>
            logInfo(message, { ...defaultContext, ...context }),
        warn: (message: string, context?: LogContext) =>
            logWarn(message, { ...defaultContext, ...context }),
        error: (message: string, error?: Error | unknown, context?: LogContext) =>
            logError(message, error, { ...defaultContext, ...context }),
    };
}

/**
 * Express error handler middleware
 */
export function errorHandler(err: Error, req: any, res: any, next: any): void {
    logError('Unhandled request error', err, {
        method: req.method,
        path: req.path,
        query: req.query,
        ip: req.ip,
    });

    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message,
    });
}

// Log that logger is initialized
console.log('[Logger] ✅ Centralized logging initialized');
