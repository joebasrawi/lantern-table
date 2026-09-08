import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignAttention } from '../.test-build/attention.js';
import {
  initialState,
  makeCharacter,
  startEncounter,
} from '../.test-build/engine.js';
import { DEFAULT_SETTINGS, PRESETS } from '../.test-build/types.js';
const setup = () => {
  const s = initialState('Test', 'Future', 'Find a signal', 'Station', {
    ...DEFAULT_SETTINGS,
    dm: 'human',
  });
  s.characters = [
    makeCharacter(PRESETS[0], 'one', s),
    makeCharacter(PRESETS[1], 'two', s),
  ];
  return s;
};
await test('combat attention belongs only to the living acting character', () => {
  const s = setup();
  startEncounter(s, 'Guard', 1);
  assert.deepEqual(campaignAttention(s, 'one', false), {
    label: 'Your combat turn',
    needsAction: true,
  });
  for (const user of ['two', 'host'])
    assert.equal(campaignAttention(s, user, true).needsAction, false);
  s.characters[0].hp = 0;
  assert.equal(campaignAttention(s, 'one', false).needsAction, false);
});
await test('votes distinguish an unanswered vote, a saved zero vote, observers and host decisions', () => {
  const s = setup();
  s.decision = {
    id: 'vote',
    question: 'Where?',
    options: ['North', 'South'],
    votes: { one: 0 },
    deadline: null,
  };
  assert.equal(
    campaignAttention(s, 'one', false).label,
    'Vote saved · waiting for the party',
  );
  assert.equal(campaignAttention(s, 'two', false).needsAction, true);
  assert.equal(campaignAttention(s, 'host', true).needsAction, false);
  s.settings.decision = 'host';
  assert.equal(
    campaignAttention(s, 'host', true).label,
    'Choose for the party',
  );
  assert.equal(campaignAttention(s, 'host', true).needsAction, true);
  assert.equal(campaignAttention(s, 'two', false).needsAction, false);
});
await test('pending actions route human and assisted hosts to DM work and the author to waiting', () => {
  const s = setup();
  s.pending = [
    {
      id: 'action',
      userId: 'two',
      author: 'Player',
      text: 'SECRET ATTEMPT',
      roll: '',
      at: '',
    },
  ];
  for (const mode of ['human', 'assisted']) {
    s.settings.dm = mode;
    assert.equal(
      campaignAttention(s, 'host', true).label,
      'Resolve player actions',
    );
    assert.equal(
      campaignAttention(s, 'two', false).label,
      'Waiting for the dungeon master',
    );
    assert.equal(campaignAttention(s, 'one', false).label, 'Ready to explore');
  }
  assert.equal(campaignAttention(s, 'new', false).needsAction, false);
  assert.doesNotMatch(
    JSON.stringify(campaignAttention(s, 'host', true)),
    /SECRET/,
  );
});
await test('onboarding and ability review distinguish a host who does not need a character', () => {
  const s = setup();
  assert.equal(campaignAttention(s, 'host', true).needsAction, false);
  assert.equal(
    campaignAttention(s, 'new', false).label,
    'Create your character',
  );
  s.settings.dm = 'ai';
  assert.equal(campaignAttention(s, 'host', true).needsAction, true);
  s.characters[1].abilities = [
    {
      id: 'proposal',
      name: 'Hidden proposal',
      effect: 'strike',
      description: '',
      approved: false,
    },
  ];
  assert.equal(
    campaignAttention(s, 'one', true).label,
    'Review proposed abilities',
  );
  assert.equal(campaignAttention(s, 'one', false).label, 'Ready to explore');
});
await test('attention is read-only and an unconscious character can still vote on recovery', () => {
  const s = setup();
  s.characters[0].hp = 0;
  assert.equal(
    campaignAttention(s, 'one', false).label,
    'Waiting for recovery',
  );
  s.decision = {
    id: 'recovery',
    question: 'Recover?',
    options: ['Yes', 'No'],
    votes: {},
    deadline: null,
  };
  const before = structuredClone(s);
  assert.equal(campaignAttention(s, 'one', false).needsAction, true);
  assert.deepEqual(s, before);
});
