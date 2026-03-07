import { createClient, type RedisClientType } from 'redis';
import { ConversationMessageSchema, type ConversationMessage } from './conversation';

export class RedisService {
  private readonly client: RedisClientType;
  private readonly keyPrefix: string;

  constructor(options: { redisUrl: string; keyPrefix: string }) {
    this.client = createClient({ url: options.redisUrl });
    this.keyPrefix = options.keyPrefix;

    this.client.on('error', (error) => {
      console.error('redis: client error', { error });
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async close(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  async addMessageToChat(chatId: number, message: ConversationMessage): Promise<void> {
    const key = this.chatKey(chatId);
    await this.client.rPush(key, JSON.stringify(message));
  }

  async getChatMessages(chatId: number): Promise<ConversationMessage[]> {
    const key = this.chatKey(chatId);
    const values = await this.client.lRange(key, 0, -1);

    const messages: ConversationMessage[] = [];
    for (const value of values) {
      try {
        const json = JSON.parse(value);
        const parsed = ConversationMessageSchema.parse(json);
        messages.push(parsed);
      } catch (error) {
        console.warn('redis: invalid chat message skipped', { chatId, error });
      }
    }

    return messages;
  }

  async clearChatMessages(chatId: number): Promise<void> {
    const key = this.chatKey(chatId);
    await this.client.del(key);
  }

  private chatKey(chatId: number): string {
    return `${this.keyPrefix}:${chatId}`;
  }
}
