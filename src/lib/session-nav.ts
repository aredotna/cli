export function wrapIndex(
  current: number,
  length: number,
  delta: -1 | 1,
): number {
  if (length <= 0) return 0;
  return (current + delta + length) % length;
}

export function orderedBlockIndexByCursor<T extends { type: string }>(
  items: T[],
  cursor: number,
): number {
  if (cursor < 0 || cursor >= items.length) return -1;
  let blockIndex = -1;
  for (let i = 0; i <= cursor; i++) {
    if (items[i]!.type !== "Channel") blockIndex += 1;
  }
  return blockIndex;
}

export function clampBlockIndex(
  index: number,
  blockCount: number,
): number | null {
  if (blockCount <= 0) return null;
  return Math.max(0, Math.min(index, blockCount - 1));
}
