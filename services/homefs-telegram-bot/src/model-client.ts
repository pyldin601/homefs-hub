type OllamaCredentials = {
  baseUrl: string;
  model: string;
};

type GenerateResponse = {
  response: string;
};

export class ModelClient {
  private readonly credentials: OllamaCredentials;

  constructor(credentials: OllamaCredentials) {
    this.credentials = credentials;
  }

  async respond(instruction: string, inputMessage: string): Promise<string> {
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

    const data = (await response.json()) as GenerateResponse;
    return data.response;
  }
}
