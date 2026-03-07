import { createLogger, serializeError } from 'homefs-shared';

export const logger = createLogger({ service: 'homefs-telegram-bot' });
export { serializeError };
