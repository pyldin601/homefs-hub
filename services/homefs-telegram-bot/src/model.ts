import { z } from 'zod';
import { INSTRUCTION } from './instruction';

type OllamaCredentials = {
  baseUrl: string;
  model: string;
};

const GenerateResponseSchema = z.object({
  message: z.object({
    role: z.string(),
    content: z.string(),
    tool_calls: z
      .array(
        z.object({
          id: z.string(),
          function: z.object({
            name: z.literal('get_date'),
          }),
        }),
      )
      .optional(),
  }),
});

type GenerateResponse = z.output<typeof GenerateResponseSchema>;

export class Model {
  private readonly credentials: OllamaCredentials;

  constructor(credentials: OllamaCredentials) {
    this.credentials = credentials;
  }

  async respond(message: string): Promise<string> {
    const url = new URL('/api/chat', this.credentials.baseUrl);

    const messages = [
      { role: 'system', content: INSTRUCTION },
      { role: 'user', content: message },
    ];

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
        for (const toolCall of responseMessage.message.tool_calls ?? []) {
          messages.push({ role: 'tool', content: new Date().toISOString() });
        }
      }
    } while (responseMessage.message.tool_calls);

    return responseMessage.message.content;
  }
}
