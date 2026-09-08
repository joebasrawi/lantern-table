import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  inspectPortrait,
  MAX_PORTRAIT_BYTES,
} from '../.test-build/portrait.js';
const image = readFileSync('public/art/portraits.webp');
const buffer = image.buffer.slice(
  image.byteOffset,
  image.byteOffset + image.byteLength,
);
await test('real WebP artwork has bounded dimensions', () => {
  const result = inspectPortrait(buffer, 'image/webp');
  assert.equal(result.width, 1254);
  assert.equal(result.height, 1254);
});
await test('portrait upload rejects mismatched MIME, oversized files and SVG', () => {
  assert.throws(() => inspectPortrait(buffer, 'image/png'));
  assert.throws(() =>
    inspectPortrait(new ArrayBuffer(MAX_PORTRAIT_BYTES + 1), 'image/webp'),
  );
  assert.throws(() =>
    inspectPortrait(
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
        .buffer,
      'image/svg+xml',
    ),
  );
});
