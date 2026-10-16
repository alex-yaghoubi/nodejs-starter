import {index, pgTable, text, timestamp, uuid, varchar} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', {length: 320}).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', {length: 20, enum: ['user', 'admin']}).notNull().default('user'),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
});

export const refreshSessions = pgTable('refresh_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, {onDelete: 'cascade'}),
  familyId: uuid('family_id').notNull(),
  tokenHash: varchar('token_hash', {length: 64}).notNull().unique(),
  expiresAt: timestamp('expires_at', {withTimezone: true}).notNull(),
  revokedAt: timestamp('revoked_at', {withTimezone: true}),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
}, (t) => [
  index('refresh_sessions_user_id_idx').on(t.userId),
  index('refresh_sessions_family_id_idx').on(t.familyId),
]);

export type Role = 'user' | 'admin';

/** Real example resource: each task belongs to one account. */
export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, {onDelete: 'cascade'}),
  title: varchar('title', {length: 160}).notNull(),
  description: text('description'),
  status: varchar('status', {length: 20, enum: ['todo', 'in_progress', 'done']}).notNull().default('todo'),
  priority: varchar('priority', {length: 20, enum: ['low', 'normal', 'high']}).notNull().default('normal'),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
}, (t) => [index('tasks_owner_created_idx').on(t.ownerId, t.createdAt)]);
