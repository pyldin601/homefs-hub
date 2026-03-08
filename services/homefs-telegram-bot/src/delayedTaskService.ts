import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { Telegraf } from 'telegraf';
import { logger } from './logger';

const DEFAULT_QUEUE_NAME = 'delayed-tasks';

export type DelayedTaskJobData = {
  chatId: number;
  instruction: string;
};

export class DelayedTaskService {
  private readonly queue: Queue<DelayedTaskJobData>;
  private readonly worker: Worker<DelayedTaskJobData>;

  constructor(
    redis: IORedis,
    private readonly bot: Telegraf,
  ) {
    this.queue = new Queue(DEFAULT_QUEUE_NAME, {
      connection: {
        host: redis.options.host,
        port: redis.options.port,
      },
    });
    this.worker = new Worker(DEFAULT_QUEUE_NAME, this.handleJob, {
      connection: {
        host: redis.options.host,
        port: redis.options.port,
      },
    });
  }

  private handleJob = async (job: Job<DelayedTaskJobData>) => {
    logger.info('delayed-task: executing job', {
      jobId: job.id,
      chatId: job.data.chatId,
    });
    ///
    await this.bot.telegram.sendMessage(job.data.chatId, `debug: ${job.data.instruction}`);
    ///
    logger.info('delayed-task: executed job', {
      jobId: job.id,
      chatId: job.data.chatId,
    });
  };

  async addDelayedTask(payload: DelayedTaskJobData, delayInSeconds: number): Promise<void> {
    await this.queue.add(
      'delayed-task',
      {
        chatId: payload.chatId,
        instruction: payload.instruction,
      },
      {
        delay: delayInSeconds * 1000,
      },
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}
