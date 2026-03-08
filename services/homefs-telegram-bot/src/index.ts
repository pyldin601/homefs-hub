import 'dotenv/config';
import { parseConfig, type Config } from './config';
import { Telegraf } from 'telegraf';
import { logger, serializeError } from './logger';
import { RedisService } from './redis';
import { ChatLoop } from './chatLoop';
import { INSTRUCTION } from './instruction';
import { ToolService } from './toolService';
import { DelayedTaskQueue, DelayedTaskWorker } from './delayedTask';
import { ChatFlow } from './chatFlow';
import { OllamaMessage } from 'homefs-shared';

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

  const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN, {
    handlerTimeout: 30 * 60 * 1000,
  });

  const redisService = new RedisService({
    redisUrl: config.REDIS_URL,
    keyPrefix: config.REDIS_KEY_PREFIX,
  });
  const delayedTaskQueue = new DelayedTaskQueue(redisService.client);
  const toolService = new ToolService(config.TOOL_SERVER_URL, redisService, delayedTaskQueue, bot);
  const chatLoop = new ChatLoop(
    { model: config.OLLAMA_MODEL, baseUrl: config.OLLAMA_BASE_URL },
    INSTRUCTION,
    { maxIterations: 10 },
  );
  const delayedTaskWorker = new DelayedTaskWorker(redisService.client, async (job) => {
    const messages: OllamaMessage[] = [
      {
        role: 'system',
        content:
          'You cannot reply to the user in this chat. To send response to the user use notify_user tool.',
      },
    ];
    const tools = await toolService.fetchTools();

    const responseMessages = await chatLoop.respond(
      job.instruction,
      messages,
      tools,
      async (call) => {
        return await toolService.executeToolCall(job.chatId, job.messageId, call);
      },
    );

    logger.debug('delayed-task: chat loop completed', { responseMessages });
  });

  const chatFlow = new ChatFlow(chatLoop, bot, redisService, toolService, {
    allowedChatIds,
    maxHistoryBeforeCompaction: 50,
  });

  chatFlow.start();

  bot.catch((error, ctx) => {
    logger.error('telegram: unhandled middleware error', {
      chatId: ctx.chat?.id,
      error: serializeError(error),
    });
  });

  await bot.launch();

  process.once('SIGINT', async () => {
    chatFlow.stop();
    bot.stop('SIGINT');
    await delayedTaskQueue.close();
    await delayedTaskWorker.close();
    await redisService.close();
  });

  process.once('SIGTERM', async () => {
    chatFlow.stop();
    bot.stop('SIGTERM');
    await delayedTaskQueue.close();
    await delayedTaskWorker.close();
    await redisService.close();
  });
};

main().catch((error) => {
  logger.error('Fatal error in main()', { error: serializeError(error) });
  process.exitCode = 1;
});
