const main = async (): Promise<void> => {
  console.log('homefs-telegram-bot: ready');
};

main().catch((error) => {
  console.error('Fatal error in main()', error);
  process.exitCode = 1;
});
