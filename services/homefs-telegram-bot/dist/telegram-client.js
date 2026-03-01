"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramClient = void 0;
const zod_1 = require("zod");
const SendMessageResponseSchema = zod_1.z.object({
    ok: zod_1.z.boolean(),
    result: zod_1.z
        .object({
        message_id: zod_1.z.number(),
    })
        .optional(),
});
const GetUpdatesResponseSchema = zod_1.z.object({
    ok: zod_1.z.boolean(),
    result: zod_1.z.array(zod_1.z.object({
        update_id: zod_1.z.number(),
        message: zod_1.z
            .object({
            message_id: zod_1.z.number(),
            text: zod_1.z.string().optional(),
            chat: zod_1.z.object({
                id: zod_1.z.number(),
            }),
        })
            .optional(),
    })),
});
class TelegramClient {
    token;
    constructor(options) {
        this.token = options.token;
    }
    async sendMessage(chatId, text) {
        const url = new URL(`https://api.telegram.org/bot${this.token}/sendMessage`);
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
            }),
        });
        if (!response.ok) {
            throw new Error(`Telegram request failed with status ${response.status}`);
        }
        const data = SendMessageResponseSchema.parse(await response.json());
        if (!data.ok) {
            throw new Error('Telegram request returned ok=false');
        }
    }
    async getUpdates(offset) {
        const url = new URL(`https://api.telegram.org/bot${this.token}/getUpdates`);
        if (offset !== undefined) {
            url.searchParams.set('offset', String(offset));
        }
        url.searchParams.set('timeout', '30');
        const response = await fetch(url, { method: 'GET' });
        if (!response.ok) {
            throw new Error(`Telegram request failed with status ${response.status}`);
        }
        const data = GetUpdatesResponseSchema.parse(await response.json());
        if (!data.ok) {
            throw new Error('Telegram request returned ok=false');
        }
        return data.result;
    }
}
exports.TelegramClient = TelegramClient;
//# sourceMappingURL=telegram-client.js.map