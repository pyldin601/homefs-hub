import { z } from 'zod';
import { INSTRUCTION } from './instruction';
import type { TolokaClient } from './toloka';

type OllamaCredentials = {
  baseUrl: string;
  model: string;
};

export type ConversationMessage = {
  role: string;
  content: string;
  tool_calls?: z.output<typeof ToolCallSchema>[];
};

const MAX_HISTORY_MESSAGES = 20;

const ToolCallSchema = z.object({
  id: z.string().optional(),
  function: z.object({
    name: z.enum([
      'get_date',
      'search_torrents',
      'list_torrent_bookmarks',
      'search_torrent_bookmarks_by_title',
      'bookmark_torrent',
      'remove_torrent_bookmark',
    ]),
    arguments: z.union([z.record(z.unknown()), z.string()]).optional(),
  }),
});

const GenerateResponseSchema = z.object({
  message: z.object({
    role: z.string(),
    content: z.string(),
    tool_calls: z.array(ToolCallSchema).optional(),
  }),
});

type GenerateResponse = z.output<typeof GenerateResponseSchema>;

export class Model {
  private readonly credentials: OllamaCredentials;
  private readonly tolokaClient: TolokaClient;
  private readonly chatHistories = new Map<number, ConversationMessage[]>();

  constructor(credentials: OllamaCredentials, tolokaClient: TolokaClient) {
    this.credentials = credentials;
    this.tolokaClient = tolokaClient;
  }

  async respond(chatId: number, message: string): Promise<string> {
    const url = new URL('/api/chat', this.credentials.baseUrl);
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
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_date',
                description: 'Get the current date and time in ISO format.',
              },
            },
            {
              type: 'function',
              function: {
                name: 'search_torrents',
                description:
                  'Search torrents on Toloka by query. Returned topicId is the default Toloka numeric ID (for example 679577).',
                parameters: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                      description: 'Search query',
                    },
                  },
                  required: ['query'],
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'list_torrent_bookmarks',
                description:
                  'List bookmarked torrent topics from Toloka. topicId should be treated as the default Toloka numeric ID.',
                parameters: {
                  type: 'object',
                  properties: {},
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'search_torrent_bookmarks_by_title',
                description:
                  'Search bookmarked torrent topics by title and return matching topic IDs. topicId is the default Toloka numeric ID.',
                parameters: {
                  type: 'object',
                  properties: {
                    title: {
                      type: 'string',
                      description: 'Part of bookmark title to search for',
                    },
                  },
                  required: ['title'],
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'bookmark_torrent',
                description:
                  'Add a torrent topic to Toloka bookmarks by topicId. Use default Toloka numeric ID (for example 679577); t679577 is also accepted.',
                parameters: {
                  type: 'object',
                  properties: {
                    topicId: {
                      type: 'string',
                      description: 'Default Toloka numeric ID, for example 679577',
                    },
                  },
                  required: ['topicId'],
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'remove_torrent_bookmark',
                description:
                  'Remove a torrent topic from Toloka bookmarks by topicId. Use default Toloka numeric ID (for example 679577); t679577 is also accepted.',
                parameters: {
                  type: 'object',
                  properties: {
                    topicId: {
                      type: 'string',
                      description: 'Default Toloka numeric ID, for example 679577',
                    },
                  },
                  required: ['topicId'],
                },
              },
            },
          ],
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

  private async executeToolCall(toolCall: z.output<typeof ToolCallSchema>): Promise<unknown> {
    console.log('ollama: executing tool call', { toolCall: JSON.stringify(toolCall) });

    if (toolCall.function.name === 'get_date') {
      return new Date().toISOString();
    }

    if (toolCall.function.name === 'search_torrents') {
      const args = parseArguments(toolCall.function.arguments);
      const parsed = z.object({ query: z.string().min(1) }).safeParse(args);

      if (!parsed.success) {
        return JSON.stringify({
          error: 'Invalid arguments for search_torrents. Expected { query: string }',
        });
      }

      return await this.tolokaClient.getSearchResultsMeta(parsed.data.query);
    }

    if (toolCall.function.name === 'list_torrent_bookmarks') {
      return await this.tolokaClient.listBookmarkedTopics();
    }

    if (toolCall.function.name === 'search_torrent_bookmarks_by_title') {
      const args = parseArguments(toolCall.function.arguments);
      const parsed = z.object({ title: z.string().min(1) }).safeParse(args);

      if (!parsed.success) {
        return {
          error:
            'Invalid arguments for search_torrent_bookmarks_by_title. Expected { title: string }',
        };
      }

      const titleQuery = parsed.data.title.trim().toLowerCase();
      const bookmarks = await this.tolokaClient.listBookmarkedTopics();
      const matches = bookmarks.filter((item) => item.title.toLowerCase().includes(titleQuery));

      return {
        query: parsed.data.title,
        total: matches.length,
        results: matches.slice(0, 25).map((item) => ({
          topicId: item.topicId,
          title: item.title,
          category: typeof item.category === 'string' ? item.category : item.category.other,
        })),
      };
    }

    if (toolCall.function.name === 'bookmark_torrent') {
      const args = parseArguments(toolCall.function.arguments);
      const parsed = z.object({ topicId: z.string().min(1) }).safeParse(args);

      if (!parsed.success) {
        return {
          error: 'Invalid arguments for bookmark_torrent. Expected { topicId: string }',
        };
      }

      await this.tolokaClient.addTopicToBookmarks(parsed.data.topicId);
      return { ok: true, action: 'bookmarked', topicId: parsed.data.topicId };
    }

    if (toolCall.function.name === 'remove_torrent_bookmark') {
      const args = parseArguments(toolCall.function.arguments);
      const parsed = z.object({ topicId: z.string().min(1) }).safeParse(args);

      if (!parsed.success) {
        return {
          error: 'Invalid arguments for remove_torrent_bookmark. Expected { topicId: string }',
        };
      }

      await this.tolokaClient.removeTopicFromBookmarks(parsed.data.topicId);
      return { ok: true, action: 'removed', topicId: parsed.data.topicId };
    }

    return { error: `Unsupported tool: ${toolCall.function.name}` };
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

function parseArguments(
  argumentsValue: z.output<typeof ToolCallSchema>['function']['arguments'],
): unknown {
  if (typeof argumentsValue === 'string') {
    try {
      return JSON.parse(argumentsValue);
    } catch {
      return {};
    }
  }

  return argumentsValue ?? {};
}
