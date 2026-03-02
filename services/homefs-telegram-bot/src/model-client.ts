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

const SkillCallSchema = z.object({
  skill: z.string().min(1),
  arguments: z.record(z.unknown()).optional(),
});

export class ModelClient {
  private readonly credentials: OllamaCredentials;

  constructor(credentials: OllamaCredentials) {
    this.credentials = credentials;
  }

  async respond(instruction: string, inputMessage: string) {
    const url = new URL('/api/chat', this.credentials.baseUrl);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.credentials.model,
        messages: [
          { role: 'system', content: instruction },
          { role: 'user', content: inputMessage },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with status ${response.status}`);
    }

    const json = await response.json();

    const data = GenerateResponseSchema.parse(json);

    try {
      const maybeJson = JSON.parse(data.message.content.replace('```json', '').replace('```', ''));
      return SkillCallSchema.parse(maybeJson);
    } catch (error) {
      return { final: data.message.content };
    }
  }
}
