import { z } from 'zod';
import {
  ListToolsResponseSchema,
  OllamaToolCallSchema,
  ToolCallResponseSchema,
  type OllamaTool,
} from 'homefs-shared';
import { INSTRUCTION } from './instruction';

type OllamaCredentials = {
  baseUrl: string;
  model: string;
};

export type ConversationMessage = {
  role: string;
  content: string;
  tool_calls?: z.output<typeof OllamaToolCallSchema>[];
};

const MAX_HISTORY_MESSAGES = 20;

const GenerateResponseSchema = z.object({
  message: z.object({
    role: z.string(),
    content: z.string(),
    tool_calls: z.array(OllamaToolCallSchema).optional(),
  }),
});

type GenerateResponse = z.output<typeof GenerateResponseSchema>;

export class Model {
  private readonly credentials: OllamaCredentials;
  private readonly toolServerUrl: string;
  private readonly chatHistories = new Map<number, ConversationMessage[]>();

  constructor(credentials: OllamaCredentials, toolServerUrl: string) {
    this.credentials = credentials;
    this.toolServerUrl = toolServerUrl;
  }

  async respond(chatId: number, message: string): Promise<string> {
    const url = new URL('/api/chat', this.credentials.baseUrl);
    const tools = await this.fetchTools();
    const history = this.getOrInitHistory(chatId);
    const messages: ConversationMessage[] = [...history, { role: 'user', content: message }];

    let responseMessage: GenerateResponse | null = null;

    do {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.credentials.model,
          messages,
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

      responseMessage = GenerateResponseSchema.parse(json);

      if (responseMessage.message.tool_calls) {
        messages.push(responseMessage.message);
        for (const toolCall of responseMessage.message.tool_calls) {
          const toolResult = await this.executeToolCall(toolCall);
          messages.push({
            role: 'tool',
            content: JSON.stringify(toolResult),
          });
        }
      }
    } while (responseMessage.message.tool_calls);

    const reply = responseMessage.message.content;
    messages.push(responseMessage.message);
    this.chatHistories.set(chatId, trimHistory(messages));

    return reply;
  }

  private getOrInitHistory(chatId: number): ConversationMessage[] {
    const existing = this.chatHistories.get(chatId);
    if (existing) {
      return existing;
    }

    const initialHistory: ConversationMessage[] = [{ role: 'system', content: INSTRUCTION }];
    this.chatHistories.set(chatId, initialHistory);
    return initialHistory;
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

    return parsed.data.tools;
  }

  private async executeToolCall(toolCall: z.output<typeof OllamaToolCallSchema>): Promise<unknown> {
    console.log('ollama: executing tool call', { toolCall: JSON.stringify(toolCall) });

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

function trimHistory(history: ConversationMessage[]): ConversationMessage[] {
  if (history.length <= MAX_HISTORY_MESSAGES) {
    return history;
  }
  const [first, ...rest] = history;
  if (!first) {
    return history.slice(history.length - MAX_HISTORY_MESSAGES);
  }

  return [first, ...rest.slice(rest.length - (MAX_HISTORY_MESSAGES - 1))];
}
