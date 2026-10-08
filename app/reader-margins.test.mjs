import test from 'node:test';
import assert from 'node:assert/strict';
import { whiteMarginBounds } from './reader-margins.mjs';

function sheet() { return new Uint8ClampedArray(20 * 100 * 4).fill(255); }
function ink(data, x, y, value = 0) {
  const i = (y * 20 + x) * 4;
  data[i] = data[i + 1] = data[i + 2] = value;
}
test('removes white top and bottom rows with an eight-pixel content buffer', () => {
  const data = sheet(); ink(data, 10, 30); ink(data, 10, 69);
  assert.deepEqual(whiteMarginBounds(data, 20, 100), { top: 22, bottom: 78 });
});
test('keeps even a single faint mark near either edge', () => {
  const data = sheet(); ink(data, 0, 2, 244); ink(data, 19, 97, 244);
  assert.deepEqual(whiteMarginBounds(data, 20, 100), { top: 0, bottom: 100 });
});
test('leaves fully blank pages unchanged', () => {
  assert.deepEqual(whiteMarginBounds(sheet(), 20, 100), { top: 0, bottom: 100 });
});