import {
  DEFAULT_SETTINGS,
  MAX_LEVEL,
  nextLevelXp,
  ROLES,
  roleHealth,
  roleArmor,
  type CampaignState,
  type Character,
  type Event,
  type Settings,
  type Stats,
  type Transition,
} from './types';
export class GameError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export function addEvent(
  s: CampaignState,
  kind: Event['kind'],
  author: string,
  text: string,
  userId?: string,
) {
  s.events.push({
    id: uid(),
    at: now(),
    kind,
    author,
    text,
    ...(userId ? { userId } : {}),
  });
}
export function text(
  v: unknown,
  label: string,
  max = 1000,
  optional = false,
): string {
  if (optional && (v === undefined || v === '')) return '';
  if (typeof v !== 'string' || !v.trim() || v.length > max)
    throw new GameError(`${label} must be between 1 and ${max} characters.`);
  return v.trim();
}
export function choice<T extends string>(
  v: unknown,
  values: readonly T[],
  label: string,
): T {
  if (!values.includes(v as T)) throw new GameError(`Choose a valid ${label}.`);
  return v as T;
}
export function settings(input: unknown): Settings {
  const v = input as Record<string, unknown>;
  if (!v || typeof v !== 'object')
    throw new GameError('Settings are required.');
  const h = Number(v.deadlineHours);
  if (!Number.isInteger(h) || h < 1 || h > 168)
    throw new GameError('Choose a deadline from 1 to 168 hours.');
  return {
    dm: choice(v.dm, ['ai', 'human', 'assisted'], 'DM'),
    rules: choice(v.rules, ['quickplay', 'tactical'], 'rules system'),
    pace: choice(v.pace, ['wait', 'deadline', 'host'], 'pace'),
    deadlineHours: h,
    absence: choice(v.absence, ['wait', 'defend'], 'absence policy'),
    decision: choice(
      v.decision,
      ['unanimous', 'majority', 'host'],
      'decision rule',
    ),
    customization: choice(
      v.customization,
      ['standard', 'reskin', 'custom'],
      'customization',
    ),
    tone: text(v.tone, 'Tone', 100),
    boundaries: text(v.boundaries, 'Boundaries', 1000, true),
  };
}
export function initialState(
  title: string,
  setting: string,
  premise: string,
  location: string,
  opts: Settings = DEFAULT_SETTINGS,
): CampaignState {
  const s: CampaignState = {
    title,
    setting,
    premise,
    location,
    settings: opts,
    characters: [],
    events: [],
    journal: [
      {
        id: uid(),
        category: 'Quests',
        title: 'The first lead',
        body: premise,
        completed: false,
      },
    ],
    encounter: null,
    decision: null,
    pending: [],
    dmNotes: '',
    suggestions: ['Look around', 'Ask about the first lead'],
    visited: [location],
    receipts: {},
    seen: {},
  };
  addEvent(
    s,
    'narration',
    'Dungeon Master',
    `${premise}\n\nYou arrive at ${location}. Take a moment to introduce yourself, then decide where to begin.`,
  );
  return s;
}
function startingStats(input: unknown): Stats {
  const defaults: Stats = {
    strength: 10,
    dexterity: 12,
    constitution: 13,
    intelligence: 8,
    wisdom: 14,
    charisma: 15,
  };
  const stats = (input ?? defaults) as Stats;
  const keys = Object.keys(defaults) as (keyof Stats)[];
  if (
    keys.some((k) => !Number.isInteger(stats[k])) ||
    keys
      .map((k) => stats[k])
      .sort((a, b) => a - b)
      .join(',') !== '8,10,12,13,14,15'
  )
    throw new GameError(
      'Assign each starting score once: 15, 14, 13, 12, 10, 8.',
    );
  return Object.fromEntries(keys.map((k) => [k, stats[k]])) as Stats;
}

export function makeCharacter(
  v: Record<string, unknown>,
  userId: string,
  s: CampaignState,
): Character {
  const role = choice(v.role, ROLES, 'role');
  const ancestry = text(v.ancestry, 'Species or type', 60);
  if (
    s.settings.customization === 'standard' &&
    !['Human', 'Elf', 'Dwarf', 'Halfling', 'Android'].includes(ancestry)
  )
    throw new GameError('This campaign allows standard species only.');
  const stats = startingStats(v.stats);
  const maxHp = roleHealth(role);
  const portrait = Number(v.portrait);
  if (!Number.isInteger(portrait) || portrait < 0 || portrait > 3)
    throw new GameError('Choose a portrait.');
  return {
    id: uid(),
    userId,
    name: text(v.name, 'Name', 50),
    ancestry,
    role,
    concept: text(v.concept, 'Character concept', 1000),
    portrait,
    hp: maxHp,
    maxHp,
    armor: roleArmor(role),
    energy: 3,
    maxEnergy: 3,
    stats,
    inventory: [
      'Travel supplies',
      'Healing kit',
      role === 'Arcanist'
        ? 'Focus'
        : role === 'Wayfinder'
          ? 'Ranged weapon'
          : 'Light weapon',
    ],
    notes: '',
    dmNotes: '',
    level: 1,
    xp: 0,
    absenceConsent: v.absenceConsent === true,
    hostDefenseConsent: v.hostDefenseConsent === true,
    x: s.characters.length % 7,
    y: 5 + Math.floor(s.characters.length / 7),
  };
}
export const modifier = (score: number) => Math.floor((score - 10) / 2);
export function die(sides = 20): number {
  const x = new Uint32Array(1);
  const cap = Math.floor(4294967296 / sides) * sides;
  do {
    crypto.getRandomValues(x);
  } while (x[0] >= cap);
  return (x[0] % sides) + 1;
}
export const deadline = (s: CampaignState) =>
  s.settings.pace === 'deadline'
    ? new Date(Date.now() + s.settings.deadlineHours * 3600000).toISOString()
    : null;
export function check(
  c: Character,
  s: CampaignState,
  skill: keyof Stats,
  roll: () => number = die,
) {
  const d = roll();
  const bonus =
    s.settings.rules === 'quickplay' ? 2 : modifier(c.stats[skill]) + 2;
  return {
    die: d,
    bonus,
    total: d + bonus,
    description: `d20 ${d} + ${bonus} = ${d + bonus}`,
  };
}
export function startEncounter(s: CampaignState, name: string, count: number) {
  if (s.encounter) throw new GameError('An encounter is already running.');
  const chars = s.characters.filter((c) => c.hp > 0);
  if (!chars.length) throw new GameError('Create a character first.');
  s.encounter = {
    round: 1,
    index: 0,
    order: [...chars]
      .sort((a, b) => b.stats.dexterity - a.stats.dexterity)
      .map((c) => c.id),
    enemies: Array.from({ length: count }, (_, i) => ({
      id: uid(),
      name: count > 1 ? `${name} ${i + 1}` : name,
      hp: 12,
      maxHp: 12,
      armor: 12,
      x: (i % 4) * 2,
      y: 1 + Math.floor(i / 4),
    })),
    defending: [],
    deadline: deadline(s),
  };
  addEvent(
    s,
    'system',
    'Encounter',
    `${name} blocks your path. Initiative follows Dexterity. ${chars.find((c) => c.id === s.encounter!.order[0])!.name} acts first.`,
  );
}
function advance(s: CampaignState, roll: () => number) {
  const e = s.encounter!;
  e.index++;
  if (e.index >= e.order.length) {
    e.index = 0;
    e.round++;
    for (const enemy of e.enemies.filter((x) => x.hp > 0)) {
      const target = s.characters.filter((x) => x.hp > 0)[0];
      if (!target) break;
      const d = roll();
      const hit =
        d + 3 >= target.armor + (e.defending.includes(target.id) ? 3 : 0);
      if (hit) target.hp = Math.max(0, target.hp - 4);
      addEvent(
        s,
        'roll',
        enemy.name,
        `${d} + 3 vs ${target.armor + (e.defending.includes(target.id) ? 3 : 0)} armor. ${hit ? `${target.name} takes 4 damage.` : 'Miss.'}`,
      );
    }
    e.defending = [];
  }
  if (!s.characters.some((c) => c.hp > 0)) {
    s.encounter = null;
    addEvent(
      s,
      'system',
      'Encounter',
      s.settings.dm === 'ai'
        ? 'The party is defeated and the encounter is lost. Choose together whether to recover and continue.'
        : 'The party is down. The DM must decide the consequence and recovery.',
    );
    if (s.settings.dm === 'ai') proposeTransition(s, { kind: 'rest' });
    return;
  }
  let tries = 0;
  while (
    tries++ < e.order.length &&
    !s.characters.some((c) => c.id === e.order[e.index] && c.hp > 0)
  )
    e.index = (e.index + 1) % e.order.length;
  e.deadline = deadline(s);
}
export function combat(
  s: CampaignState,
  userId: string,
  action: string,
  targetId?: string,
  x?: number,
  y?: number,
  roll: () => number = die,
  abilityId?: string,
) {
  const e = s.encounter;
  if (!e) throw new GameError('There is no active encounter.');
  const c = s.characters.find((c) => c.userId === userId);
  if (!c || c.id !== e.order[e.index])
    throw new GameError('It is not your turn.', 409);
  if (c.hp <= 0) throw new GameError('Your character is down.');
  const ability =
    action === 'ability'
      ? c.abilities?.find((a) => a.id === abilityId && a.approved)
      : undefined;
  if (action === 'ability' && !ability)
    throw new GameError('Choose one of your approved abilities.');
  if (ability?.effect === 'strike') action = 'power';
  if (ability?.effect === 'mend') {
    if (c.energy < 1) throw new GameError('You have no energy left.');
    if (c.hp >= c.maxHp) throw new GameError('You are already at full health.');
    const healed = Math.min(6, c.maxHp - c.hp);
    c.energy--;
    c.hp += healed;
    addEvent(
      s,
      'action',
      c.name,
      `${ability.name}: recovers ${healed} health for 1 energy.`,
      userId,
    );
  } else if (action === 'attack' || action === 'power') {
    const enemy = e.enemies.find((t) => t.id === targetId && t.hp > 0);
    if (!enemy) throw new GameError('Choose a living target.');
    if (
      s.settings.rules === 'tactical' &&
      Math.abs(c.x - enemy.x) + Math.abs(c.y - enemy.y) >
        (c.role === 'Wayfinder' || c.role === 'Arcanist' ? 6 : 1)
    )
      throw new GameError('Move closer to your target first.');
    if (action === 'power' && c.energy < 1)
      throw new GameError('You have no energy left.');
    const r = check(
      c,
      s,
      c.role === 'Arcanist'
        ? 'intelligence'
        : c.role === 'Wayfinder'
          ? 'dexterity'
          : 'strength',
      roll,
    );
    if (action === 'power') c.energy--;
    const hit = r.die === 20 || (r.die !== 1 && r.total >= enemy.armor);
    const damage = (action === 'power' ? 8 : 5) * (r.die === 20 ? 2 : 1);
    if (hit) enemy.hp = Math.max(0, enemy.hp - damage);
    addEvent(
      s,
      'roll',
      c.name,
      `${ability?.name || (action === 'power' ? 'Power' : 'Attack')}: ${r.description} vs ${enemy.armor} armor. ${hit ? `${damage} damage to ${enemy.name}.` : 'Miss.'}`,
      userId,
    );
  } else if (action === 'defend') {
    e.defending.push(c.id);
    addEvent(
      s,
      'action',
      c.name,
      'Takes cover. +3 armor until the next round.',
      userId,
    );
  } else if (action === 'heal') {
    const idx = c.inventory.indexOf('Healing kit');
    if (idx < 0) throw new GameError('You do not have a healing kit.');
    if (c.hp === c.maxHp)
      throw new GameError('You are already at full health.');
    c.inventory.splice(idx, 1);
    const healed = Math.min(8, c.maxHp - c.hp);
    c.hp += healed;
    addEvent(
      s,
      'action',
      c.name,
      `Uses a healing kit and recovers ${healed} health.`,
      userId,
    );
  } else if (action === 'move') {
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x! < 0 ||
      x! > 7 ||
      y! < 0 ||
      y! > 7 ||
      Math.abs(c.x - x!) + Math.abs(c.y - y!) > 3 ||
      e.enemies.some((t) => t.hp > 0 && t.x === x && t.y === y) ||
      s.characters.some(
        (t) => t.id !== c.id && t.hp > 0 && t.x === x && t.y === y,
      )
    )
      throw new GameError('Choose a free tile within 3 spaces.');
    c.x = x!;
    c.y = y!;
    addEvent(s, 'action', c.name, `Moves to ${x! + 1}, ${y! + 1}.`, userId);
  } else throw new GameError('Choose attack, power, defend, heal, or move.');
  if (e.enemies.every((t) => t.hp === 0)) {
    s.encounter = null;
    s.characters.forEach((t) => (t.xp += 25));
    addEvent(
      s,
      'system',
      'Encounter',
      'Encounter complete. Each character earns 25 experience.',
    );
    return;
  }
  advance(s, roll);
}
export function expireTurn(s: CampaignState) {
  const e = s.encounter;
  if (
    !e?.deadline ||
    s.settings.pace !== 'deadline' ||
    !Number.isFinite(Date.parse(e.deadline)) ||
    Date.parse(e.deadline) > Date.now() ||
    s.settings.absence !== 'defend'
  )
    return false;
  const c = s.characters.find((c) => c.id === e.order[e.index]);
  if (!c?.absenceConsent) return false;
  combat(s, c.userId, 'defend');
  return true;
}
export function voteResult(
  s: CampaignState,
  host: boolean = false,
): number | null {
  const d = s.decision;
  if (!d) return null;
  const votes = Object.entries(d.votes)
    .filter(([id]) => s.characters.some((c) => c.userId === id))
    .map(([, v]) => v);
  const counts = d.options.map((_, i) => votes.filter((v) => v === i).length);
  const top = Math.max(...counts);
  if (!top || counts.filter((c) => c === top).length !== 1) return null;
  if (s.settings.decision === 'host' && !host) return null;
  if (s.settings.decision === 'unanimous' && top !== s.characters.length)
    return null;
  if (s.settings.decision === 'majority' && top <= s.characters.length / 2)
    return null;
  return counts.indexOf(top);
}
export function sanitize(
  s: CampaignState,
  userId: string,
  host: boolean,
): CampaignState {
  const copy = structuredClone(s);
  copy.receipts = {};
  copy.seen = { [userId]: copy.seen[userId] || '' };
  copy.characters = copy.characters.map((c) => ({
    ...c,
    notes: c.userId === userId ? c.notes : '',
    dmNotes: host || c.userId === userId ? c.dmNotes : '',
  }));
  if (!host) {
    copy.dmNotes = '';
    copy.pending = copy.pending.filter((p) => p.userId === userId);
  }
  return copy;
}

/** Only validated mechanical transitions reach this boundary; free text never edits resources. */
export function proposeTransition(s: CampaignState, effect: Transition) {
  if (effect.kind === 'none') return;
  if (s.decision || s.encounter || s.pending.length)
    throw new GameError(
      'Finish the current decision or encounter before advancing.',
      409,
    );
  if (!s.characters.length)
    throw new GameError('The party needs a character first.');
  let question: string;
  if (effect.kind === 'travel') {
    const destination = text(effect.destination, 'Destination', 80);
    if (destination === s.location)
      throw new GameError('The party is already there.');
    effect = { kind: 'travel', destination };
    question = `Travel to ${destination}?`;
  } else if (effect.kind === 'encounter') {
    const enemy = text(effect.enemy, 'Enemy', 60);
    if (!Number.isInteger(effect.count) || effect.count < 1 || effect.count > 6)
      throw new GameError('An encounter needs 1 to 6 enemies.');
    effect = { kind: 'encounter', enemy, count: effect.count };
    question = `Face ${effect.count} ${enemy}${effect.count === 1 ? '' : ' enemies'}?`;
  } else if (effect.kind === 'rest') question = 'Take a safe rest and recover?';
  else throw new GameError('Unsupported game transition.');
  s.decision = {
    id: uid(),
    question,
    options: ['Proceed', 'Stay here for now'],
    votes: {},
    deadline: deadline(s),
    effects: [effect, { kind: 'none' }],
  };
  addEvent(s, 'system', 'Party decision', question);
}

export function resolveDecision(s: CampaignState, winner: number) {
  const d = s.decision;
  if (
    !d ||
    !Number.isInteger(winner) ||
    winner < 0 ||
    winner >= d.options.length
  )
    throw new GameError('That decision is no longer available.', 409);
  if (s.encounter)
    throw new GameError(
      'Finish the encounter before resolving this decision.',
      409,
    );
  const effect = d.effects?.[winner];
  addEvent(
    s,
    'system',
    'Party decision',
    `${d.question}\nThe party chose: ${d.options[winner]}`,
  );
  s.journal.push({
    id: uid(),
    category: 'Story',
    title: 'A party decision',
    body: `${d.question} — ${d.options[winner]}`,
    completed: true,
  });
  s.decision = null;
  if (effect?.kind === 'travel') {
    s.location = effect.destination;
    if (!s.visited.includes(s.location)) s.visited.push(s.location);
    s.suggestions = ['Look around', 'Investigate the next lead'];
    addEvent(s, 'system', 'Travel', `The party arrives at ${s.location}.`);
  } else if (effect?.kind === 'encounter')
    startEncounter(s, effect.enemy, effect.count);
  else if (effect?.kind === 'rest') {
    s.characters.forEach((c) => {
      c.hp = c.maxHp;
      c.energy = c.maxEnergy;
    });
    addEvent(
      s,
      'system',
      'Rest',
      'The party rests and recovers health and energy.',
    );
  }
}

/** Scheduling can change now; adjudication changes wait until the current scene operation ends. */
export function updateSettings(s: CampaignState, next: Settings) {
  const current = s.settings;
  const active = !!(s.encounter || s.decision || s.pending.length);
  const staged =
    active &&
    (next.dm !== current.dm ||
      next.rules !== current.rules ||
      next.decision !== current.decision);
  s.pendingSettings = staged
    ? { dm: next.dm, rules: next.rules, decision: next.decision }
    : undefined;
  s.settings = active
    ? {
        ...next,
        dm: current.dm,
        rules: current.rules,
        decision: current.decision,
      }
    : next;
  if (
    next.pace !== current.pace ||
    next.deadlineHours !== current.deadlineHours
  ) {
    if (s.encounter) s.encounter.deadline = deadline(s);
    if (s.decision) s.decision.deadline = deadline(s);
  }
  addEvent(
    s,
    'system',
    'Campaign settings',
    `The host updated campaign settings. Pace: ${next.pace}; absence: ${next.absence}.${staged ? ` Queued for after current play: DM ${next.dm}, rules ${next.rules}, decisions ${next.decision}.` : ` DM: ${next.dm}; rules: ${next.rules}; decisions: ${next.decision}.`}`,
  );
}
export function applyQueuedSettings(s: CampaignState) {
  if (!s.pendingSettings || s.encounter || s.decision || s.pending.length)
    return false;
  s.settings = { ...s.settings, ...s.pendingSettings };
  delete s.pendingSettings;
  addEvent(
    s,
    'system',
    'Campaign settings',
    `Queued settings now apply: DM ${s.settings.dm}, rules ${s.settings.rules}, decisions ${s.settings.decision}.`,
  );
  return true;
}

export function levelUp(s: CampaignState, userId: string, growth: unknown) {
  const c = s.characters.find((c) => c.userId === userId);
  if (!c) throw new GameError('Create your character first.');
  const selected = choice(growth, ['vitality', 'focus'] as const, 'growth');
  if (s.encounter || s.decision || s.pending.length)
    throw new GameError(
      'Finish the current encounter, decision, and pending actions before advancing.',
    );
  if (c.hp <= 0)
    throw new GameError('Recover before advancing your character.');
  if (c.level >= MAX_LEVEL)
    throw new GameError('Your character has reached the level cap.');
  if (c.xp < nextLevelXp(c.level))
    throw new GameError('Earn more experience before advancing.');
  c.level += 1;
  if (selected === 'vitality') c.maxHp += 4;
  else c.maxEnergy += 1;
  addEvent(
    s,
    'system',
    c.name,
    `${c.name} reaches level ${c.level} and gains ${selected === 'vitality' ? '4 maximum health' : '1 maximum energy'}. Rest to fill the increased capacity.`,
    userId,
  );
}

export function rebuildCharacter(
  s: CampaignState,
  userId: string,
  input: Record<string, unknown>,
) {
  const c = s.characters.find((character) => character.userId === userId);
  if (!c) throw new GameError('Create your character first.');
  if (s.encounter || s.decision || s.pending.length)
    throw new GameError(
      'Finish the current encounter, decision, and pending actions before changing your build.',
    );
  if (c.hp <= 0) throw new GameError('Recover before changing your build.');
  const role = choice(input.role, ROLES, 'role');
  if (!input.stats)
    throw new GameError('Assign your attributes before saving.');
  const stats = startingStats(input.stats);
  if (
    role === c.role &&
    Object.keys(stats).every(
      (key) => stats[key as keyof Stats] === c.stats[key as keyof Stats],
    )
  )
    throw new GameError(
      'Choose a different role or attribute assignment first.',
    );
  // Keep earned vitality capacity; changing roles never fills health or energy.
  const maxHp = c.maxHp - roleHealth(c.role) + roleHealth(role);
  c.hp = Math.min(c.hp, maxHp);
  c.maxHp = maxHp;
  c.armor = roleArmor(role);
  c.role = role;
  c.stats = stats;
  addEvent(
    s,
    'system',
    c.name,
    `${c.name} changed their build to ${role}. Attributes: ${Object.entries(
      stats,
    )
      .map(([key, score]) => `${key} ${score}`)
      .join(', ')}. Health and energy were not restored.`,
    userId,
  );
}

function abilityEditAllowed(s: CampaignState) {
  if (s.encounter || s.decision || s.pending.length)
    throw new GameError(
      'Finish the current encounter, decision, and pending actions before changing abilities.',
    );
}
export function proposeAbility(
  s: CampaignState,
  userId: string,
  v: Record<string, unknown>,
) {
  abilityEditAllowed(s);
  if (s.settings.customization !== 'custom')
    throw new GameError(
      'The host must enable custom abilities in campaign settings.',
    );
  const c = s.characters.find((c) => c.userId === userId);
  if (!c) throw new GameError('Create your character first.');
  if ((c.abilities?.length || 0) >= 3)
    throw new GameError(
      'Keep up to three custom abilities, including proposals.',
    );
  const name = text(v.name, 'Ability name', 50),
    description = text(v.description, 'Ability description', 300);
  const effect = choice(
    v.effect,
    ['strike', 'mend'] as const,
    'ability effect',
  );
  if (c.abilities?.some((a) => a.name.toLowerCase() === name.toLowerCase()))
    throw new GameError('Choose a different ability name.');
  c.abilities = [
    ...(c.abilities || []),
    { id: uid(), name, description, effect, approved: false },
  ];
  addEvent(
    s,
    'system',
    c.name,
    `${c.name} proposes ${name}. Waiting for the host to review its fixed effect.`,
    userId,
  );
}
export function reviewAbility(
  s: CampaignState,
  characterId: string,
  abilityId: string,
  approve: boolean,
) {
  abilityEditAllowed(s);
  const c = s.characters.find((c) => c.id === characterId),
    a = c?.abilities?.find((a) => a.id === abilityId);
  if (!c || !a) throw new GameError('Ability not found.');
  if (approve) {
    if (s.settings.customization !== 'custom')
      throw new GameError(
        'Enable custom abilities before approving a proposal.',
      );
    if (a.approved) throw new GameError('This ability is already approved.');
    a.approved = true;
  } else c.abilities = c.abilities!.filter((a) => a.id !== abilityId);
  addEvent(
    s,
    'system',
    'Host',
    `${approve ? 'Approved' : 'Removed'} ${c.name}’s ability: ${a.name}.`,
  );
}
export function removeAbility(
  s: CampaignState,
  userId: string,
  abilityId: string,
) {
  abilityEditAllowed(s);
  const c = s.characters.find((c) => c.userId === userId),
    a = c?.abilities?.find((a) => a.id === abilityId);
  if (!c || !a) throw new GameError('Ability not found.');
  c.abilities = c.abilities!.filter((a) => a.id !== abilityId);
  addEvent(s, 'system', c.name, `${c.name} removes ${a.name}.`, userId);
}

export function hostDefend(s: CampaignState) {
  if (s.settings.pace !== 'host' || s.settings.absence !== 'defend')
    throw new GameError(
      'Enable host-managed pacing and defensive absence actions first.',
    );
  const e = s.encounter;
  if (!e) throw new GameError('There is no active encounter.');
  const c = s.characters.find((c) => c.id === e.order[e.index]);
  if (!c?.hostDefenseConsent)
    throw new GameError(
      'This player has not allowed the host to resolve defensive turns.',
    );
  combat(s, c.userId, 'defend');
  addEvent(
    s,
    'system',
    'Host',
    `The host resolves ${c.name}’s turn as defense, using that player’s permission.`,
  );
}
