import 'dotenv/config';
import { ConfigSchema, type Config } from './config';
import { Model } from './model';
import { TolokaClient } from './toloka';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { FmtString } from 'telegraf/format';
import { escapeMarkdownV2 } from './utils';

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
  const config: Config = ConfigSchema.parse(process.env);
  const allowedChatIds = parseAllowedChatIds(config.ALLOWED_CHAT_IDS);
  const tolokaClient = await TolokaClient.create({
    username: config.TOLOKA_USERNAME,
    password: config.TOLOKA_PASSWORD,
  });
  const modelClient = new Model(
    {
      baseUrl: config.OLLAMA_BASE_URL,
      model: config.OLLAMA_MODEL,
    },
    tolokaClient,
  );
  const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

  bot.on(message('text'), async (ctx) => {
    const text = ctx.message.text.trim();
    const chatId = ctx.chat.id;
    let typingInterval: NodeJS.Timeout | null = null;

    try {
      if (allowedChatIds && !allowedChatIds.has(chatId)) {
        console.warn('telegram: blocked message from unapproved chat', {
          chatId,
        });
        await ctx.reply('This bot is not authorized for this chat.');
        return;
      }

      console.log('telegram: received message', { chatId, text });
      // Keep the typing indicator visible while the model is generating.
      typingInterval = setInterval(() => {
        ctx.sendChatAction('typing').catch((error) => {
          console.warn('telegram: failed to refresh typing indicator', {
            chatId,
            error,
          });
        });
      }, 3000);
      const reply = await modelClient.respond(chatId, text);
      console.log('telegram: generated reply', { chatId, reply });
      await ctx.reply(reply, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      console.error('telegram: failed to handle message', { chatId, error });
      await ctx.reply('Something went wrong. Please try again later.');
    } finally {
      if (typingInterval) {
        clearInterval(typingInterval);
      }
    }
  });

  await bot.launch();

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
};

main().catch((error) => {
  console.error('Fatal error in main()', error);
  process.exitCode = 1;
});
