import { createLogger as createWinstonLogger, format, transports, type Logger } from 'winston';

type CreateLoggerOptions = {
  service: string;
  level?: string;
};

export const createLogger = (options: CreateLoggerOptions): Logger => {
  return createWinstonLogger({
    level: options.level ?? process.env.LOG_LEVEL ?? 'info',
    defaultMeta: { service: options.service },
    format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
    transports: [new transports.Console()],
  });
};

export const serializeError = (error: unknown): unknown => {
  if (!(error instanceof Error)) {
    return error;
  }

  const serialized: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  const errorWithCause = error as Error & { cause?: unknown };
  if (typeof errorWithCause.cause !== 'undefined') {
    serialized.cause = serializeError(errorWithCause.cause);
  }

  const errorRecord = error as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(errorRecord)) {
    if (!(key in serialized)) {
      serialized[key] = value;
    }
  }

  return serialized;
};
