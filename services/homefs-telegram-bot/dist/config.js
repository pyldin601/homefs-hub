"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigSchema = void 0;
const zod_1 = require("zod");
exports.ConfigSchema = zod_1.z.object({
    OLLAMA_BASE_URL: zod_1.z.string().url(),
    OLLAMA_MODEL: zod_1.z.string().min(1),
});
//# sourceMappingURL=config.js.map