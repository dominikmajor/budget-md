-- Alapséma: tárcák, kategóriák, projektek, címkék, tranzakciók, sablonok, beállítások

CREATE TABLE wallets (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  -- account = bankszámla/digitális tárca, cash = készpénz zseb,
  -- reserve = tartalék (Irattartó), envelope = boríték
  kind            TEXT NOT NULL CHECK (kind IN ('account', 'cash', 'reserve', 'envelope')),
  icon            TEXT NOT NULL DEFAULT '💳',
  color           TEXT NOT NULL DEFAULT '#7c5cff',
  initial_balance BIGINT NOT NULL DEFAULT 0,
  target_amount   BIGINT,
  target_date     DATE,
  keywords        TEXT[] NOT NULL DEFAULT '{}',
  featured        BOOLEAN NOT NULL DEFAULT FALSE,
  archived        BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
  icon       TEXT NOT NULL DEFAULT '🏷️',
  color      TEXT NOT NULL DEFAULT '#8b8fa3',
  keywords   TEXT[] NOT NULL DEFAULT '{}',
  is_system  BOOLEAN NOT NULL DEFAULT FALSE,
  archived   BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE projects (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#22c55e',
  archived   BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE tags (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE transactions (
  id            SERIAL PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  status        TEXT NOT NULL DEFAULT 'final' CHECK (status IN ('draft', 'final')),
  amount        BIGINT NOT NULL CHECK (amount > 0),
  wallet_id     INT REFERENCES wallets(id) ON DELETE RESTRICT,
  to_wallet_id  INT REFERENCES wallets(id) ON DELETE RESTRICT,
  category_id   INT REFERENCES categories(id) ON DELETE SET NULL,
  project_id    INT REFERENCES projects(id) ON DELETE SET NULL,
  name          TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  is_correction BOOLEAN NOT NULL DEFAULT FALSE,
  receipt_mime  TEXT,
  receipt_data  BYTEA,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT final_needs_wallet CHECK (status = 'draft' OR wallet_id IS NOT NULL),
  CONSTRAINT final_transfer_needs_target CHECK (status = 'draft' OR type <> 'transfer' OR to_wallet_id IS NOT NULL),
  CONSTRAINT transfer_distinct CHECK (to_wallet_id IS NULL OR to_wallet_id <> wallet_id)
);
CREATE INDEX transactions_occurred_idx ON transactions (occurred_at DESC);
CREATE INDEX transactions_wallet_idx ON transactions (wallet_id);
CREATE INDEX transactions_to_wallet_idx ON transactions (to_wallet_id);
CREATE INDEX transactions_status_idx ON transactions (status);

CREATE TABLE transaction_tags (
  transaction_id INT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id         INT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

CREATE TABLE templates (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '⚡',
  type        TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount      BIGINT NOT NULL CHECK (amount > 0),
  wallet_id   INT REFERENCES wallets(id) ON DELETE SET NULL,
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  sort_order  INT NOT NULL DEFAULT 0
);

-- Egysoros beállítás-tábla (egyfelhasználós app)
CREATE TABLE settings (
  id                 INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pin_hash           TEXT,
  pin_length         INT NOT NULL DEFAULT 4 CHECK (pin_length IN (4, 6)),
  failed_attempts    INT NOT NULL DEFAULT 0,
  locked_until       TIMESTAMPTZ,
  autolock_minutes   INT NOT NULL DEFAULT 2,
  reserve_target     BIGINT NOT NULL DEFAULT 30000,
  spending_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  spending_period    TEXT NOT NULL DEFAULT 'week' CHECK (spending_period IN ('day', 'week')),
  spending_amount    BIGINT NOT NULL DEFAULT 15000,
  spending_wallet_id INT REFERENCES wallets(id) ON DELETE SET NULL
);

-- Egyenlegek: kezdőegyenleg + mozgások.
-- A piszkozat is számít, ha már van tárcája ("lefoglalja az összeget");
-- tárca nélküli piszkozat nem hat az egyenlegre.
CREATE VIEW wallet_balances AS
SELECT
  w.id AS wallet_id,
  w.initial_balance + COALESCE(SUM(
    CASE
      WHEN t.type = 'income'  AND t.wallet_id = w.id THEN t.amount
      WHEN t.type = 'expense' AND t.wallet_id = w.id THEN -t.amount
      WHEN t.type = 'transfer' AND t.to_wallet_id IS NOT NULL AND t.wallet_id = w.id THEN -t.amount
      WHEN t.type = 'transfer' AND t.wallet_id IS NOT NULL AND t.to_wallet_id = w.id THEN t.amount
      ELSE 0
    END
  ), 0)::BIGINT AS balance
FROM wallets w
LEFT JOIN transactions t ON t.wallet_id = w.id OR t.to_wallet_id = w.id
GROUP BY w.id;
