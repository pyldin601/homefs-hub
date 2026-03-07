import { createLogger, serializeError } from 'homefs-shared';

export const logger = createLogger({ service: 'homefs-tool-server' });
export { serializeError };
