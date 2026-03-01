import 'dotenv/config';
import { ConfigSchema, type Config } from './config';
import { ModelClient } from './model-client';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';

const main = async (): Promise<void> => {
  const config: Config = ConfigSchema.parse(process.env);
  const modelClient = new ModelClient('You are a helpful assistant.', {
    baseUrl: config.OLLAMA_BASE_URL,
    model: config.OLLAMA_MODEL,
  });
  const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

  bot.on(message('text'), async (ctx) => {
    const text = ctx.message.text.trim();
    const chatId = ctx.chat.id;
    let typingInterval: NodeJS.Timeout | null = null;

    try {
      console.log('telegram: received message', { chatId, text });
      // Keep the typing indicator visible while the model is generating.
      await ctx.sendChatAction('typing');
      typingInterval = setInterval(() => {
        ctx.sendChatAction('typing').catch((error) => {
          console.warn('telegram: failed to refresh typing indicator', {
            chatId,
            error,
          });
        });
      }, 4000);
      const reply = await modelClient.respond(text);
      await ctx.reply(reply);
      console.log('telegram: sent reply', { chatId, reply });
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
