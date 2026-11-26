-- Face ID / Touch ID / Windows Hello belépés (WebAuthn passkey-k)
CREATE TABLE webauthn_credentials (
  id           TEXT PRIMARY KEY,            -- credential ID (base64url)
  public_key   BYTEA NOT NULL,
  counter      BIGINT NOT NULL DEFAULT 0,
  transports   TEXT[] NOT NULL DEFAULT '{}',
  device_name  TEXT NOT NULL DEFAULT 'Eszköz',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
