-- Széfek: új tárcatípus (pl. Revolut Vaults – külön zsebek a bankon belül).
-- A borítékhoz hasonlóan célösszeggel, félretett pénzként működik.
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_kind_check;
ALTER TABLE wallets ADD CONSTRAINT wallets_kind_check
  CHECK (kind IN ('account', 'cash', 'reserve', 'envelope', 'vault'));
