const VIEWPORT_RESET_SEQUENCE = "\u001B[2J\u001B[3J\u001B[H";

/**
 * Clears terminal viewport + scrollback and homes cursor.
 * Use this before major route transitions when rendering inline images.
 */
export function clearTerminalViewport() {
  if (!process.stdout.isTTY) return;
  process.stdout.write(VIEWPORT_RESET_SEQUENCE);
}
