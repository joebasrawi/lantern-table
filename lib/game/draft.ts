import { narrationContext } from './context';
import type { CampaignState } from './types';
export function draftIsCurrent(
  before: CampaignState,
  after: CampaignState,
  pendingId: string,
) {
  const original = before.pending.find((p) => p.id === pendingId),
    current = after.pending.find((p) => p.id === pendingId);
  if (
    before.settings.dm !== 'assisted' ||
    after.settings.dm !== 'assisted' ||
    !original ||
    !current
  )
    return false;
  if (
    original.text !== current.text ||
    original.roll !== current.roll ||
    original.author !== current.author
  )
    return false;
  const action = `${original.author}: ${original.text}`;
  return (
    JSON.stringify(narrationContext(before, action)) ===
    JSON.stringify(narrationContext(after, action))
  );
}
