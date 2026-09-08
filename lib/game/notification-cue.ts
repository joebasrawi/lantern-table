import { campaignAttention } from './attention';
import type { CampaignState } from './types';

/** A stable reason to notify, containing no player-authored text. */
export function notificationCue(
  state: CampaignState,
  userId: string,
  isHost: boolean,
): { key: string; label: string } | null {
  const attention = campaignAttention(state, userId, isHost);
  if (!attention.needsAction) return null;
  let identity: unknown[];
  if (state.encounter) {
    const e = state.encounter;
    // Enemy IDs distinguish encounters; round/index distinguish successive turns.
    // Dead enemies stay in the encounter, so damage does not change this identity.
    identity = ['combat', e.enemies.map((enemy) => enemy.id), e.round, e.index];
  } else if (state.decision) {
    identity = [
      'decision',
      state.decision.id,
      state.settings.decision === 'host',
    ];
  } else if (isHost && state.settings.dm !== 'ai' && state.pending.length) {
    // Additional actions in the same unresolved batch should not keep buzzing.
    identity = ['pending', state.pending[0].id];
  } else {
    const proposal = isHost
      ? state.characters
          .flatMap((c) => c.abilities ?? [])
          .find((a) => !a.approved)
      : undefined;
    if (proposal) identity = ['ability', proposal.id];
    else if (state.hostOffer?.to === userId)
      identity = ['handoff', state.hostOffer.from, state.hostOffer.to];
    else return null; // Character creation is onboarding, not a turn alert.
  }
  return { key: JSON.stringify(identity), label: attention.label };
}
