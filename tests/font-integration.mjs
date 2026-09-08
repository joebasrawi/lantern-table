import assert from 'node:assert/strict';

const origin = process.env.TEST_ORIGIN || 'http://localhost:3017';
const response = await fetch(origin + '/');
assert.equal(response.status, 200);
const html = await response.text();
const preloads = [...html.matchAll(/<link\b[^>]*\bas="font"[^>]*>/g)].map(
  ([tag]) => tag.match(/\bhref="([^"]+)"/)?.[1],
);
assert.ok(
  preloads.length >= 2,
  'The page should preload its UI and story fonts',
);
const cssFonts = [...html.matchAll(/url\(['"]?([^)'"\s]+\.woff2)['"]?\)/g)].map(
  (match) => match[1],
);
assert.ok(cssFonts.length > 0, 'The page should emit self-hosted font CSS');
const urls = [...new Set([...preloads, ...cssFonts])];
for (const href of urls) {
  assert.ok(href);
  const url = new URL(href, origin);
  assert.equal(url.origin, origin, 'Fonts must use the game’s own origin');
  assert.ok(
    url.pathname.startsWith('/_next/static/'),
    `Font URL is not a public asset: ${url.pathname}`,
  );
  const font = await fetch(url);
  assert.equal(font.status, 200, `Font request failed: ${url.pathname}`);
  const bytes = new Uint8Array(await font.arrayBuffer());
  assert.equal(
    new TextDecoder().decode(bytes.slice(0, 4)),
    'wOF2',
    'Font URL must serve WOFF2 bytes, not a fallback page',
  );
}
console.log(
  `PASS: ${preloads.length} font preloads and all ${urls.length} emitted font assets load from public URLs`,
);
