import { ABILITY_EFFECTS, type CampaignView } from '../lib/game/types';

export function RulesGuide({ campaign }: { campaign: CampaignView }) {
  const { settings: rules, pendingSettings } = campaign.state;
  const tactical = rules.rules === 'tactical';
  return (
    <div className="rules-guide">
      <p>
        This campaign uses{' '}
        <strong>{tactical ? 'Tactical' : 'Quickplay'}</strong>. Read the latest
        story, describe what your character tries to do, then send your action.
        You can close the site and return later; submitted actions and campaign
        progress are saved.
      </p>
      <p>
        {rules.dm === 'ai'
          ? 'The AI dungeon master responds to your exploration actions. Travel, rest and new encounters can require a party decision.'
          : rules.dm === 'assisted'
            ? 'Your action waits for the human dungeon master. They can use AI to draft a response, but they review and publish it themselves.'
            : 'Your action waits for the human dungeon master to respond from DM Desk.'}{' '}
        Use Party chat to talk out of character. The Journal keeps shared
        discoveries and quests; Character holds your build, equipment and notes.
      </p>
      {pendingSettings && (
        <p className="muted">
          Some settings are queued. This guide describes the rules in force now;
          it updates when the current encounter, decision and pending actions
          are finished.
        </p>
      )}
      <details>
        <summary>Taking turns and returning later</summary>
        <p>
          Combat follows the displayed turn order. Each action uses your turn;
          after all conscious characters act, enemies act. Knocked-out
          characters are skipped. Look for “Your combat turn” on the adventure
          list when you return.
        </p>
        <p>
          {rules.pace === 'deadline'
            ? `Each combat turn has a ${rules.deadlineHours}-hour deadline. ${rules.absence === 'defend' ? 'A missed turn can use Defend only if that player has enabled timed-turn consent in Character.' : 'The turn waits for the player even after the deadline.'}`
            : rules.pace === 'host'
              ? `The host manages the pace. ${rules.absence === 'defend' ? 'They can use Defend for an absent player only with that player’s separate host-managed consent in Character.' : 'Absent players keep their turn until they return.'}`
              : 'There is no turn deadline. The campaign waits for the active player.'}{' '}
          Leaving the website is enough for a break. “Leave campaign” in
          settings removes your membership and requires an invitation to return.
        </p>
        <p>
          New-event counts remain until you choose Mark read. Your unsent
          exploration draft is saved in this browser; it does not follow you to
          another device.
        </p>
      </details>
      <details>
        <summary>Checks and combat actions</summary>
        <p>
          {tactical
            ? 'Checks roll a twenty-sided die, add the chosen attribute modifier (the attribute minus 10, halved and rounded down), then add 2. Attacks use Intelligence for Arcanists, Dexterity for Wayfinders, and Strength for Vanguards and Envoys.'
            : 'Checks and attacks roll a twenty-sided die and add 2. Your attribute scores do not change this bonus in Quickplay.'}{' '}
          An attack hits when its total meets the target’s armor. A natural 20
          hits and doubles damage; a natural 1 misses.
        </p>
        <ul>
          <li>
            <strong>Attack:</strong> 5 damage on a hit.
          </li>
          <li>
            <strong>Power:</strong> 8 damage on a hit; spends 1 energy even on a
            miss.
          </li>
          <li>
            <strong>Defend:</strong> +3 armor through the next enemy phase.
          </li>
          <li>
            <strong>Heal:</strong> consume one Healing kit to recover up to 8
            health.
          </li>
          <li>
            <strong>Move:</strong> choose an unoccupied tile within 3 spaces.
            Each horizontal or vertical step counts as one space.
          </li>
        </ul>
        <p>
          {tactical
            ? 'Attack and Power reach 6 spaces for Wayfinders and Arcanists, or 1 space for Vanguards and Envoys. Diagonals count as two steps. Move closer when a target is out of range.'
            : 'Attack and Power have no distance limit in Quickplay. You can still use the map to move and follow the scene.'}{' '}
          Every action above uses a full turn. Healing cannot exceed your
          maximum health. At zero health, you cannot act until recovered.
        </p>
      </details>
      <details>
        <summary>Party decisions and recovery</summary>
        <p>
          {rules.decision === 'unanimous'
            ? 'A choice passes only when every character’s player votes for that same choice.'
            : rules.decision === 'majority'
              ? 'A choice needs votes from more than half of the character players. A tie does not pass.'
              : 'The host chooses the result. A host does not need a character to decide.'}{' '}
          You can change your vote while the decision is open. The host can
          cancel a stuck decision.
        </p>
        <p>
          Rest restores health and energy. In AI-led games, the party approves
          proposed rests; in human-led games, the DM chooses when rest is safe.
          If the whole party falls, the encounter is lost and gives no
          experience.
          {rules.dm === 'ai'
            ? ' A recovery vote lets the party choose whether to continue.'
            : ' The human DM decides the consequences and recovery.'}
        </p>
      </details>
      <details>
        <summary>Abilities, equipment and growth</summary>
        <p>
          {rules.customization === 'custom'
            ? 'In Character → Abilities, propose up to three named abilities. The host must approve each fixed effect before you can use it.'
            : 'New custom abilities are disabled in this campaign. Abilities already approved by the host remain usable.'}{' '}
          Names and descriptions can fit any era; they do not change the listed
          effect. Each ability uses your combat turn.
        </p>
        <ul>
          {Object.entries(ABILITY_EFFECTS).map(([effect, description]) => (
            <li key={effect}>
              <strong>{effect[0].toUpperCase() + effect.slice(1)}:</strong>{' '}
              {description}
            </li>
          ))}
        </ul>
        <p>
          The host can grant or remove equipment. Between resolved actions, you
          can give your own items to a conscious teammate. Custom item names
          describe equipment; they do not add automatic bonuses.
        </p>
        <p>
          Winning an encounter gives every character 25 experience. When
          eligible, open Character to gain a level and choose +4 maximum health
          or +1 maximum energy. Leveling does not refill either resource. Levels
          stop at 10.
        </p>
      </details>
      <p className="muted">
        Lantern Table uses original rules. This is not a full D&amp;D/5e
        ruleset.
      </p>
    </div>
  );
}
