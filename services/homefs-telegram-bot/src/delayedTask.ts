import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from './logger';

const DEFAULT_QUEUE_NAME = 'delayed-tasks';

export type DelayedTaskJobData = {
  chatId: number;
  messageId: number;
  instruction: string;
};

export class DelayedTaskQueue {
  private readonly queue: Queue<DelayedTaskJobData>;

  constructor(redis: IORedis) {
    const connection = {
      host: redis.options.host,
      port: redis.options.port,
      username: redis.options.username,
      password: redis.options.password,
      db: redis.options.db,
      tls: redis.options.tls,
    };
    this.queue = new Queue(DEFAULT_QUEUE_NAME, {
      connection,
    });
  }

  async addDelayedTask(payload: DelayedTaskJobData, delayInSeconds: number): Promise<void> {
    await this.queue.add(
      'delayed-task',
      {
        chatId: payload.chatId,
        messageId: payload.messageId,
        instruction: payload.instruction,
      },
      {
        delay: delayInSeconds * 1000,
      },
    );
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export class DelayedTaskWorker {
  private readonly worker: Worker<DelayedTaskJobData>;

  constructor(
    redis: IORedis,
    private readonly onJob: (job: DelayedTaskJobData) => Promise<void>,
  ) {
    const connection = {
      host: redis.options.host,
      port: redis.options.port,
      username: redis.options.username,
      password: redis.options.password,
      db: redis.options.db,
      tls: redis.options.tls,
    };

    this.worker = new Worker(DEFAULT_QUEUE_NAME, this.handleJob, {
      connection,
    });
  }

  private handleJob = async (job: Job<DelayedTaskJobData>) => {
    logger.info('delayed-task: executing job', {
      jobId: job.id,
      chatId: job.data.chatId,
    });
    ///
    await this.onJob(job.data);
    ///
    logger.info('delayed-task: executed job', {
      jobId: job.id,
      chatId: job.data.chatId,
    });
  };

  async close(): Promise<void> {
    await this.worker.close();
  }
}
