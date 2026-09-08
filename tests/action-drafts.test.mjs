import { test } from 'node:test';
import assert from 'node:assert/strict';
const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
const { actionDraftStore: store } =
  await import('../.test-build/action-drafts.js');
await test('Completing an older submission preserves newer drafts in this tab and another tab', () => {
  const key = 'lantern:action-draft:player:campaign';
  store.write(key, 'First action', false, 'wisdom');
  const submitted = store.read(key);
  store.write(
    key,
    'New action written during submission',
    true,
    'intelligence',
  );
  store.clearSubmitted(key, submitted);
  assert.equal(store.read(key).text, 'New action written during submission');
  const nextSubmitted = store.read(key);
  // Simulate another tab writing before its storage event reaches this tab.
  values.set(
    key,
    JSON.stringify({
      v: 1,
      text: 'Other tab action',
      roll: false,
      skill: 'dexterity',
      savedAt: Date.now(),
      revision: 'other',
    }),
  );
  store.clearSubmitted(key, nextSubmitted);
  assert.equal(store.read(key).text, 'Other tab action');
  assert.equal(JSON.parse(values.get(key)).text, 'Other tab action');
  store.clearSubmitted(key, store.read(key));
  assert.equal(values.has(key), false);
  assert.equal(store.read(key).text, '');
});
await test('Draft identities isolate campaigns and players; identical replacement text is still a newer edit', () => {
  const first = 'lantern:action-draft:a:one',
    second = 'lantern:action-draft:b:one',
    third = 'lantern:action-draft:a:two';
  for (const key of [first, second, third])
    store.write(key, 'Shared words', false, 'wisdom');
  const submitted = store.read(first);
  store.write(first, 'Shared words', false, 'wisdom');
  store.clearSubmitted(first, submitted);
  assert.equal(store.read(first).text, 'Shared words');
  store.clearSubmitted(first, store.read(first));
  assert.equal(store.read(second).text, 'Shared words');
  assert.equal(store.read(third).text, 'Shared words');
});
await test('Unavailable storage keeps editable drafts in memory and does not report them saved', () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
    removeItem() {
      throw new Error('blocked');
    },
  };
  try {
    const key = 'lantern:action-draft:offline:one';
    store.write(key, 'Unsaved but editable', true, 'strength');
    assert.equal(store.read(key).saved, false);
    assert.equal(store.read(key).text, 'Unsaved but editable');
    store.clearSubmitted(key, store.read(key));
    assert.equal(store.read(key).text, '');
  } finally {
    globalThis.localStorage = previous;
  }
});
