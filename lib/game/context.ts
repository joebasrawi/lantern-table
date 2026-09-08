import type { CampaignState, Event, Journal } from './types';
const STOP = new Set(
  'the and for that this with from have has was were are our your you about what when where which would could should there their they them then into does did how who can will now ask tell look take want please just again'.split(
    ' ',
  ),
);
const terms = (value: string) =>
  new Set(
    (value.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter(
      (t) => !STOP.has(t),
    ),
  );
function excerpt(text: string, query: Set<string>, limit: number) {
  if (text.length <= limit) return text;
  const lower = text.toLocaleLowerCase();
  const hits = [...query].map((t) => lower.indexOf(t)).filter((i) => i >= 0);
  const start = hits.length ? Math.max(0, Math.min(...hits) - 180) : 0;
  return `${start ? '…' : ''}${text.slice(start, start + Math.max(0, limit - 2))}…`;
}
/** Keyword recall over saved story records, never over private notes or chat. */
export function recallHistory(
  events: Event[],
  action: string,
  location: string,
) {
  const story = events.filter((e) => e.kind !== 'chat');
  const earlier = story.slice(0, Math.max(0, story.length - 32));
  const query = terms(action),
    place = terms(location);
  const docs = earlier.map((e) => ({
    e,
    tokens: terms(`${e.author} ${e.text}`),
  }));
  const frequency = new Map<string, number>();
  for (const { tokens } of docs)
    for (const t of query)
      if (tokens.has(t)) frequency.set(t, (frequency.get(t) || 0) + 1);
  const ranked = docs
    .map(({ e, tokens }, index) => ({
      e,
      index,
      score:
        [...query].reduce(
          (n, t) =>
            n +
            (tokens.has(t)
              ? Math.log(1 + (docs.length + 1) / ((frequency.get(t) || 0) + 1))
              : 0),
          0,
        ) +
        (query.size && [...query].some((t) => tokens.has(t))
          ? [...place].filter((t) => tokens.has(t)).length * 0.1
          : 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, 6)
    .sort((a, b) => a.index - b.index);
  return ranked.map(({ e }) => ({
    id: e.id,
    at: e.at,
    kind: e.kind,
    author: e.author,
    text: excerpt(e.text, query, 900),
  }));
}
function recentHistory(events: Event[]) {
  let remaining = 14000;
  return events
    .filter((e) => e.kind !== 'chat')
    .slice(-32)
    .reverse()
    .flatMap((e) => {
      if (remaining <= 0) return [];
      const text = e.text.slice(0, Math.min(1000, remaining));
      remaining -= text.length;
      return [{ id: e.id, at: e.at, kind: e.kind, author: e.author, text }];
    })
    .reverse();
}
function relevantJournal(journal: Journal[], action: string) {
  const query = terms(action);
  let remaining = 7000;
  return journal
    .map((entry, index) => ({
      entry,
      index,
      score:
        [...terms(`${entry.title} ${entry.body}`)].filter((t) => query.has(t))
          .length *
          4 +
        (entry.category === 'Quests' && !entry.completed ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, 12)
    .flatMap(({ entry }) => {
      if (remaining <= 0) return [];
      const body = excerpt(entry.body, query, Math.min(900, remaining));
      remaining -= body.length;
      return [
        {
          id: entry.id,
          category: entry.category,
          title: entry.title,
          body,
          completed: entry.completed,
        },
      ];
    });
}
export function narrationContext(s: CampaignState, action: string) {
  return {
    setting: s.setting,
    premise: s.premise,
    tone: s.settings.tone,
    boundaries: s.settings.boundaries,
    location: s.location,
    pendingDecision: s.decision?.question || null,
    party: s.characters.map((c) => ({
      name: c.name,
      ancestry: c.ancestry,
      role: c.role,
      concept: c.concept.slice(0, 500),
      hp: c.hp,
      abilities: (c.abilities || [])
        .filter((a) => a.approved)
        .map((a) => ({ name: a.name, effect: a.effect })),
    })),
    journal: relevantJournal(s.journal, action),
    earlierHistory: recallHistory(s.events, action, s.location),
    recent: recentHistory(s.events),
  };
}
