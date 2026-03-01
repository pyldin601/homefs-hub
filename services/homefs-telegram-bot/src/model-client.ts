import { z } from 'zod';

type OllamaCredentials = {
  baseUrl: string;
  model: string;
};

const GenerateResponseSchema = z.object({
  response: z.string().min(1),
});

type GenerateResponse = z.infer<typeof GenerateResponseSchema>;

const SkillCallSchema = z.object({
  name: z.string().min(1),
  args: z.record(z.unknown()).optional(),
});

const ModelReplySchema = z.union([
  z.object({ skill_call: SkillCallSchema }),
  z.object({ final: z.string().min(1) }),
]);

export type ModelReply = z.infer<typeof ModelReplySchema>;

export class ModelClient {
  private readonly credentials: OllamaCredentials;

  constructor(credentials: OllamaCredentials) {
    this.credentials = credentials;
  }

  async respond(instruction: string, inputMessage: string): Promise<ModelReply> {
    const url = new URL('/api/generate', this.credentials.baseUrl);
    const prompt = `${instruction}\n\n${inputMessage}`.trim();

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.credentials.model,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with status ${response.status}`);
    }

    const data = GenerateResponseSchema.parse(await response.json());

    return ModelReplySchema.parse(JSON.parse(data.response));
  }
}
