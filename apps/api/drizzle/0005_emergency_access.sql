CREATE TABLE IF NOT EXISTS emergency_access_grants (
  id TEXT PRIMARY KEY,
  grantor_user_id TEXT NOT NULL REFERENCES users(id),
  grantee_email TEXT NOT NULL,
  grantee_user_id TEXT,
  wait_period_days INTEGER NOT NULL DEFAULT 7,
  status TEXT NOT NULL DEFAULT 'pending',
  encrypted_user_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS emergency_access_requests (
  id TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES emergency_access_grants(id),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  rejected_at TEXT,
  expires_at TEXT NOT NULL
);
