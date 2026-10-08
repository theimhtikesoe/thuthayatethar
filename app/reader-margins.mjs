/** Detect only uninterrupted, near-white rows at the top and bottom.
 * Keep a small safety buffer and leave blank pages unchanged.
 */
export function whiteMarginBounds(data, width, height, padding = 8) {
  const whiteRow = (y) => {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] > 0 && (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245)) return false;
    }
    return true;
  };
  let top = 0;
  while (top < height && whiteRow(top)) top++;
  if (top === height) return { top: 0, bottom: height };
  let bottom = height;
  while (bottom > top && whiteRow(bottom - 1)) bottom--;
  return { top: Math.max(0, top - padding), bottom: Math.min(height, bottom + padding) };
}