import { database } from '../../db';
import { portraits } from '../portraits';
import { inspectPortrait } from './portrait';
import {
  addEvent,
  hostDefend,
  proposeAbility,
  reviewAbility,
  removeAbility,
  levelUp,
  rebuildCharacter,
  changeInventory,
  hostHandoff,
  departCampaign,
  restoreDepartedCharacter,
  check,
  combat,
  deadline,
  expireTurn,
  GameError,
  initialState,
  makeCharacter,
  now,
  sanitize,
  settings,
  startEncounter,
  text,
  uid,
  voteResult,
  resolveDecision,
  updateSettings,
  updateWorld,
  applyQueuedSettings,
  choice,
} from './engine';
import { campaignAttention } from './attention';
import { narrate } from './narrator';
import { draftIsCurrent } from './draft';
import { applyNarration } from './dm-output';
import type { CampaignState, CampaignView, Stats, User } from './types';
type Row = {
  id: string;
  host_id: string;
  invite: string;
  state: string;
  version: number;
  lock: string | null;
  lock_until: number;
};
export async function list(user: User) {
  const rows = await database()
    .prepare(
      'SELECT c.id,c.state,c.host_id,c.updated_at FROM campaigns c JOIN members m ON m.campaign_id=c.id WHERE m.user_id=? ORDER BY c.updated_at DESC',
    )
    .bind(user.id)
    .all<{ id: string; state: string; host_id: string; updated_at: string }>();
  return rows.results.map((r) => {
    const s = JSON.parse(r.state) as CampaignState;
    return {
      id: r.id,
      title: s.title,
      location: s.location,
      setting: s.setting,
      dm: s.settings.dm,
      players: s.characters.length,
      attention: campaignAttention(s, user.id, r.host_id === user.id),
      updatedAt: r.updated_at,
      unread: s.events.filter(
        (e) => e.kind !== 'chat' && e.at > (s.seen[user.id] || ''),
      ).length,
    };
  });
}
async function rowFor(id: string, user: User) {
  const r = await database()
    .prepare(
      'SELECT c.* FROM campaigns c JOIN members m ON m.campaign_id=c.id WHERE c.id=? AND m.user_id=?',
    )
    .bind(id, user.id)
    .first<Row>();
  if (!r)
    throw new GameError('Campaign not found or you are not a member.', 404);
  return r;
}
export async function view(id: string, user: User): Promise<CampaignView> {
  const row = await rowFor(id, user);
  const members = await database()
    .prepare('SELECT user_id AS userId,name FROM members WHERE campaign_id=?')
    .bind(id)
    .all<{ userId: string; name: string }>();
  return {
    id: row.id,
    hostId: row.host_id,
    version: row.version,
    ...(row.host_id === user.id ? { invite: row.invite } : {}),
    state: portraitLinks(
      sanitize(JSON.parse(row.state), user.id, row.host_id === user.id),
      id,
    ),
    members: members.results,
  };
}
export async function create(user: User, v: Record<string, unknown>) {
  const id = uid();
  const state = initialState(
    text(v.title, 'Campaign name', 80),
    text(v.setting, 'Setting', 1500),
    text(v.premise, 'Premise', 1500),
    text(v.location, 'Opening location', 80),
    settings(v.settings),
  );
  await database().batch([
    database()
      .prepare(
        'INSERT INTO campaigns(id,host_id,invite,state,updated_at) VALUES(?,?,?,?,?)',
      )
      .bind(id, user.id, uid(), JSON.stringify(state), now()),
    database()
      .prepare('INSERT INTO members(campaign_id,user_id,name) VALUES(?,?,?)')
      .bind(id, user.id, user.name),
  ]);
  return view(id, user);
}
export async function join(user: User, invite: unknown) {
  const row = await database()
    .prepare('SELECT * FROM campaigns WHERE invite=?')
    .bind(text(invite, 'Invite code', 100))
    .first<Row>();
  if (!row)
    throw new GameError(
      'That invitation is invalid or has been replaced.',
      404,
    );
  const member = await database()
    .prepare('SELECT user_id FROM members WHERE campaign_id=? AND user_id=?')
    .bind(row.id, user.id)
    .first();
  if (!member) await changeMembership(user, row, true);
  return view(row.id, user);
}

export async function leave(user: User, v: Record<string, unknown>) {
  const id = text(v.id, 'Campaign', 100);
  if (v.confirm !== true)
    throw new GameError('Confirm that you want to leave this campaign.');
  const row = await database()
    .prepare(
      'SELECT c.* FROM campaigns c JOIN members m ON m.campaign_id=c.id WHERE c.id=? AND m.user_id=?',
    )
    .bind(id, user.id)
    .first<Row>();
  // Repeating a completed departure is harmless and reveals no campaign data.
  if (!row) return { left: true, id };
  if (v.version !== row.version)
    throw new GameError('The campaign changed. Review it before leaving.', 409);
  await changeMembership(user, row, false);
  return { left: true, id };
}

async function changeMembership(user: User, row: Row, joining: boolean) {
  const db = database(),
    lock = uid();
  const acquired = await db
    .prepare(
      'UPDATE campaigns SET lock=?,lock_until=? WHERE id=? AND version=? AND (lock IS NULL OR lock_until<?)',
    )
    .bind(lock, Date.now() + 90000, row.id, row.version, Date.now())
    .run();
  if (acquired.meta.changes !== 1)
    throw new GameError(
      'The campaign is changing. Try again in a moment.',
      409,
    );
  try {
    const s = JSON.parse(row.state) as CampaignState;
    if (joining) {
      const count = await db
        .prepare('SELECT COUNT(*) AS count FROM members WHERE campaign_id=?')
        .bind(row.id)
        .first<{ count: number }>();
      if ((count?.count || 0) >= 8)
        throw new GameError('This campaign already has 8 members.');
      restoreDepartedCharacter(s, user.id);
    } else departCampaign(s, user.id, user.name, row.host_id === user.id);
    const serialized = JSON.stringify(s);
    if (serialized.length > 800000 || s.events.length > 10000)
      throw new GameError(
        'This campaign has reached its storage limit. Export it before continuing.',
      );
    const guard =
      'EXISTS (SELECT 1 FROM campaigns WHERE id=? AND version=? AND lock=?)';
    const membership = joining
      ? db
          .prepare(
            `INSERT INTO members(campaign_id,user_id,name) SELECT ?,?,? WHERE ${guard}`,
          )
          .bind(row.id, user.id, user.name, row.id, row.version, lock)
      : db
          .prepare(
            `DELETE FROM members WHERE campaign_id=? AND user_id=? AND ${guard}`,
          )
          .bind(row.id, user.id, row.id, row.version, lock);
    // Every statement is guarded by the same lease and version; the batch is
    // transactional on D1 and Railway SQLite, including rollback on errors.
    const results = await db.batch([
      membership,
      db
        .prepare(
          'UPDATE campaigns SET state=?,version=version+1,updated_at=?,lock=NULL,lock_until=0 WHERE id=? AND version=? AND lock=?',
        )
        .bind(serialized, now(), row.id, row.version, lock),
    ]);
    if (results[1].meta.changes !== 1)
      throw new GameError(
        'Membership was not changed because another turn won. Please try again.',
        409,
      );
  } finally {
    await db
      .prepare(
        'UPDATE campaigns SET lock=NULL,lock_until=0 WHERE id=? AND lock=?',
      )
      .bind(row.id, lock)
      .run();
  }
}
export async function mutate(user: User, v: Record<string, unknown>) {
  const id = text(v.id, 'Campaign', 100);
  const requestId = text(v.requestId, 'Request ID', 100);
  const row = await rowFor(id, user);
  const s = JSON.parse(row.state) as CampaignState;
  if (s.receipts[requestId]) return view(id, user);
  const op = text(v.op, 'Action', 30);
  const passive = ['seen', 'chat', 'notes', 'tick', 'vote'];
  if (!passive.includes(op) && v.version !== row.version)
    throw new GameError(
      'The campaign changed. Review the latest events and try again.',
      409,
    );
  const lock = uid();
  const acquired = await database()
    .prepare(
      'UPDATE campaigns SET lock=?,lock_until=? WHERE id=? AND version=? AND (lock IS NULL OR lock_until<?)',
    )
    .bind(lock, Date.now() + 90000, id, row.version, Date.now())
    .run();
  if (acquired.meta.changes !== 1)
    throw new GameError(
      'Another turn is resolving. Please try again in a moment.',
      409,
    );
  let nextHost = row.host_id;
  let nextInvite = row.invite;
  const host = row.host_id === user.id;
  const requireHost = () => {
    if (!host) throw new GameError('Only the campaign host can do that.', 403);
  };
  const character = () => {
    const c = s.characters.find((c) => c.userId === user.id);
    if (!c) throw new GameError('Create your character first.');
    return c;
  };
  try {
    switch (op) {
      case 'hostHandoff': {
        const members = await database()
          .prepare(
            'SELECT user_id AS userId,name FROM members WHERE campaign_id=?',
          )
          .bind(id)
          .all<{ userId: string; name: string }>();
        const accepted = hostHandoff(
          s,
          user.id,
          row.host_id,
          members.results,
          v,
        );
        if (accepted) {
          nextHost = accepted;
          nextInvite = uid();
        }
        break;
      }
      case 'character': {
        if (s.characters.some((c) => c.userId === user.id))
          throw new GameError('You already have a character.');
        if (s.encounter || s.decision)
          throw new GameError(
            'Join the party after the current encounter or decision.',
          );
        const c = makeCharacter(v, user.id, s);
        s.characters.push(c);
        addEvent(
          s,
          'system',
          c.name,
          `${c.name}, ${c.ancestry} ${c.role}, joins the adventure.`,
        );
        break;
      }
      case 'scene': {
        requireHost();
        const asset = text(v.asset, 'Scene', 100);
        const object = await portraits().head(`scenes/${id}/${asset}`);
        if (
          !object ||
          object.customMetadata?.userId !== user.id ||
          object.customMetadata?.campaignId !== id
        )
          throw new GameError('Scene not found.', 404);
        s.sceneAsset = asset;
        break;
      }
      case 'clearScene':
        requireHost();
        delete s.sceneAsset;
        break;
      case 'portrait': {
        const c = character();
        const asset = text(v.asset, 'Portrait', 100);
        const object = await portraits().head(`portraits/${id}/${asset}`);
        if (
          !object ||
          object.customMetadata?.userId !== user.id ||
          object.customMetadata?.campaignId !== id
        )
          throw new GameError('Portrait not found.', 404);
        c.portraitAsset = asset;
        break;
      }
      case 'clearPortrait': {
        delete character().portraitAsset;
        break;
      }
      case 'inventory':
        changeInventory(s, user.id, host, v);
        break;
      case 'rebuild':
        rebuildCharacter(s, user.id, v);
        break;
      case 'levelUp': {
        levelUp(s, user.id, v.growth);
        break;
      }
      case 'proposeAbility':
        proposeAbility(s, user.id, v);
        break;
      case 'reviewAbility':
        requireHost();
        if (typeof v.approve !== 'boolean')
          throw new GameError('Choose approve or decline.');
        reviewAbility(
          s,
          text(v.characterId, 'Character', 100),
          text(v.abilityId, 'Ability', 100),
          v.approve === true,
        );
        break;
      case 'removeAbility':
        removeAbility(s, user.id, text(v.abilityId, 'Ability', 100));
        break;
      case 'profile': {
        const c = character();
        const updated = makeCharacter(
          { ...v, role: c.role, stats: c.stats },
          user.id,
          s,
        );
        c.name = updated.name;
        c.ancestry = updated.ancestry;
        c.concept = updated.concept;
        c.portrait = updated.portrait;
        break;
      }
      case 'notes': {
        const c = character();
        c.notes = text(v.notes, 'Private notes', 4000, true);
        c.dmNotes = text(v.dmNotes, 'Notes shared with DM', 4000, true);
        c.absenceConsent = v.absenceConsent === true;
        if (typeof v.hostDefenseConsent === 'boolean')
          c.hostDefenseConsent = v.hostDefenseConsent;
        break;
      }
      case 'seen':
        s.seen[user.id] = now();
        break;
      case 'chat': {
        addEvent(
          s,
          'chat',
          s.characters.find((c) => c.userId === user.id)?.name ||
            (host
              ? `${user.name} (${s.settings.dm === 'ai' ? 'Host' : 'DM'})`
              : character().name),
          text(v.text, 'Message', 2000),
          user.id,
        );
        break;
      }
      case 'action': {
        const c = character();
        if (s.encounter)
          throw new GameError('Use the encounter controls during combat.');
        if (c.hp <= 0)
          throw new GameError('The DM must help your character recover first.');
        if (s.pending.some((p) => p.userId === user.id))
          throw new GameError('Your previous action is waiting for the DM.');
        const action = text(v.text, 'Action', 1500);
        const skill = choice(
          v.skill || 'wisdom',
          [
            'strength',
            'dexterity',
            'constitution',
            'intelligence',
            'wisdom',
            'charisma',
          ] as (keyof Stats)[],
          'attribute',
        );
        const result =
          v.roll === true
            ? check(c, s, skill).description
            : 'No dice check requested. Resolve only low-stakes exploration; defer risky outcomes until a check is requested.';
        if (s.settings.dm === 'ai') {
          const lastMinute = s.events.filter(
            (e) =>
              e.kind === 'action' &&
              e.at > new Date(Date.now() - 60000).toISOString(),
          );
          const daily = s.events.filter(
            (e) =>
              e.kind === 'action' &&
              e.at > new Date(Date.now() - 86400000).toISOString(),
          );
          if (lastMinute.length >= 8 || daily.length >= 100)
            throw new GameError(
              'This campaign has reached its AI turn limit. Try later or switch to a human DM.',
              429,
            );
          const n = await narrate(s, `${c.name}: ${action}`, result);
          addEvent(s, 'action', c.name, action, user.id);
          if (v.roll) addEvent(s, 'roll', c.name, result, user.id);
          applyNarration(s, n);
        } else {
          s.pending.push({
            id: uid(),
            userId: user.id,
            author: c.name,
            text: action,
            roll: result,
            at: now(),
          });
          addEvent(s, 'action', c.name, action, user.id);
          if (v.roll) addEvent(s, 'roll', c.name, result, user.id);
        }
        break;
      }
      case 'combat':
        combat(
          s,
          user.id,
          text(v.action, 'Combat action', 20),
          text(v.target, 'Target', 100, true),
          Number(v.x),
          Number(v.y),
          undefined,
          text(v.abilityId, 'Ability', 100, true),
        );
        break;
      case 'hostDefend':
        requireHost();
        hostDefend(s);
        break;
      case 'tick':
        expireTurn(s);
        break;
      case 'world':
        requireHost();
        updateWorld(s, v);
        break;
      case 'settings': {
        requireHost();
        updateSettings(s, settings(v.settings));
        break;
      }
      case 'decision': {
        if (s.encounter || s.decision)
          throw new GameError(
            'Finish the current encounter or decision first.',
          );
        character();
        const question = text(v.question, 'Question', 300);
        const options = Array.isArray(v.options)
          ? v.options.map((x) => text(x, 'Option', 120))
          : [];
        if (
          options.length < 2 ||
          options.length > 4 ||
          new Set(options).size !== options.length
        )
          throw new GameError('Provide 2 to 4 different options.');
        s.decision = {
          id: uid(),
          question,
          options,
          votes: {},
          deadline: deadline(s),
        };
        addEvent(s, 'system', 'Party decision', question);
        break;
      }
      case 'vote': {
        if (!(host && s.settings.decision === 'host')) character();
        const d = s.decision;
        if (!d || v.decisionId !== d.id)
          throw new GameError('This decision has already changed.', 409);
        const n = Number(v.option);
        if (!Number.isInteger(n) || n < 0 || n >= d.options.length)
          throw new GameError('Choose a valid option.');
        d.votes[user.id] = n;
        const winner =
          s.settings.decision === 'host' ? (host ? n : null) : voteResult(s);
        if (winner !== null) resolveDecision(s, winner);
        break;
      }
      case 'dm': {
        requireHost();
        const kind = text(v.kind, 'DM action', 30);
        if (kind === 'cancelDecision') {
          if (!s.decision)
            throw new GameError('There is no pending party decision.');
          addEvent(
            s,
            'system',
            'Party decision',
            `The host cancelled: ${s.decision.question}`,
          );
          s.decision = null;
        } else if (kind === 'notes')
          s.dmNotes = text(v.text, 'DM notes', 8000, true);
        else if (kind === 'narrate') {
          if (v.pendingId && !s.pending.some((p) => p.id === v.pendingId))
            throw new GameError(
              'That player action has already been resolved. Review the latest story before replying.',
              409,
            );
          const narration = text(v.text, 'Narration', 6000);
          addEvent(s, 'narration', 'Dungeon Master', narration);
          if (v.pendingId)
            s.pending = s.pending.filter((p) => p.id !== v.pendingId);
        } else if (kind === 'encounter') {
          if (s.decision || s.pending.length)
            throw new GameError('Resolve pending actions and decisions first.');
          const count = Number(v.count);
          if (!Number.isInteger(count) || count < 1 || count > 6)
            throw new GameError('Choose 1 to 6 enemies.');
          startEncounter(
            s,
            text(v.name, 'Enemy name', 60),
            count,
            v.enemyStats,
          );
        } else if (kind === 'location') {
          if (s.encounter || s.decision || s.pending.length)
            throw new GameError('Finish pending play before moving the party.');
          s.location = text(v.text, 'Location', 80);
          if (!s.visited.includes(s.location)) s.visited.push(s.location);
          addEvent(
            s,
            'system',
            'Travel',
            `The party arrives at ${s.location}.`,
          );
        } else if (kind === 'journal') {
          s.journal.push({
            id: uid(),
            category: choice(
              v.category,
              ['Story', 'Quests', 'People', 'Discoveries'],
              'journal category',
            ),
            title: text(v.title, 'Title', 100),
            body: text(v.text, 'Entry', 4000),
            completed: false,
          });
        } else if (kind === 'completeQuest') {
          const entry = s.journal.find(
            (j) => j.id === v.entryId && j.category === 'Quests',
          );
          if (!entry) throw new GameError('Quest not found.');
          entry.completed = !entry.completed;
        } else if (kind === 'rest') {
          if (s.encounter || s.decision || s.pending.length)
            throw new GameError(
              'Rest after the encounter, party decision, and pending actions.',
            );
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
        } else throw new GameError('Unknown DM action.');
        break;
      }
      default:
        throw new GameError('Unknown action.');
    }
    applyQueuedSettings(s);
    if (s.journal.length > 300 || s.events.length > 10000)
      throw new GameError(
        'This campaign has reached the preview storage limit. Export it before continuing.',
      );
    s.receipts[requestId] = now();
    const receipts = Object.entries(s.receipts);
    if (receipts.length > 200)
      s.receipts = Object.fromEntries(receipts.slice(-200));
    const saved = await database()
      .prepare(
        'UPDATE campaigns SET state=?,host_id=?,invite=?,version=version+1,updated_at=?,lock=NULL,lock_until=0 WHERE id=? AND version=? AND lock=?',
      )
      .bind(
        JSON.stringify(s),
        nextHost,
        nextInvite,
        now(),
        id,
        row.version,
        lock,
      )
      .run();
    if (saved.meta.changes !== 1)
      throw new GameError(
        'Your turn was not saved because the campaign changed. Please refresh.',
        409,
      );
    return await view(id, user);
  } finally {
    await database()
      .prepare(
        'UPDATE campaigns SET lock=NULL,lock_until=0 WHERE id=? AND lock=?',
      )
      .bind(id, lock)
      .run();
  }
}
export async function draft(user: User, v: Record<string, unknown>) {
  const row = await rowFor(text(v.id, 'Campaign', 100), user);
  if (row.host_id !== user.id)
    throw new GameError('Only the DM can draft narration.', 403);
  const s = JSON.parse(row.state) as CampaignState;
  if (s.settings.dm !== 'assisted')
    throw new GameError(
      'Enable AI-assisted DM mode before requesting a draft.',
    );
  const p = s.pending.find((p) => p.id === v.pendingId);
  if (!p) throw new GameError('Select a pending action.');
  const action = `${p.author}: ${p.text}`;
  const result = await narrate(s, action, p.roll);
  const latestRow = await rowFor(row.id, user);
  if (latestRow.host_id !== user.id)
    throw new GameError('Only the current host can receive a DM draft.', 403);
  const latest = JSON.parse(latestRow.state) as CampaignState;
  if (!draftIsCurrent(s, latest, p.id))
    throw new GameError(
      'The story changed while the draft was being written. Review it and request a fresh draft.',
      409,
    );
  return { ...result, pendingId: p.id };
}

function portraitLinks(s: CampaignState, id: string): CampaignState {
  s.sceneUrl = s.sceneAsset
    ? `/api/scene?campaign=${encodeURIComponent(id)}&asset=${encodeURIComponent(s.sceneAsset)}`
    : undefined;
  s.characters = s.characters.map((c) => ({
    ...c,
    portraitUrl: c.portraitAsset
      ? `/api/portrait?campaign=${encodeURIComponent(id)}&asset=${encodeURIComponent(c.portraitAsset)}`
      : undefined,
  }));
  return s;
}
export async function uploadPortrait(
  user: User,
  id: string,
  data: ArrayBuffer,
  type: string,
) {
  const row = await rowFor(id, user);
  const s = JSON.parse(row.state) as CampaignState;
  if (!s.characters.some((c) => c.userId === user.id))
    throw new GameError('Create your character before uploading a portrait.');
  const image = inspectPortrait(data, type);
  const asset = uid();
  const key = `portraits/${id}/${asset}`;
  await portraits().put(key, data, {
    httpMetadata: { contentType: image.type },
    customMetadata: { userId: user.id, campaignId: id },
  });
  try {
    return await mutate(user, {
      op: 'portrait',
      id,
      version: row.version,
      requestId: uid(),
      asset,
    });
  } catch (error) {
    await cleanupUnusedImage(user, id, key, asset, false);
    throw error;
  }
}
export async function readPortrait(user: User, id: string, asset: string) {
  const row = await rowFor(id, user);
  const s = JSON.parse(row.state) as CampaignState;
  if (!s.characters.some((c) => c.portraitAsset === asset))
    throw new GameError('Portrait not found.', 404);
  const object = await portraits().get(`portraits/${id}/${asset}`);
  if (!object) throw new GameError('Portrait not found.', 404);
  return object;
}

export async function uploadScene(
  user: User,
  id: string,
  data: ArrayBuffer,
  type: string,
) {
  const row = await rowFor(id, user);
  if (row.host_id !== user.id)
    throw new GameError('Only the host can change scene artwork.', 403);
  const image = inspectPortrait(data, type),
    asset = uid(),
    key = `scenes/${id}/${asset}`;
  await portraits().put(key, data, {
    httpMetadata: { contentType: image.type },
    customMetadata: { userId: user.id, campaignId: id },
  });
  try {
    return await mutate(user, {
      op: 'scene',
      id,
      version: row.version,
      requestId: uid(),
      asset,
    });
  } catch (error) {
    await cleanupUnusedImage(user, id, key, asset, true);
    throw error;
  }
}
export async function readScene(user: User, id: string, asset: string) {
  const row = await rowFor(id, user),
    s = JSON.parse(row.state) as CampaignState;
  if (s.sceneAsset !== asset) throw new GameError('Scene not found.', 404);
  const object = await portraits().get(`scenes/${id}/${asset}`);
  if (!object) throw new GameError('Scene not found.', 404);
  return object;
}
async function cleanupUnusedImage(
  user: User,
  id: string,
  key: string,
  asset: string,
  scene: boolean,
) {
  // A response can fail after the state commits. Never remove a referenced image.
  try {
    const current = JSON.parse((await rowFor(id, user)).state) as CampaignState;
    const referenced = scene
      ? current.sceneAsset === asset
      : current.characters.some((c) => c.portraitAsset === asset);
    if (!referenced) await portraits().delete(key);
  } catch {
    /* Preserve the object when current state cannot be verified. */
  }
}
