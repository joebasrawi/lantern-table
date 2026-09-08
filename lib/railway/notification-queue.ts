import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { notificationCue } from '../game/notification-cue';
import type { CampaignState } from '../game/types';

/** Railway-only outbox. Foreign keys must be enabled, as in storage.ts. */
export function notificationTables(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      subscription TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      session_hash TEXT REFERENCES sessions(token_hash) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions(user_id);
    CREATE TABLE IF NOT EXISTS push_notifications (
      subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
      campaign_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      cue TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','inflight','sent','failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt INTEGER NOT NULL,
      claim TEXT,
      PRIMARY KEY(subscription_id, campaign_id),
      FOREIGN KEY(campaign_id,user_id) REFERENCES members(campaign_id,user_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS push_notifications_due ON push_notifications(status,next_attempt);
  `);
  if (
    !db
      .prepare('PRAGMA table_info(push_subscriptions)')
      .all()
      .some((column) => column.name === 'session_hash')
  )
    db.exec(
      'ALTER TABLE push_subscriptions ADD COLUMN session_hash TEXT REFERENCES sessions(token_hash) ON DELETE CASCADE',
    );
}
function revokeExpired(db: DatabaseSync, now: number) {
  db.prepare(`DELETE FROM push_subscriptions WHERE session_hash IS NULL OR NOT EXISTS (
    SELECT 1 FROM sessions s WHERE s.token_hash=push_subscriptions.session_hash
      AND s.user_id=push_subscriptions.user_id AND s.expires>?)`).run(now);
}
type Source = {
  subscription_id: string;
  campaign_id: string;
  user_id: string;
  host_id: string;
  state: string;
};
function cueFor(row: Source) {
  try {
    return notificationCue(
      JSON.parse(row.state) as CampaignState,
      row.user_id,
      row.host_id === row.user_id,
    );
  } catch {
    // A damaged campaign must neither notify nor block other campaigns.
    return null;
  }
}

/** Reconcile committed game state; reads, chat and unrelated saves keep the same cue. */
export function refreshNotifications(db: DatabaseSync, now = Date.now()) {
  notificationTables(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    revokeExpired(db, now);
    const rows = db
      .prepare(`SELECT p.id AS subscription_id, p.user_id,
      c.id AS campaign_id,c.host_id,c.state FROM push_subscriptions p
      JOIN members m ON m.user_id=p.user_id
      JOIN campaigns c ON c.id=m.campaign_id`)
      .all() as Source[];
    for (const row of rows) {
      const cue = cueFor(row);
      if (!cue) {
        db.prepare(
          'DELETE FROM push_notifications WHERE subscription_id=? AND campaign_id=?',
        ).run(row.subscription_id, row.campaign_id);
        continue;
      }
      db.prepare(`INSERT INTO push_notifications
        (subscription_id,campaign_id,user_id,cue,label,status,next_attempt)
        VALUES(?,?,?,?,?,'pending',?)
        ON CONFLICT(subscription_id,campaign_id) DO UPDATE SET
          user_id=excluded.user_id,cue=excluded.cue,label=excluded.label,
          status='pending',attempts=0,next_attempt=excluded.next_attempt,claim=NULL
        WHERE push_notifications.cue != excluded.cue`).run(
        row.subscription_id,
        row.campaign_id,
        row.user_id,
        cue.key,
        cue.label,
        now,
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
export type NotificationClaim = {
  subscriptionId: string;
  campaignId: string;
  claim: string;
  subscription: string;
  label: string;
};

/** Claim one due item, rechecking membership and the actual current turn before delivery. */
export function claimNotification(
  db: DatabaseSync,
  now = Date.now(),
): NotificationClaim | null {
  notificationTables(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    revokeExpired(db, now);
    // A crashed sender gets a bounded retry after its lease. Sending is at-least-once;
    // the eventual service worker must use a stable notification tag to replace retries.
    db.prepare(`UPDATE push_notifications SET status='failed',claim=NULL
      WHERE status='inflight' AND next_attempt<=? AND attempts>=5`).run(now);
    const rows = db
      .prepare(`SELECT n.*,p.subscription,c.host_id,c.state
      FROM push_notifications n
      JOIN push_subscriptions p ON p.id=n.subscription_id AND p.user_id=n.user_id
      JOIN members m ON m.campaign_id=n.campaign_id AND m.user_id=n.user_id
      JOIN campaigns c ON c.id=n.campaign_id
      WHERE n.status IN ('pending','inflight') AND n.next_attempt<=? AND n.attempts<5
      ORDER BY n.next_attempt,n.subscription_id,n.campaign_id LIMIT 50`)
      .all(now) as (Source & {
      cue: string;
      subscription: string;
      label: string;
    })[];
    let result: NotificationClaim | null = null;
    for (const row of rows) {
      const current = cueFor(row);
      if (!current || current.key !== row.cue) {
        db.prepare(
          'DELETE FROM push_notifications WHERE subscription_id=? AND campaign_id=?',
        ).run(row.subscription_id, row.campaign_id);
        continue;
      }
      const claim = randomUUID();
      db.prepare(`UPDATE push_notifications SET status='inflight',attempts=attempts+1,
        claim=?,next_attempt=? WHERE subscription_id=? AND campaign_id=?`).run(
        claim,
        now + 120_000,
        row.subscription_id,
        row.campaign_id,
      );
      result = {
        subscriptionId: row.subscription_id,
        campaignId: row.campaign_id,
        subscription: row.subscription,
        label: current.label,
        claim,
      };
      break;
    }
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** A late response cannot acknowledge or reschedule a newer turn or sender. */
export function settleNotification(
  db: DatabaseSync,
  item: NotificationClaim,
  outcome: 'sent' | 'retry' | 'failed',
  now = Date.now(),
) {
  return db
    .prepare(`UPDATE push_notifications SET
    status=CASE WHEN ?='retry' AND attempts<5 THEN 'pending'
      WHEN ?='sent' THEN 'sent' ELSE 'failed' END,
    next_attempt=? + MIN(3600000,60000 * (1 << attempts)),claim=NULL
    WHERE subscription_id=? AND campaign_id=? AND claim=? AND status='inflight'`)
    .run(
      outcome,
      outcome,
      now,
      item.subscriptionId,
      item.campaignId,
      item.claim,
    ).changes;
}
