import { z } from 'zod';

type OllamaCredentials = {
  baseUrl: string;
  model: string;
};

const GenerateResponseSchema = z.object({
  message: z.object({
    content: z.string(),
  }),
});

const FinalResponseSchema = z
  .object({
    final: z.string(),
  })
  .strict();

const SkillCallResponseSchema = z
  .object({
    skill_call: z.object({
      name: z.string().min(1),
      arguments: z.record(z.unknown()).optional(),
    }),
  })
  .strict();

const ModelResponseSchema = z.union([FinalResponseSchema, SkillCallResponseSchema]);

export type ModelResponse = z.infer<typeof ModelResponseSchema>;

export class ModelClient {
  private readonly credentials: OllamaCredentials;

  constructor(credentials: OllamaCredentials) {
    this.credentials = credentials;
  }

  async respond(instruction: string, message: string): Promise<ModelResponse> {
    const url = new URL('/api/chat', this.credentials.baseUrl);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.credentials.model,
        messages: [
          { role: 'system', content: instruction },
          { role: 'user', content: message },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with status ${response.status}`);
    }

    const json = await response.json();

    const data = GenerateResponseSchema.parse(json);
    const content = data.message.content.trim();

    try {
      const withoutCodeFence = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const maybeJson = JSON.parse(withoutCodeFence);
      return ModelResponseSchema.parse(maybeJson);
    } catch {
      return { final: content };
    }
  }
}
