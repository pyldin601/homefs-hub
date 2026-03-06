export function escapeMarkdownV2(text: string): string {
  return text.replace(/\./g, '\\.').replace(/!/g, '\\!');
}
