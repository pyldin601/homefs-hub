import Redis from 'ioredis';
import Redlock from 'redlock';
import { ConversationMessageSchema, type ConversationMessage } from './conversation';
import { logger } from './logger';

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
      logger.error('redis: client error', { error });
    });

    this.redlockClient.on('error', (error) => {
      logger.error('redis: redlock client error', { error });
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
        logger.warn('redis: invalid chat message skipped', { chatId, error });
      }
    }

    return messages;
  }

  async clearChatMessages(chatId: number): Promise<void> {
    const key = this.chatKey(chatId);
    await this.client.del(key);
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
        logger.warn('redis: timed out waiting for chat lock', { chatId, error });
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
}
