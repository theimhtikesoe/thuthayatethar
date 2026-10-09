/** @param {number} page @param {number} total @param {boolean} single */
export function visiblePages(page, total, single) {
  if (total < 1) return [];
  const current = Math.min(total - 1, Math.max(0, Math.trunc(page)));
  if (single || current === 0) return [current + 1];
  const left = current % 2 === 1 ? current + 1 : current;
  return [left, left + 1].filter((number) => number <= total);
}

/** @param {number} page @param {number} total @param {boolean} single @param {number} direction */
export function adjacentPage(page, total, single, direction) {
  const visible = visiblePages(page, total, single);
  if (visible.length === 0) return 0;
  if (direction > 0) return Math.min(total - 1, visible[visible.length - 1]);
  return Math.max(0, visible[0] - 1 - (single ? 1 : 2));
}

/** PageFlip uses a rightward horizontal drag to request the previous page. */
export function isPreviousPageSwipe(startX, startY, endX, endY, minDistance = 30) {
  const dx = endX - startX;
  const dy = Math.abs(endY - startY);
  return dx > minDistance && dy < minDistance * 2;
}
