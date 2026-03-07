import 'dotenv/config';
import { parseConfig, type Config } from './config';
import { Model } from './model';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { logger } from './logger';

const parseAllowedChatIds = (raw?: string): Set<number> | null => {
  if (!raw) {
    return null;
  }

  const ids = raw
    .split(',')
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((value) => Number.isFinite(value));

  return ids.length > 0 ? new Set(ids) : null;
};

const main = async (): Promise<void> => {
  const config: Config = parseConfig(process.env);
  const allowedChatIds = parseAllowedChatIds(config.ALLOWED_CHAT_IDS);

  const modelClient = new Model(
    {
      baseUrl: config.OLLAMA_BASE_URL,
      model: config.OLLAMA_MODEL,
    },
    config.TOOL_SERVER_URL,
    config.REDIS_URL,
    config.REDIS_KEY_PREFIX,
  );

  await modelClient.connect();

  const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

  bot.on(message('text'), async (ctx) => {
    const text = ctx.message.text.trim();
    const chatId = ctx.chat.id;
    let typingInterval: NodeJS.Timeout | null = null;

    try {
      if (allowedChatIds && !allowedChatIds.has(chatId)) {
        logger.warn('telegram: blocked message from unapproved chat', {
          chatId,
        });
        await ctx.reply('This bot is not authorized for this chat.');
        return;
      }

      logger.info('telegram: received message', { chatId, text });
      // Keep the typing indicator visible while the model is generating.
      typingInterval = setInterval(() => {
        ctx.sendChatAction('typing').catch((error) => {
          logger.warn('telegram: failed to refresh typing indicator', {
            chatId,
            error,
          });
        });
      }, 3000);

      const reply = await modelClient.respond(chatId, text);
      logger.info('telegram: generated reply', { chatId, reply });
      await ctx.reply(reply);
    } catch (error) {
      logger.error('telegram: failed to handle message', { chatId, error });
      await ctx.reply('Something went wrong. Please try again later.');
    } finally {
      if (typingInterval) {
        clearInterval(typingInterval);
      }
    }
  });

  await bot.launch();

  process.once('SIGINT', () => {
    void modelClient.close();
    bot.stop('SIGINT');
  });

  process.once('SIGTERM', () => {
    void modelClient.close();
    bot.stop('SIGTERM');
  });
};

main().catch((error) => {
  logger.error('Fatal error in main()', { error });
  process.exitCode = 1;
});
