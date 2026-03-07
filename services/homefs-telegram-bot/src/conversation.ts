import { z } from 'zod';
import { OllamaToolCallSchema } from 'homefs-shared';

export type ConversationMessage = {
  role: string;
  content: string;
  tool_calls?: z.output<typeof OllamaToolCallSchema>[];
};

export const ConversationMessageSchema: z.ZodType<ConversationMessage> = z.object({
  role: z.string(),
  content: z.string(),
  tool_calls: z.array(OllamaToolCallSchema).optional(),
});
