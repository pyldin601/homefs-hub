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
