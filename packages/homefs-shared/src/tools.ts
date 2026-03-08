import { z } from 'zod';

export const JsonSchemaSchema = z
  .object({
    type: z.string().optional(),
    description: z.string().optional(),
    properties: z.record(z.unknown()).optional(),
    required: z.array(z.string()).optional(),
    additionalProperties: z.union([z.boolean(), z.record(z.unknown())]).optional(),
  })
  .passthrough();

export const OllamaToolFunctionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  parameters: JsonSchemaSchema.optional(),
});

export const OllamaToolSchema = z.object({
  type: z.literal('function'),
  function: OllamaToolFunctionSchema,
});

export const OllamaToolCallSchema = z.object({
  id: z.string().optional(),
  type: z.literal('function').optional(),
  function: z.object({
    name: z.string().min(1),
    arguments: z.union([z.string(), z.record(z.unknown())]).optional(),
  }),
});

export const ListToolsResponseSchema = z.object({
  tools: z.array(OllamaToolSchema),
});

export const ToolCallRequestSchema = z.object({
  tool_call: OllamaToolCallSchema,
});

export const ToolCallResponseSchema = z.object({
  tool_name: z.string().min(1),
  tool_call_id: z.string().optional(),
  result: z.unknown(),
});

export const OllamaMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
  tool_calls: z.array(OllamaToolCallSchema).optional(),
});

export type OllamaTool = z.infer<typeof OllamaToolSchema>;
export type OllamaToolCall = z.infer<typeof OllamaToolCallSchema>;
export type ListToolsResponse = z.infer<typeof ListToolsResponseSchema>;
export type ToolCallRequest = z.infer<typeof ToolCallRequestSchema>;
export type ToolCallResponse = z.infer<typeof ToolCallResponseSchema>;
export type OllamaMessage = z.infer<typeof OllamaMessageSchema>;
