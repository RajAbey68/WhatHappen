/**
 * Lightweight, structured logger for the WhatHappen upload/processing flow.
 *
 * Design goals:
 *  - Single source of truth for log formatting, so grepping Cloud Run / Vercel
 *    logs stays easy.
 *  - Safe in every runtime edge case (no circular JSON throws, no secret leakage).
 *  - No external dependencies (keeps bundle and cold-start minimal).
 *
 * All errors thrown inside the upload and processing routes are routed through
 * `logError()` so the failure mode is visible in the same log stream, even when
 * the route later swallows the error and returns a sanitized client message.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: unknown
}

interface StructuredLog {
  timestamp: string
  level: LogLevel
  service: string
  operation: string
  message: string
  context?: LogContext
  error?: {
    name?: string
    message: string
    stack?: string
  }
}

const SERVICE_NAME = process.env.VERCEL_GIT_COMMIT_REF
  ? 'whathappen-web'
  : process.env.SERVICE_NAME || 'whathappen'

const isProduction = process.env.NODE_ENV === 'production'

/** Strip common secret-like keys before logging. */
function redactContext(context: LogContext | undefined): LogContext | undefined {
  if (!context) return undefined
  const redacted: LogContext = {}
  for (const [key, value] of Object.entries(context)) {
    const lower = key.toLowerCase()
    if (
      lower.includes('password') ||
      lower.includes('secret') ||
      lower.includes('token') ||
      lower.includes('key') ||
      lower.includes('passphrase') ||
      lower.includes('authorization') ||
      lower.includes('cookie')
    ) {
      redacted[key] = '[REDACTED]'
    } else {
      redacted[key] = value
    }
  }
  return redacted
}

function safeStringify(log: StructuredLog): string {
  try {
    return JSON.stringify(log)
  } catch {
    // Fallback for circular / non-serializable payloads.
    return JSON.stringify({
      ...log,
      context: '[unserializable]',
      error: log.error
        ? { name: log.error.name, message: log.error.message }
        : undefined,
    })
  }
}

function log(level: LogLevel, operation: string, message: string, context?: LogContext) {
  const entry: StructuredLog = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    operation,
    message,
    context: redactContext(context),
  }

  // In production we want a single JSON line per log for Cloud Logging / Vercel.
  // In development, readable multi-line console output is more useful.
  if (isProduction) {
    // eslint-disable-next-line no-console
    console.log(safeStringify(entry))
  } else {
    // eslint-disable-next-line no-console
    console[level](`[${level.toUpperCase()}] [${operation}] ${message}`, context || '')
  }
}

export function logDebug(operation: string, message: string, context?: LogContext) {
  log('debug', operation, message, context)
}

export function logInfo(operation: string, message: string, context?: LogContext) {
  log('info', operation, message, context)
}

export function logWarn(operation: string, message: string, context?: LogContext) {
  log('warn', operation, message, context)
}

export function logError(
  operation: string,
  message: string,
  error: unknown,
  context?: LogContext
): void {
  const normalized =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { message: String(error) }

  const entry: StructuredLog = {
    timestamp: new Date().toISOString(),
    level: 'error',
    service: SERVICE_NAME,
    operation,
    message,
    context: redactContext(context),
    error: normalized,
  }

  if (isProduction) {
    // eslint-disable-next-line no-console
    console.log(safeStringify(entry))
  } else {
    // eslint-disable-next-line no-console
    console.error(`[ERROR] [${operation}] ${message}`, { context, error: normalized })
  }
}

/** Convenience: log the start of an async operation and return a completion helper. */
export function logOperation(operation: string, context?: LogContext) {
  const start = Date.now()
  logInfo(operation, 'started', context)
  return {
    success: (message: string, extra?: LogContext) =>
      logInfo(operation, message, { ...context, ...extra, durationMs: Date.now() - start }),
    error: (message: string, error: unknown, extra?: LogContext) =>
      logError(operation, message, error, { ...context, ...extra, durationMs: Date.now() - start }),
  }
}
