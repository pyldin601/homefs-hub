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

type AgentOptions = {
  maxIterations?: number;
};

const GenerateResponseSchema = z.object({
  message: OllamaMessageSchema,
});

/** Stateless Ollama chat-loop runner. */
export class Agent {
  private readonly maxIterations: number;

  constructor(
    private readonly credentials: OllamaCredentials,
    private readonly initialInstruction: string,
    options?: AgentOptions,
  ) {
    const maxIterations = options?.maxIterations ?? 10;
    if (!Number.isInteger(maxIterations) || maxIterations <= 0) {
      throw new Error('Agent maxIterations must be a positive integer');
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
    logger.debug('agent: response loop started', {
      historyCount: history.length,
      toolsCount: tools.length,
      maxIterations: this.maxIterations,
    });

    let isWaitingForToolResult = true;
    let iteration = 0;
    while (isWaitingForToolResult) {
      iteration += 1;
      logger.debug('agent: loop iteration started', { iteration });
      if (iteration > this.maxIterations) {
        logger.error('agent: max iterations exceeded', {
          iteration,
          maxIterations: this.maxIterations,
        });
        throw new Error(`Agent exceeded max iterations (${this.maxIterations})`);
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
        logger.error('agent: ollama request failed', {
          status: response.status,
          body,
        });
        throw new Error(`Ollama request failed with status ${response.status}: ${body}`);
      }

      const json = await response.json();
      const parsed = GenerateResponseSchema.parse(json);
      const assistantMessage = parsed.message;
      messages.push(assistantMessage);
      logger.debug('agent: assistant message received', {
        hasToolCalls: Boolean(assistantMessage.tool_calls?.length),
      });

      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        isWaitingForToolResult = false;
        logger.info('agent: response loop completed', {
          iteration,
          messageCount: messages.length,
        });
        return messages;
      }

      for (const toolCall of assistantMessage.tool_calls) {
        logger.info('agent: executing tool call', {
          toolName: toolCall.function.name,
          iteration,
        });
        try {
          const toolResult = await onToolCall(toolCall);
          const toolMessage: OllamaMessage = {
            role: 'tool',
            content: JSON.stringify(toolResult),
          };
          messages.push(toolMessage);
          logger.debug('agent: tool call completed', {
            toolName: toolCall.function.name,
          });
        } catch (error) {
          logger.error('agent: tool call failed', {
            toolName: toolCall.function.name,
            error: serializeError(error),
          });
          throw error;
        }
      }
    }

    throw new Error('unreachable: agent loop ended without a response');
  }
}
