import { ConfigSchema, type Config } from './config';

const main = async (): Promise<void> => {
  const config: Config = ConfigSchema.parse(process.env);
  console.log('homefs-telegram-bot: ready', {
    ollamaBaseUrl: config.OLLAMA_BASE_URL,
    ollamaModel: config.OLLAMA_MODEL,
  });
};

main().catch((error) => {
  console.error('Fatal error in main()', error);
  process.exitCode = 1;
});
