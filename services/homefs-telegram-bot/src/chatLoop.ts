import { z } from 'zod';
import {
  OllamaMessageSchema,
  type OllamaToolCall,
  type OllamaTool,
  type OllamaMessage,
} from 'homefs-shared';
import { logger, serializeError } from './logger';

type OllamaCredentials = {
  baseUrl: string;
  model: string;
};

type ChatLoopOptions = {
  maxIterations?: number;
};

const GenerateResponseSchema = z.object({
  message: OllamaMessageSchema,
});

/** Stateless Ollama chat-loop runner. */
export class ChatLoop {
  private readonly maxIterations: number;

  constructor(
    private readonly credentials: OllamaCredentials,
    private readonly initialInstruction: string,
    options?: ChatLoopOptions,
  ) {
    const maxIterations = options?.maxIterations ?? 10;
    if (!Number.isInteger(maxIterations) || maxIterations <= 0) {
      throw new Error('ChatLoop maxIterations must be a positive integer');
    }
    this.maxIterations = maxIterations;
  }

  /** Returns only current-run messages (user/assistant/tool), keeping history untouched. */
  async respond(
    message: string,
    history: ReadonlyArray<OllamaMessage>,
    tools: ReadonlyArray<OllamaTool>,
    onToolCall: (call: OllamaToolCall) => Promise<unknown>,
  ): Promise<OllamaMessage[]> {
    const url = new URL('/api/chat', this.credentials.baseUrl);
    const messages: OllamaMessage[] = [];

    messages.push({ role: 'user', content: message });
    logger.debug('chat-loop: response loop started', {
      historyCount: history.length,
      toolsCount: tools.length,
      maxIterations: this.maxIterations,
    });

    let isWaitingForToolResult = true;
    let iteration = 0;
    while (isWaitingForToolResult) {
      iteration += 1;
      logger.debug('chat-loop: loop iteration started', { iteration });
      if (iteration > this.maxIterations) {
        logger.error('chat-loop: max iterations exceeded', {
          iteration,
          maxIterations: this.maxIterations,
        });
        throw new Error(`ChatLoop exceeded max iterations (${this.maxIterations})`);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.credentials.model,
          messages: [
            {
              role: 'system',
              content: this.initialInstruction,
            },
            ...history,
            ...messages,
          ],
          tools,
          stream: false,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error('chat-loop: ollama request failed', {
          status: response.status,
          body,
        });
        throw new Error(`Ollama request failed with status ${response.status}: ${body}`);
      }

      const json = await response.json();
      const parsed = GenerateResponseSchema.parse(json);
      const assistantMessage = parsed.message;
      messages.push(assistantMessage);
      logger.debug('chat-loop: assistant message received', {
        hasToolCalls: Boolean(assistantMessage.tool_calls?.length),
      });

      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        isWaitingForToolResult = false;
        logger.info('chat-loop: response loop completed', {
          iteration,
          messageCount: messages.length,
        });
        return messages;
      }

      const toolMessages = await Promise.all(
        assistantMessage.tool_calls.map(async (toolCall) => {
          logger.info('chat-loop: executing tool call', {
            toolName: toolCall.function.name,
            iteration,
          });
          try {
            const toolResult = await onToolCall(toolCall);
            logger.debug('chat-loop: tool call completed', {
              toolName: toolCall.function.name,
            });
            const toolMessage: OllamaMessage = {
              role: 'tool',
              content: JSON.stringify(toolResult),
            };
            return toolMessage;
          } catch (error) {
            logger.error('chat-loop: tool call failed', {
              toolName: toolCall.function.name,
              error: serializeError(error),
            });
            throw error;
          }
        }),
      );
      messages.push(...toolMessages);
    }

    throw new Error('unreachable: chat loop ended without a response');
  }

  public async summarizeHistory(history: ReadonlyArray<OllamaMessage>): Promise<OllamaMessage> {
    const url = new URL('/api/chat', this.credentials.baseUrl);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.credentials.model,
        messages: [
          {
            role: 'system',
            content:
              'Summarize chat history for long-term memory compression. Keep only essential user preferences, decisions, unresolved tasks, and critical tool outcomes. Respond in plain text.',
          },
          {
            role: 'user',
            content: JSON.stringify(history),
          },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`History summarization failed with status ${response.status}: ${body}`);
    }

    const json = await response.json();
    const parsed = GenerateResponseSchema.parse(json);

    return parsed.message;
  }
}
