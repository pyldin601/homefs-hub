"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
const model_client_1 = require("./model-client");
const telegram_client_1 = require("./telegram-client");
const main = async () => {
    const config = config_1.ConfigSchema.parse(process.env);
    const modelClient = new model_client_1.ModelClient('You are a helpful assistant.', {
        baseUrl: config.OLLAMA_BASE_URL,
        model: config.OLLAMA_MODEL,
    });
    const telegramClient = new telegram_client_1.TelegramClient({ token: config.TELEGRAM_BOT_TOKEN });
    console.log('homefs-telegram-bot: ready', {
        ollamaBaseUrl: config.OLLAMA_BASE_URL,
        ollamaModel: config.OLLAMA_MODEL,
    });
    let offset;
    for (;;) {
        console.log('telegram: polling for updates');
        const updates = await telegramClient.getUpdates(offset);
        for (const update of updates) {
            offset = update.update_id + 1;
            const message = update.message?.text?.trim();
            const chatId = update.message?.chat.id;
            if (!message || !chatId) {
                continue;
            }
            try {
                console.log('telegram: received message', { chatId, message });
                const reply = await modelClient.respond(message);
                await telegramClient.sendMessage(String(chatId), reply);
                console.log('telegram: sent reply', { chatId, reply });
            }
            catch (error) {
                console.error('telegram: failed to handle message', { chatId, error });
            }
        }
    }
};
main().catch((error) => {
    console.error('Fatal error in main()', error);
    process.exitCode = 1;
});
//# sourceMappingURL=index.js.map