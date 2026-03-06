import { z } from 'zod';
import { INSTRUCTION } from './instruction';

type OllamaCredentials = {
  baseUrl: string;
  model: string;
};

const GenerateResponseSchema = z.object({
  message: z.object({
    content: z.string(),
  }),
});

export class Model {
  private readonly credentials: OllamaCredentials;

  constructor(credentials: OllamaCredentials) {
    this.credentials = credentials;
  }

  async respond(message: string): Promise<string> {
    const url = new URL('/api/chat', this.credentials.baseUrl);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.credentials.model,
        messages: [
          { role: 'system', content: INSTRUCTION },
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

    return data.message.content;
  }
}
