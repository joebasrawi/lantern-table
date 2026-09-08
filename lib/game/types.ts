export const MAX_LEVEL = 10;
/** Cumulative experience needed to advance from the current level. */
export const nextLevelXp = (level: number) => 50 * level * (level + 1);
export type Rules = 'quickplay' | 'tactical';
export type DMMode = 'ai' | 'human' | 'assisted';
export type Settings = {
  dm: DMMode;
  rules: Rules;
  pace: 'wait' | 'deadline' | 'host';
  deadlineHours: number;
  absence: 'wait' | 'defend';
  decision: 'unanimous' | 'majority' | 'host';
  customization: 'standard' | 'reskin' | 'custom';
  tone: string;
  boundaries: string;
};
export type Stats = {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
};
export type CustomAbility = {
  id: string;
  name: string;
  description: string;
  effect: 'strike' | 'mend';
  approved: boolean;
};
export const ABILITY_EFFECTS = {
  strike:
    'Attack for 8 damage using your role’s range and attack roll. Costs 1 energy.',
  mend: 'Recover up to 6 of your own health. Costs 1 energy.',
};
export type Character = {
  id: string;
  userId: string;
  name: string;
  ancestry: string;
  role: string;
  concept: string;
  abilities?: CustomAbility[];
  portrait: number;
  portraitAsset?: string;
  portraitUrl?: string;
  hp: number;
  maxHp: number;
  armor: number;
  energy: number;
  maxEnergy: number;
  stats: Stats;
  inventory: string[];
  notes: string;
  dmNotes: string;
  level: number;
  xp: number;
  absenceConsent: boolean;
  hostDefenseConsent?: boolean;
  x: number;
  y: number;
};
export type Event = {
  id: string;
  at: string;
  kind: 'narration' | 'action' | 'roll' | 'system' | 'chat';
  author: string;
  text: string;
  userId?: string;
};
export type Journal = {
  id: string;
  category: 'Story' | 'Quests' | 'People' | 'Discoveries';
  title: string;
  body: string;
  completed: boolean;
};
export type Enemy = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  armor: number;
  x: number;
  y: number;
};
export type Encounter = {
  round: number;
  order: string[];
  index: number;
  enemies: Enemy[];
  defending: string[];
  deadline: string | null;
};
export type Transition =
  | { kind: 'travel'; destination: string }
  | { kind: 'encounter'; enemy: string; count: number }
  | { kind: 'rest' }
  | { kind: 'none' };
export type Decision = {
  id: string;
  question: string;
  options: string[];
  votes: Record<string, number>;
  effects?: Transition[];
  deadline: string | null;
};
export type Pending = {
  id: string;
  userId: string;
  author: string;
  text: string;
  roll: string;
  at: string;
};
export type CampaignState = {
  sceneAsset?: string;
  sceneUrl?: string;
  title: string;
  setting: string;
  premise: string;
  location: string;
  settings: Settings;
  pendingSettings?: Pick<Settings, 'dm' | 'rules' | 'decision'>;
  characters: Character[];
  events: Event[];
  journal: Journal[];
  encounter: Encounter | null;
  decision: Decision | null;
  pending: Pending[];
  dmNotes: string;
  suggestions: string[];
  visited: string[];
  receipts: Record<string, string>;
  seen: Record<string, string>;
};
export type CampaignView = {
  id: string;
  hostId: string;
  version: number;
  invite?: string;
  state: CampaignState;
  members: { userId: string; name: string }[];
};
export type User = { id: string; name: string };
export const DEFAULT_SETTINGS: Settings = {
  dm: 'ai',
  rules: 'quickplay',
  pace: 'wait',
  deadlineHours: 24,
  absence: 'wait',
  decision: 'unanimous',
  customization: 'reskin',
  tone: 'Adventurous',
  boundaries: '',
};
export const ROLES = ['Vanguard', 'Wayfinder', 'Arcanist', 'Envoy'];
export const PRESETS = [
  {
    name: 'Elara',
    ancestry: 'Human',
    role: 'Wayfinder',
    concept: 'A watchful traveler with a debt to repay.',
    portrait: 0,
  },
  {
    name: 'Mara',
    ancestry: 'Human',
    role: 'Envoy',
    concept: 'A silver-tongued investigator who trusts nobody completely.',
    portrait: 1,
  },
  {
    name: 'Felix',
    ancestry: 'Elf',
    role: 'Arcanist',
    concept: 'A curious scholar chasing a dangerous discovery.',
    portrait: 2,
  },
  {
    name: 'Torren',
    ancestry: 'Dwarf',
    role: 'Vanguard',
    concept: 'A steadfast guardian looking for a new purpose.',
    portrait: 3,
  },
];
export const WORLDS = [
  {
    id: 'fantasy',
    name: 'The Lantern Coast',
    setting:
      'A rain-soaked fantasy coast of old magic, harbor towns, and forgotten promises.',
    location: 'The Wreck & Lantern',
    premise:
      'A sealed letter bears a crest nobody has used in a hundred years. Find who sent it, and why they chose your party.',
  },
  {
    id: 'scifi',
    name: 'The Last Signal',
    setting:
      'A remote orbital station at the edge of charted space. Unreliable technology, strange signals, and competing factions.',
    location: 'Docking Ring Seven',
    premise:
      'An abandoned survey ship has returned with its crew missing and a distress call dated tomorrow.',
  },
  {
    id: 'mystery',
    name: 'After Midnight',
    setting:
      'A modern coastal city. Rain, late-night diners, old money, and secrets. No supernatural powers.',
    location: 'The Night Window',
    premise:
      'A missing journalist left each of you a different piece of the same photograph. Tonight, someone wants it back.',
  },
];
