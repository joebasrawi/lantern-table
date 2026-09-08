import type { CampaignState } from './types';

export type CampaignAttention = {
  label: string;
  needsAction: boolean;
};

/** Summarize only what this member can act on; never include private notes. */
export function campaignAttention(
  state: CampaignState,
  userId: string,
  isHost: boolean,
): CampaignAttention {
  const character = state.characters.find((c) => c.userId === userId);
  const result = (label: string, needsAction = false) => ({
    label,
    needsAction,
  });
  if (state.encounter) {
    const actor = state.encounter.order[state.encounter.index];
    return character?.id === actor && character.hp > 0
      ? result('Your combat turn', true)
      : result('Waiting for a combat turn');
  }
  if (state.decision) {
    if (state.settings.decision === 'host')
      return isHost
        ? result('Choose for the party', true)
        : result('Waiting for the host’s decision');
    if (!character) return result('Party vote in progress');
    return Object.hasOwn(state.decision.votes, userId)
      ? result('Vote saved · waiting for the party')
      : result('Your vote is needed', true);
  }
  if (isHost && state.settings.dm !== 'ai' && state.pending.length)
    return result('Resolve player actions', true);
  if (
    isHost &&
    state.characters.some((c) => c.abilities?.some((a) => !a.approved))
  )
    return result('Review proposed abilities', true);
  if (state.hostOffer?.to === userId)
    return result('Host handoff awaiting your reply', true);
  if (!character)
    return isHost && state.settings.dm !== 'ai'
      ? result('Ready to guide the adventure')
      : state.pending.length
        ? result('Waiting for pending actions')
        : result('Create your character', true);
  if (state.pending.some((p) => p.userId === userId))
    return result('Waiting for the dungeon master');
  if (character.hp <= 0) return result('Waiting for recovery');
  return result('Ready to explore');
}
