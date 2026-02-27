CREATE TABLE hardware_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_type TEXT NOT NULL CHECK(key_type IN ('yubikey-piv', 'fido2')),
  public_key TEXT NOT NULL,
  wrapped_master_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_hardware_keys_user ON hardware_keys(user_id);
