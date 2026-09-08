import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from 'drizzle-orm/sqlite-core';
export const campaigns = sqliteTable('campaigns', {
  id: text('id').primaryKey(),
  hostId: text('host_id').notNull(),
  invite: text('invite').notNull().unique(),
  state: text('state').notNull(),
  version: integer('version').notNull().default(0),
  lock: text('lock'),
  lockUntil: integer('lock_until').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});
export const members = sqliteTable(
  'members',
  {
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.campaignId, t.userId] }),
    index('idx_members_user').on(t.userId),
  ],
);
