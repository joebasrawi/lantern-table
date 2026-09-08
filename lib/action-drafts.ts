'use client';
import { useCallback, useSyncExternalStore } from 'react';
type Draft = {
  text: string;
  roll: boolean;
  skill: string;
  saved: boolean;
  stored?: string;
};
const empty: Draft = { text: '', roll: false, skill: 'wisdom', saved: false };
const cache = new Map<string, Draft>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
function subscribe(listener: () => void) {
  listeners.add(listener);
  const changed = (event: StorageEvent) => {
    if (event.key?.startsWith('lantern:action-draft:')) cache.delete(event.key);
    else if (event.key === null) cache.clear();
    notify();
  };
  window.addEventListener('storage', changed);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', changed);
  };
}
function read(key: string): Draft {
  const existing = cache.get(key);
  if (existing) return existing;
  let value = empty;
  try {
    const raw = localStorage.getItem(key),
      d = raw ? JSON.parse(raw) : null;
    if (
      d?.v === 1 &&
      typeof d.text === 'string' &&
      d.text.length <= 1500 &&
      typeof d.roll === 'boolean' &&
      [
        'strength',
        'dexterity',
        'constitution',
        'intelligence',
        'wisdom',
        'charisma',
      ].includes(d.skill) &&
      typeof d.savedAt === 'number' &&
      Date.now() - d.savedAt <= 30 * 86400000
    )
      value = {
        text: d.text,
        roll: d.roll,
        skill: d.skill,
        saved: Boolean(d.text),
        stored: raw!,
      };
  } catch {
    /* Private browsing or full storage must not disable the composer. */
  }
  cache.set(key, value);
  return value;
}
function write(key: string, text: string, roll: boolean, skill: string) {
  let saved = false;
  const stored = JSON.stringify({
    v: 1,
    text,
    roll,
    skill,
    savedAt: Date.now(),
    revision: crypto.randomUUID(),
  });
  try {
    if (text) localStorage.setItem(key, stored);
    else localStorage.removeItem(key);
    saved = Boolean(text);
  } catch {
    /* Keep the unsaved draft in memory and report its status. */
  }
  cache.set(key, {
    text,
    roll,
    skill,
    saved,
    stored: saved ? stored : undefined,
  });
  notify();
}
function clearSubmitted(key: string, submitted: Draft) {
  // A newer local edit must survive completion of the older request.
  if (cache.get(key) !== submitted) return;
  if (submitted.saved) {
    try {
      // Read storage directly: another tab's storage event may still be queued.
      if (localStorage.getItem(key) !== submitted.stored) {
        cache.delete(key);
        notify();
        return;
      }
    } catch {
      // Do not claim a saved draft was removed when storage cannot be read.
      return;
    }
  }
  write(key, '', submitted.roll, submitted.skill);
}
export const actionDraftStore = { read, write, clearSubmitted };
export function useActionDraft(key: string) {
  const snapshot = useCallback(() => read(key), [key]);
  const draft = useSyncExternalStore(subscribe, snapshot, () => empty);
  const save = (text: string, roll = draft.roll, skill = draft.skill) =>
    write(key, text, roll, skill);
  const clear = () => clearSubmitted(key, draft);
  return [draft, save, clear] as const;
}
