import Redis from 'ioredis';
import Redlock from 'redlock';
import { ConversationMessageSchema, type ConversationMessage } from './conversation';
import { logger, serializeError } from './logger';

export type DelayedTask = {
  id: string;
  instruction: string;
  dueDateIso: string;
  sourceChatId: number;
  status: 'pending' | 'completed';
  createdAtIso: string;
};

export class ChatLockTimeoutError extends Error {
  constructor() {
    super('Timed out while waiting for chat lock');
    this.name = 'ChatLockTimeoutError';
  }
}

export class RedisService {
  private readonly client: Redis;
  private readonly redlockClient: Redis;
  private readonly keyPrefix: string;
  private readonly redlock: Redlock;

  constructor(options: { redisUrl: string; keyPrefix: string }) {
    this.client = new Redis(options.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    this.redlockClient = this.client.duplicate({
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    this.keyPrefix = options.keyPrefix;
    this.redlock = new Redlock([this.redlockClient], {
      retryCount: -1,
      retryDelay: 5_000,
      retryJitter: 300,
    });

    this.client.on('error', (error) => {
      logger.error('redis: client error', { error: serializeError(error) });
    });

    this.redlockClient.on('error', (error) => {
      logger.error('redis: redlock client error', { error: serializeError(error) });
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
    await this.redlockClient.connect();
  }

  async close(): Promise<void> {
    if (this.redlockClient.status !== 'end') {
      await this.redlockClient.quit();
    }

    if (this.client.status !== 'end') {
      await this.client.quit();
    }
  }

  async addMessageToChat(chatId: number, message: ConversationMessage): Promise<void> {
    const key = this.chatKey(chatId);
    await this.client.rpush(key, JSON.stringify(message));
  }

  async getChatMessages(chatId: number): Promise<ConversationMessage[]> {
    const key = this.chatKey(chatId);
    const values = await this.client.lrange(key, 0, -1);

    const messages: ConversationMessage[] = [];
    for (const value of values) {
      try {
        const json = JSON.parse(value);
        const parsed = ConversationMessageSchema.parse(json);
        messages.push(parsed);
      } catch (error) {
        logger.warn('redis: invalid chat message skipped', {
          chatId,
          error: serializeError(error),
        });
      }
    }

    return messages;
  }

  async clearChatMessages(chatId: number): Promise<void> {
    const key = this.chatKey(chatId);
    await this.client.del(key);
  }

  async saveDelayedTask(task: DelayedTask): Promise<void> {
    await this.client.hset(this.delayedTaskKey(task.sourceChatId, task.id), {
      id: task.id,
      instruction: task.instruction,
      dueDateIso: task.dueDateIso,
      sourceChatId: String(task.sourceChatId),
      status: task.status,
      createdAtIso: task.createdAtIso,
    });
  }

  async listDelayedTasks(chatId: number): Promise<DelayedTask[]> {
    const pattern = this.delayedTaskPattern(chatId);
    const tasks: DelayedTask[] = [];
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = nextCursor;

      if (keys.length === 0) {
        continue;
      }

      const pipeline = this.client.pipeline();
      for (const key of keys) {
        pipeline.hgetall(key);
      }
      const results = await pipeline.exec();

      for (const result of results ?? []) {
        const [pipelineError, rawFields] = result as [Error | null, unknown];
        if (pipelineError || !rawFields || typeof rawFields !== 'object') {
          continue;
        }
        const fields = rawFields as Record<string, string>;

        const id = fields.id;
        const instruction = fields.instruction;
        const dueDateIso = fields.dueDateIso;
        const sourceChatIdRaw = fields.sourceChatId;
        const status = fields.status;
        const createdAtIso = fields.createdAtIso;

        if (
          typeof id !== 'string' ||
          typeof instruction !== 'string' ||
          typeof dueDateIso !== 'string' ||
          typeof sourceChatIdRaw !== 'string' ||
          typeof status !== 'string' ||
          typeof createdAtIso !== 'string'
        ) {
          continue;
        }

        const sourceChatId = Number.parseInt(sourceChatIdRaw, 10);
        if (!Number.isFinite(sourceChatId)) {
          continue;
        }

        if (status !== 'pending' && status !== 'completed') {
          continue;
        }

        tasks.push({
          id,
          instruction,
          dueDateIso,
          sourceChatId,
          status,
          createdAtIso,
        });
      }
    } while (cursor !== '0');

    tasks.sort((a, b) => a.dueDateIso.localeCompare(b.dueDateIso));
    return tasks;
  }

  async deleteDelayedTask(chatId: number, taskId: string): Promise<boolean> {
    const deleted = await this.client.del(this.delayedTaskKey(chatId, taskId));
    return deleted > 0;
  }

  async withChatLock<T>(chatId: number, callback: () => Promise<T>): Promise<T> {
    logger.debug('redis: waiting for chat lock', { chatId });
    try {
      return await this.redlock.using([this.chatLockKey(chatId)], 300_000, async (signal) => {
        if (signal.aborted) {
          throw new Error('redis: chat lock was aborted');
        }

        logger.debug('redis: chat lock acquired', { chatId });
        const result = await callback();
        logger.debug('redis: chat lock released', { chatId });
        return result;
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'ExecutionError') {
        logger.warn('redis: timed out waiting for chat lock', {
          chatId,
          error: serializeError(error),
        });
        throw new ChatLockTimeoutError();
      }

      throw error;
    }
  }

  private chatKey(chatId: number): string {
    return `${this.keyPrefix}:chat:${chatId}`;
  }

  private chatLockKey(chatId: number): string {
    return `${this.keyPrefix}:lock:${chatId}`;
  }

  private delayedTaskKey(chatId: number, id: string): string {
    return `${this.keyPrefix}:chat:${chatId}:delayed_task:${id}`;
  }

  private delayedTaskPattern(chatId: number): string {
    return `${this.keyPrefix}:chat:${chatId}:delayed_task:*`;
  }
}
