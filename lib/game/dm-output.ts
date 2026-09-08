import {
  addEvent,
  choice,
  GameError,
  proposeTransition,
  text,
  uid,
} from './engine';
import type { CampaignState, Transition } from './types';
export type Narration = {
  narrative: string;
  location: string;
  suggestions: string[];
  discoveryTitle: string;
  discoveryBody: string;
  proposal: Transition;
};
export const narrationSchema = {
  type: 'object',
  properties: {
    narrative: { type: 'string' },
    location: { type: 'string' },
    suggestions: { type: 'array', items: { type: 'string' } },
    discoveryTitle: { type: 'string' },
    discoveryBody: { type: 'string' },
    proposal: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['none', 'travel', 'encounter', 'rest'] },
        destination: { type: 'string' },
        enemy: { type: 'string' },
        count: { type: 'integer' },
      },
      required: ['kind', 'destination', 'enemy', 'count'],
      additionalProperties: false,
    },
  },
  required: [
    'narrative',
    'location',
    'suggestions',
    'discoveryTitle',
    'discoveryBody',
    'proposal',
  ],
  additionalProperties: false,
};
export function parseNarration(raw: string): Narration {
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v))
      throw new Error('Invalid shape');
    const n = v as Record<string, unknown>;
    if (!Array.isArray(n.suggestions) || n.suggestions.length > 3)
      throw new Error('Invalid suggestions');
    const p = n.proposal as Record<string, unknown>;
    if (!p || typeof p !== 'object') throw new Error('Missing proposal');
    const kind = choice(
      p.kind,
      ['none', 'travel', 'encounter', 'rest'],
      'proposal',
    );
    let proposal: Transition = { kind: 'none' };
    if (kind === 'travel')
      proposal = { kind, destination: text(p.destination, 'Destination', 80) };
    if (kind === 'encounter') {
      if (
        !Number.isInteger(p.count) ||
        Number(p.count) < 1 ||
        Number(p.count) > 6
      )
        throw new Error('Invalid enemy count');
      proposal = {
        kind,
        enemy: text(p.enemy, 'Enemy', 60),
        count: Number(p.count),
      };
    }
    if (kind === 'rest') proposal = { kind };
    return {
      narrative: text(n.narrative, 'Narration', 6000),
      location: text(n.location, 'Location', 80),
      suggestions: n.suggestions.map((x) => text(x, 'Suggestion', 120)),
      discoveryTitle: text(n.discoveryTitle, 'Discovery title', 100, true),
      discoveryBody: text(n.discoveryBody, 'Discovery', 1000, true),
      proposal,
    };
  } catch {
    throw new GameError(
      'The DM response was invalid. No action was saved; please try again.',
      503,
    );
  }
}
export function applyNarration(s: CampaignState, n: Narration) {
  // Check the proposal before adding narrative: an invalid response must be atomic.
  if (n.proposal.kind !== 'none') proposeTransition(s, n.proposal);
  addEvent(s, 'narration', 'Dungeon Master', n.narrative);
  s.suggestions = n.suggestions;
  if (n.discoveryTitle && n.discoveryBody)
    s.journal.push({
      id: uid(),
      category: 'Discoveries',
      title: n.discoveryTitle,
      body: n.discoveryBody,
      completed: false,
    });
  // n.location is descriptive context, not authority to move anyone.
}
