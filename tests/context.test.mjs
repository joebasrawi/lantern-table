import test from 'node:test';
import assert from 'node:assert/strict';
import { narrationContext, recallHistory } from '../.test-build/context.js';
import { initialState, makeCharacter } from '../.test-build/engine.js';
import { DEFAULT_SETTINGS, PRESETS } from '../.test-build/types.js';
function event(id, text, kind = 'narration') {
  return {
    id,
    at: `2026-01-01T00:00:${String(id).padStart(2, '0')}Z`,
    kind,
    author: 'DM',
    text,
  };
}
function game() {
  return initialState(
    'Memory',
    'Fantasy',
    'Explore',
    'Harbor',
    DEFAULT_SETTINGS,
  );
}
await test('older named discoveries are recalled separately from recent events', () => {
  const s = game();
  s.events = [
    event('old', 'Alda entrusted the cobalt compass to the party.'),
    ...Array.from({ length: 40 }, (_, i) =>
      event(String(i), 'Rain falls over the harbor.'),
    ),
  ];
  const context = narrationContext(s, 'I ask Alda about the cobalt compass.');
  assert.equal(context.earlierHistory[0].id, 'old');
  assert.equal(context.recent.length, 32);
  assert.ok(!context.recent.some((e) => e.id === 'old'));
});
await test('private notes and out-of-character chat never enter recall or model context', () => {
  const s = game();
  const c = makeCharacter(PRESETS[0], 'one', s);
  c.notes = 'PRIVATE NOTE';
  c.dmNotes = 'DM SHARED PRIVATE';
  s.characters = [c];
  s.dmNotes = 'HOST SECRET';
  s.events = [
    event('chat', 'Alda PRIVATE CHAT', 'chat'),
    ...Array.from({ length: 40 }, (_, i) => event(String(i), 'Rain falls.')),
  ];
  const context = JSON.stringify(narrationContext(s, 'Alda'));
  for (const forbidden of [
    'PRIVATE NOTE',
    'DM SHARED PRIVATE',
    'HOST SECRET',
    'PRIVATE CHAT',
  ])
    assert.ok(!context.includes(forbidden));
  assert.deepEqual(recallHistory(s.events, 'Alda', 'Harbor'), []);
});
await test('rare details late in long records remain searchable and excerpts include the match', () => {
  const s = game();
  s.events = [
    event(
      'long',
      'Ordinary rain '.repeat(400) + 'The obsidian-key opens the vault.',
    ),
    ...Array.from({ length: 40 }, (_, i) =>
      event(String(i), 'Unrelated travel.'),
    ),
  ];
  const context = narrationContext(s, 'obsidian-key');
  assert.ok(context.earlierHistory[0].text.includes('obsidian-key'));
  assert.ok(context.earlierHistory[0].text.length <= 900);
});
await test('journal retrieval finds relevant old entries beyond the previous recent-entry window', () => {
  const s = game();
  s.journal = Array.from({ length: 90 }, (_, i) => ({
    id: String(i),
    category: 'Discoveries',
    title: i === 0 ? 'Cobalt compass' : 'Ordinary weather',
    body: i === 0 ? 'Alda can repair it.' : 'Rain on the coast.',
    completed: false,
  }));
  assert.equal(narrationContext(s, 'Cobalt compass').journal[0].id, '0');
});
await test('history sections stay bounded and preserve the distinction between attempts and narration', () => {
  const s = game();
  s.events = Array.from({ length: 100 }, (_, i) =>
    event(String(i), 'Cobalt '.repeat(800), i === 0 ? 'action' : 'narration'),
  );
  const context = narrationContext(s, 'Cobalt');
  assert.ok(context.earlierHistory.length <= 6);
  assert.ok(context.recent.reduce((n, e) => n + e.text.length, 0) <= 14000);
  const events = [
    event('attempt', 'I steal the cobalt compass.', 'action'),
    ...Array.from({ length: 32 }, (_, i) => event(String(i), 'Rain.')),
  ];
  assert.equal(recallHistory(events, 'cobalt', 'Harbor')[0].kind, 'action');
  assert.deepEqual(recallHistory(events, 'unrelated', 'Harbor'), []);
});
