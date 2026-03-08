import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { ChatLoop } from './chatLoop';
import { logger, serializeError } from './logger';
import { ChatLockTimeoutError, RedisService } from './redis';
import { ToolService } from './toolService';
import { DelayedTaskService } from './delayedTaskService';

type ChatFlowOptions = {
  allowedChatIds?: Set<number> | null;
  maxHistoryBeforeCompaction?: number;
};

export class ChatFlow {
  private isStarted = false;

  constructor(
    private readonly chatLoop: ChatLoop,
    private readonly bot: Telegraf,
    private readonly redisService: RedisService,
    private readonly toolService: ToolService,
    private readonly delayedTaskService: DelayedTaskService,
    private readonly options?: ChatFlowOptions,
  ) {}

  start(): void {
    if (this.isStarted) {
      logger.warn('chat-flow: start called while already started');
      return;
    }

    this.isStarted = true;

    this.bot.on(message('text'), async (ctx) => {
      if (!this.isStarted) {
        return;
      }

      const chatId = ctx.chat.id;
      const text = ctx.message.text.trim();
      const messageId = ctx.message.message_id;
      const quoteReplyOptions = {
        reply_parameters: {
          message_id: messageId,
        },
      };

      // Keep the typing indicator visible while the model is generating.
      const typingInterval = setInterval(() => {
        ctx.sendChatAction('typing').catch((error) => {
          logger.warn('telegram: failed to refresh typing indicator', {
            chatId,
            error: serializeError(error),
          });
        });
      }, 3000);

      try {
        if (this.options?.allowedChatIds && !this.options?.allowedChatIds?.has(chatId)) {
          logger.warn('telegram: blocked message from unapproved chat', {
            chatId,
          });
          await ctx.reply('This bot is not authorized for this chat.', quoteReplyOptions);
          return;
        }
        logger.info('telegram: received message', { chatId, text });
        const reply = await this.generateReply(chatId, messageId, text);
        await ctx.reply(reply, quoteReplyOptions);
      } catch (error) {
        if (error instanceof ChatLockTimeoutError) {
          logger.warn('telegram: chat lock wait timeout', { chatId });
          await ctx.reply(
            'Your previous request is still being processed. Please wait a bit and try again.',
            quoteReplyOptions,
          );
          return;
        }

        logger.error('telegram: failed to handle message', {
          chatId,
          error: serializeError(error),
        });
        await ctx.reply('Something went wrong. Please try again later.', quoteReplyOptions);
      } finally {
        clearInterval(typingInterval);
      }
    });
  }

  stop(): void {
    this.isStarted = false;
  }

  private async generateReply(chatId: number, messageId: number, text: string): Promise<string> {
    return await this.redisService.withChatLock(chatId, async () => {
      let history = await this.redisService.getChatMessages(chatId);
      const maxHistoryBeforeCompaction = this.options?.maxHistoryBeforeCompaction ?? 50;
      if (history.length >= maxHistoryBeforeCompaction) {
        const summarizedMessage = await this.chatLoop.summarizeHistory(history);
        await this.redisService.clearChatMessages(chatId);
        await this.redisService.addMessageToChat(chatId, summarizedMessage);
        history = await this.redisService.getChatMessages(chatId);
      }
      const tools = await this.toolService.fetchTools();
      const responseMessages = await this.chatLoop.respond(text, history, tools, async (call) => {
        return await this.toolService.executeToolCall(chatId, messageId, call);
      });
      for (const message of responseMessages) {
        await this.redisService.addMessageToChat(chatId, message);
      }
      const lastMessage = responseMessages.at(-1);
      return lastMessage?.content ?? 'No response from the model. :thinking_face:';
    });
  }
}
