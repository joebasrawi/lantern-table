import type { DatabaseSync } from 'node:sqlite';
import { readdir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { CampaignState } from '../game/types';

export class DeletionError extends Error {}
export function deletionTables(db: DatabaseSync) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS deleted_accounts(id TEXT PRIMARY KEY,deleted_campaigns TEXT NOT NULL,image_keys TEXT NOT NULL,cleanup_pending INTEGER NOT NULL DEFAULT 1)',
  );
  db.exec(`CREATE TRIGGER IF NOT EXISTS deleted_account_members BEFORE INSERT ON members WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'Account deleted'); END;
    CREATE TRIGGER IF NOT EXISTS deleted_account_campaigns BEFORE INSERT ON campaigns WHEN EXISTS(SELECT 1 FROM deleted_accounts WHERE id=NEW.host_id) BEGIN SELECT RAISE(ABORT,'Account deleted'); END;`);
}
export function deletionMemberships(db: DatabaseSync, userId: string) {
  return db
    .prepare(
      `SELECT c.id,c.host_id,(SELECT COUNT(*) FROM members m2 WHERE m2.campaign_id=c.id) AS members FROM campaigns c JOIN members m ON m.campaign_id=c.id WHERE m.user_id=?`,
    )
    .all(userId) as { id: string; host_id: string; members: number }[];
}
export function deletionFingerprint(memberships: { id: string }[]) {
  return createHash('sha256')
    .update(JSON.stringify(memberships.map((m) => m.id).sort()))
    .digest('hex');
}
export function deleteAccount(
  db: DatabaseSync,
  userId: string,
  passwordHash: string,
  tokenHash: string,
  expectedCampaigns: string,
  timestamp = Date.now(),
) {
  deletionTables(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    const account = db
      .prepare(
        'SELECT a.email,a.password_hash FROM accounts a JOIN sessions s ON s.user_id=a.id WHERE a.id=? AND s.token_hash=? AND s.expires>?',
      )
      .get(userId, tokenHash, timestamp);
    if (!account || account.password_hash !== passwordHash)
      throw new DeletionError('Your session changed. Sign in and try again.');
    const memberships = deletionMemberships(db, userId);
    if (deletionFingerprint(memberships) !== expectedCampaigns)
      throw new DeletionError(
        'Campaign membership changed. Review account deletion again.',
      );
    if (
      memberships.some((m) => m.host_id !== userId || Number(m.members) !== 1)
    )
      throw new DeletionError(
        'Leave shared campaigns or hand off hosting before deleting your account.',
      );
    const soleCampaigns = new Set(memberships.map((m) => m.id));
    const imageKeys: string[] = [];
    const campaigns = db
      .prepare('SELECT id,host_id,state,lock,lock_until FROM campaigns')
      .all();
    for (const row of campaigns) {
      const state = JSON.parse(String(row.state)) as CampaignState;
      const id = String(row.id);
      if (row.host_id === userId && !soleCampaigns.has(id))
        throw new DeletionError(
          'Hand off every shared campaign before deleting your account.',
        );
      const archived =
        state.retiredCharacters?.filter((c) => c.userId === userId) || [];
      const affected =
        state.characters.some((c) => c.userId === userId) ||
        soleCampaigns.has(id) ||
        archived.length ||
        Object.hasOwn(state.seen, userId);
      if (!affected) continue;
      if (row.lock && Number(row.lock_until) >= timestamp)
        throw new DeletionError(
          'A campaign update is still running. Try again after it finishes.',
        );
      if (soleCampaigns.has(id)) {
        db.prepare('DELETE FROM campaigns WHERE id=?').run(id);
        continue;
      }
      if (state.characters.some((c) => c.userId === userId))
        throw new DeletionError(
          'A saved character is still active. Leave its campaign first.',
        );
      for (const c of archived)
        if (c.portraitAsset)
          imageKeys.push(`portraits/${id}/${c.portraitAsset}`);
      if (archived.length)
        state.retiredCharacters = state.retiredCharacters!.filter(
          (c) => c.userId !== userId,
        );
      delete state.seen[userId];
      db.prepare(
        'UPDATE campaigns SET state=?,version=version+1,updated_at=? WHERE id=?',
      ).run(JSON.stringify(state), new Date(timestamp).toISOString(), id);
    }
    const has = (name: string) =>
      !!db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(name);
    if (has('password_resets'))
      db.prepare('DELETE FROM password_resets WHERE user_id=?').run(userId);
    if (has('registrations'))
      db.prepare('DELETE FROM registrations WHERE email=?').run(
        String(account.email),
      );
    if (has('portrait_generation_locks'))
      db.prepare('DELETE FROM portrait_generation_locks WHERE user_id=?').run(
        userId,
      );
    if (has('recovery_attempts')) {
      const emailHash = createHash('sha256')
        .update(String(account.email))
        .digest('hex');
      db.prepare('DELETE FROM recovery_attempts WHERE key IN (?,?)').run(
        'send:' + emailHash,
        'signup:' + emailHash,
      );
    }
    db.prepare('DELETE FROM login_attempts WHERE email=?').run(
      String(account.email),
    );
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
    db.prepare('DELETE FROM accounts WHERE id=?').run(userId);
    db.prepare(
      'INSERT INTO deleted_accounts(id,deleted_campaigns,image_keys) VALUES(?,?,?)',
    ).run(
      userId,
      JSON.stringify([...soleCampaigns]),
      JSON.stringify(imageKeys),
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

let cleaning = false;
/** Retry failed file cleanup without restoring deleted accounts or their private data. */
export async function cleanupDeletedImages(db: DatabaseSync) {
  if (cleaning) return;
  cleaning = true;
  try {
    deletionTables(db);
    const deleted = db
      .prepare('SELECT * FROM deleted_accounts WHERE cleanup_pending>0')
      .all();
    if (!deleted.length) return;
    const keep = new Set<string>();
    for (const row of db.prepare('SELECT id,state FROM campaigns').all()) {
      const state = JSON.parse(String(row.state)) as CampaignState;
      if (state.sceneAsset)
        keep.add(`scenes/${String(row.id)}/${state.sceneAsset}`);
      for (const c of [...state.characters, ...(state.retiredCharacters || [])])
        if (c.portraitAsset)
          keep.add(`portraits/${String(row.id)}/${c.portraitAsset}`);
    }
    const users = new Set(deleted.map((row) => String(row.id)));
    const campaigns = new Set(
      deleted.flatMap(
        (row) => JSON.parse(String(row.deleted_campaigns)) as string[],
      ),
    );
    const keys = new Set(
      deleted.flatMap((row) => JSON.parse(String(row.image_keys)) as string[]),
    );
    const root = process.env.LANTERN_DATA_DIR;
    if (!root) throw new Error('Image storage is unavailable');
    const folder = join(root, 'images');
    let files: string[];
    try {
      files = await readdir(folder);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      files = [];
    }
    for (const file of files) {
      const match =
        /^(portraits|scenes)_([a-zA-Z0-9-]+)_([a-zA-Z0-9-]+)\.json$/.exec(file);
      if (!match) continue;
      const key = `${match[1]}/${match[2]}/${match[3]}`;
      if (keep.has(key)) continue;
      const path = join(folder, file);
      try {
        const metadata = JSON.parse(
          await readFile(path, 'utf8'),
        ).customMetadata;
        if (
          campaigns.has(match[2]) ||
          keys.has(key) ||
          users.has(metadata?.userId)
        )
          await unlink(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    for (const row of deleted)
      db.prepare(
        'UPDATE deleted_accounts SET cleanup_pending=0,image_keys=? WHERE id=? AND cleanup_pending=?',
      ).run('[]', String(row.id), Number(row.cleanup_pending));
  } finally {
    cleaning = false;
  }
}
