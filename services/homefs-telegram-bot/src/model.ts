import { z } from 'zod';
import {
  ListToolsResponseSchema,
  OllamaToolCallSchema,
  ToolCallResponseSchema,
  type OllamaTool,
} from 'homefs-shared';
import type { ConversationMessage } from './conversation';
import { INSTRUCTION } from './instruction';
import { RedisService } from './redis';

type OllamaCredentials = {
  baseUrl: string;
  model: string;
};

const ClearChatHistoryArgsSchema = z.object({}).strict();

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
];

const GenerateResponseSchema = z.object({
  message: z.object({
    role: z.string(),
    content: z.string(),
    tool_calls: z.array(OllamaToolCallSchema).optional(),
  }),
});

type GenerateResponse = z.output<typeof GenerateResponseSchema>;

const initialSystemMessage = (): ConversationMessage => ({
  role: 'system',
  content: INSTRUCTION,
});

export class Model {
  private readonly credentials: OllamaCredentials;
  private readonly toolServerUrl: string;
  private readonly redisService: RedisService;

  constructor(
    credentials: OllamaCredentials,
    toolServerUrl: string,
    redisUrl: string,
    redisKeyPrefix: string,
  ) {
    this.credentials = credentials;
    this.toolServerUrl = toolServerUrl;
    this.redisService = new RedisService({
      redisUrl,
      keyPrefix: redisKeyPrefix,
    });
  }

  async connect(): Promise<void> {
    await this.redisService.connect();
  }

  async close(): Promise<void> {
    await this.redisService.close();
  }

  async respond(chatId: number, message: string): Promise<string> {
    const url = new URL('/api/chat', this.credentials.baseUrl);
    const tools = await this.fetchTools();

    await this.redisService.addMessageToChat(chatId, {
      role: 'user',
      content: message,
    });

    let isWaitingForToolResult = true;
    while (isWaitingForToolResult) {
      const history = await this.redisService.getChatMessages(chatId);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.credentials.model,
          messages: [initialSystemMessage(), ...history],
          tools,
          stream: false,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama request failed with status ${response.status}: ${body}`);
      }

      const json = await response.json();
      console.log('ollama: received response', { json: JSON.stringify(json) });

      const responseMessage: GenerateResponse = GenerateResponseSchema.parse(json);
      await this.redisService.addMessageToChat(chatId, responseMessage.message);

      if (!responseMessage.message.tool_calls) {
        isWaitingForToolResult = false;
        return responseMessage.message.content;
      }

      for (const toolCall of responseMessage.message.tool_calls) {
        const toolResult = await this.executeToolCall(chatId, toolCall);
        await this.redisService.addMessageToChat(chatId, {
          role: 'tool',
          content: JSON.stringify(toolResult),
        });
      }
    }

    throw new Error('unreachable: model loop ended without a response');
  }

  private async fetchTools(): Promise<OllamaTool[]> {
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

  private async executeToolCall(
    chatId: number,
    toolCall: z.output<typeof OllamaToolCallSchema>,
  ): Promise<unknown> {
    console.log('ollama: executing tool call', { toolCall: JSON.stringify(toolCall) });

    if (toolCall.function.name === 'clear_chat_history') {
      const args = parseToolArguments(toolCall.function.arguments);
      const parsed = ClearChatHistoryArgsSchema.safeParse(args);
      if (!parsed.success) {
        return {
          error: 'Invalid arguments for clear_chat_history. Expected {}',
        };
      }

      await this.redisService.clearChatMessages(chatId);
      return { ok: true, action: 'cleared_chat_history' };
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
      return {};
    }
  }

  return argumentsValue ?? {};
};
