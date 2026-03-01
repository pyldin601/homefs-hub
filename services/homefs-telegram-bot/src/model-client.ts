type OllamaCredentials = {
  baseUrl: string;
  model: string;
};

type GenerateResponse = {
  response: string;
};

export class ModelClient {
  private readonly instruction: string;
  private readonly credentials: OllamaCredentials;

  constructor(instruction: string, credentials: OllamaCredentials) {
    this.instruction = instruction;
    this.credentials = credentials;
  }

  async respond(inputMessage: string): Promise<string> {
    const url = new URL('/api/generate', this.credentials.baseUrl);
    const prompt = `${this.instruction}\n\n${inputMessage}`.trim();

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

    const data = (await response.json()) as GenerateResponse;
    return data.response;
  }
}
