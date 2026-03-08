import { z } from 'zod';
import {
  ListToolsResponseSchema,
  OllamaToolCallSchema,
  ToolCallResponseSchema,
  type OllamaTool,
} from 'homefs-shared';
import { logger } from './logger';
import { RedisService } from './redis';
import { DelayedTaskQueue } from './delayedTask';

const ClearChatHistoryArgsSchema = z.object({}).strict();
const AddDelayedTaskArgsSchema = z
  .object({
    instruction: z.string().trim().min(1),
    delayInSeconds: z.number().int().positive(),
  })
  .strict();

const LOCAL_TOOLS: ReadonlyArray<OllamaTool> = [
  {
    type: 'function',
    function: {
      name: 'clear_chat_history',
      description: 'Clear the current chat history stored in Redis.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_delayed_task',
      description: 'Adds delayed task or reminder.',
      parameters: {
        type: 'object',
        properties: {
          instruction: {
            type: 'string',
            description: 'Self-contained instruction for delayed execution.',
          },
          delayInSeconds: {
            type: 'integer',
            description: 'Delay before execution in seconds.',
          },
        },
        required: ['instruction', 'delayInSeconds'],
        additionalProperties: false,
      },
    },
  },
];

export class ToolService {
  constructor(
    private readonly toolServerUrl: string,
    private readonly redisService: RedisService,
    private readonly delayedTaskQueue: DelayedTaskQueue,
  ) {}

  public async fetchTools(): Promise<OllamaTool[]> {
    const response = await fetch(new URL('/tools', this.toolServerUrl), {
      method: 'GET',
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Tool server /tools failed with status ${response.status}: ${body}`);
    }

    const json = await response.json();
    const parsed = ListToolsResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Tool server /tools returned invalid response: ${parsed.error.message}`);
    }

    return [...parsed.data.tools, ...LOCAL_TOOLS];
  }

  public async executeToolCall(
    chatId: number,
    messageId: number,
    toolCall: z.output<typeof OllamaToolCallSchema>,
  ): Promise<unknown> {
    logger.info('ollama: executing tool call', { toolCall: JSON.stringify(toolCall) });

    if (toolCall.function.name === 'clear_chat_history') {
      const parsed = ClearChatHistoryArgsSchema.safeParse(
        parseToolArguments(toolCall.function.arguments),
      );
      if (!parsed.success) {
        return {
          error: 'Invalid arguments for clear_chat_history. Expected {}',
        };
      }

      await this.redisService.clearChatMessages(chatId);
      return { ok: true, action: 'cleared_chat_history' };
    }

    if (toolCall.function.name === 'add_delayed_task') {
      const parsed = AddDelayedTaskArgsSchema.safeParse(
        parseToolArguments(toolCall.function.arguments),
      );
      if (!parsed.success) {
        return {
          error:
            'Invalid arguments for add_delayed_task. Expected { instruction: string, delayInSeconds: positive integer }',
          details: parsed.error.flatten(),
        };
      }

      const payload = { chatId, messageId, instruction: parsed.data.instruction };

      await this.delayedTaskQueue.addDelayedTask(payload, parsed.data.delayInSeconds);

      return { ok: true, action: 'delayed_task_scheduled', payload };
    }

    try {
      const response = await fetch(new URL('/tools/call', this.toolServerUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tool_call: toolCall }),
      });

      if (!response.ok) {
        const body = await response.text();
        return {
          error: `Tool server call failed with status ${response.status}`,
          body,
        };
      }

      const json = await response.json();
      const parsed = ToolCallResponseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          error: 'Tool server returned invalid response format',
          details: parsed.error.flatten(),
        };
      }

      return parsed.data.result;
    } catch (error) {
      return {
        error: `Tool server request failed: ${String(error)}`,
      };
    }
  }
}

const parseToolArguments = (
  argumentsValue: z.output<typeof OllamaToolCallSchema>['function']['arguments'],
): unknown => {
  if (typeof argumentsValue === 'string') {
    try {
      return JSON.parse(argumentsValue);
    } catch {
      logger.warn('ollama: failed to parse tool arguments as JSON', { argumentsValue });
      return {};
    }
  }

  return argumentsValue ?? {};
};
