"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelClient = void 0;
class ModelClient {
    instruction;
    credentials;
    constructor(instruction, credentials) {
        this.instruction = instruction;
        this.credentials = credentials;
    }
    async respond(inputMessage) {
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
        const data = (await response.json());
        return data.response;
    }
}
exports.ModelClient = ModelClient;
//# sourceMappingURL=modelClient.js.map