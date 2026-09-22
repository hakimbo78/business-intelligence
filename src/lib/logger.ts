import { env } from '../config/environment.js';

type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export type LogContext = Record<string, unknown>;

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

/**
 * Convert Error instances into plain objects.
 *
 * `JSON.stringify(new Error('boom'))` yields `{}` because `message` and `stack`
 * are non-enumerable, which would silently discard every logged error.
 */
function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function serializeContext(context: LogContext): LogContext {
  const out: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = serializeValue(value);
  }
  return out;
}

/**
 * Lightweight structured logger.
 *
 * Outputs JSON lines to stdout for machine-readable logging.
 * Respects LOG_LEVEL from environment configuration.
 *
 * Two call shapes are accepted, so both the message-first and the pino-style
 * context-first convention used across the codebase are safe:
 *
 * ```ts
 * logger.info('Server started', { port });   // message first
 * logger.info({ port }, 'Server started');   // context first (pino style)
 * ```
 *
 * Per DEVELOPMENT_RULES.md §19:
 * - Logs request ID, project ID, agent, operation, duration, status, error, estimated cost
 * - NEVER logs secrets, passwords, or sensitive customer data
 */
class Logger {
  private readonly minLevel: number;

  constructor(level: LogLevel) {
    this.minLevel = LOG_LEVEL_PRIORITY[level];
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= this.minLevel;
  }

  /**
   * Normalize both accepted argument orders into a message plus context.
   */
  private normalize(
    first: string | LogContext,
    second?: string | LogContext
  ): { message: string; context?: LogContext } {
    if (typeof first === 'string') {
      return { message: first, context: second as LogContext | undefined };
    }
    return { message: typeof second === 'string' ? second : '', context: first };
  }

  private log(level: LogLevel, first: string | LogContext, second?: string | LogContext): void {
    if (!this.shouldLog(level)) return;

    const { message, context } = this.normalize(first, second);

    const entry = {
      level,
      time: new Date().toISOString(),
      msg: message,
      ...(context ? serializeContext(context) : {}),
    };

    const output = JSON.stringify(entry);

    if (LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY.error) {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  }

  fatal(message: string, context?: LogContext): void;
  fatal(context: LogContext, message?: string): void;
  fatal(first: string | LogContext, second?: string | LogContext): void {
    this.log('fatal', first, second);
  }

  error(message: string, context?: LogContext): void;
  error(context: LogContext, message?: string): void;
  error(first: string | LogContext, second?: string | LogContext): void {
    this.log('error', first, second);
  }

  warn(message: string, context?: LogContext): void;
  warn(context: LogContext, message?: string): void;
  warn(first: string | LogContext, second?: string | LogContext): void {
    this.log('warn', first, second);
  }

  info(message: string, context?: LogContext): void;
  info(context: LogContext, message?: string): void;
  info(first: string | LogContext, second?: string | LogContext): void {
    this.log('info', first, second);
  }

  debug(message: string, context?: LogContext): void;
  debug(context: LogContext, message?: string): void;
  debug(first: string | LogContext, second?: string | LogContext): void {
    this.log('debug', first, second);
  }

  trace(message: string, context?: LogContext): void;
  trace(context: LogContext, message?: string): void;
  trace(first: string | LogContext, second?: string | LogContext): void {
    this.log('trace', first, second);
  }
}

export const logger = new Logger(env.LOG_LEVEL);
