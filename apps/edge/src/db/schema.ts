import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  displayName: text('display_name'),
  role: text('role').notNull().default('user'),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  isSecret: integer('is_secret').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  ok: integer('ok').notNull(),
  error: text('error'),
  params: text('params'),
  result: text('result'),
  createdAt: integer('created_at').notNull(),
});

export const contents = sqliteTable('contents', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  externalId: text('external_id').notNull(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  excerpt: text('excerpt'),
  body: text('body'),
  status: text('status').notNull().default('draft'),
  publishedAt: integer('published_at'),
});

export const emailLogs = sqliteTable('email_logs', {
  id: text('id').primaryKey(),
  to: text('to_addr').notNull(),
  subject: text('subject').notNull(),
  provider: text('provider').notNull(),
  status: text('status').notNull(),
  providerId: text('provider_id'),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
});
