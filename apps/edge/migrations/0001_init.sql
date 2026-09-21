-- SiteKit edge（D1 / SQLite）初始結構：與 apps/api 的 Prisma 模型對應的最小核心
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  is_secret INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  ok INTEGER NOT NULL,
  error TEXT,
  params TEXT,
  result TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX audit_created_idx ON audit_logs(created_at);

CREATE TABLE contents (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at INTEGER,
  UNIQUE(source, external_id)
);

CREATE TABLE email_logs (
  id TEXT PRIMARY KEY,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_id TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);

INSERT INTO settings (key, value, is_secret, updated_at) VALUES
  ('brand.name', 'AIGC創客', 0, 0),
  ('storage.driver', 'r2', 0, 0),
  ('payment.provider', 'none', 0, 0);

INSERT INTO contents (id, source, external_id, title, slug, excerpt, body, status, published_at) VALUES
  ('seed-welcome', 'seed', 'welcome', '歡迎使用 SiteKit（edge）', 'welcome', '這是 Cloudflare D1 種子資料。', '<p>這篇文章來自 D1。</p>', 'published', 0);
