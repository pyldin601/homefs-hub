"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
const main = async () => {
    const config = config_1.ConfigSchema.parse(process.env);
    console.log('homefs-telegram-bot: ready', {
        ollamaBaseUrl: config.OLLAMA_BASE_URL,
        ollamaModel: config.OLLAMA_MODEL,
    });
};
main().catch((error) => {
    console.error('Fatal error in main()', error);
    process.exitCode = 1;
});
//# sourceMappingURL=index.js.map