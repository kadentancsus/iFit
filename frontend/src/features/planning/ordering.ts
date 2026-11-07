/**
 * Moves one item to a new index and returns a new array. Out-of-range moves
 * return an unchanged copy, so a stale tap on a list that just changed is harmless.
 */
export function moveItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const inRange = (index: number) => Number.isInteger(index) && index >= 0 && index < items.length;
  if (!inRange(fromIndex) || !inRange(toIndex)) return next;

  const [moved] = next.splice(fromIndex, 1) as [T];
  next.splice(toIndex, 0, moved);
  return next;
}

/** Assigns contiguous positions from array order, ready to persist. */
export const withPositions = <T>(items: readonly T[]): (T & { position: number })[] =>
  items.map((item, position) => ({ ...item, position }));
