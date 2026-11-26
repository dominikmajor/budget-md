-- Alapértelmezett adatok: 5 pénzügyi tároló, kategóriák, projektek, sablonok, beállítások

INSERT INTO wallets (name, kind, icon, color, keywords, featured, sort_order, target_amount) VALUES
  ('OTP Számla', 'account',  '🏦', '#22c55e', ARRAY['otp','bank','szamla'],              FALSE, 1, NULL),
  ('Revolut',    'account',  '💳', '#3b82f6', ARRAY['revo','revolut','rev'],             FALSE, 2, NULL),
  ('Költős',     'cash',     '👛', '#f59e0b', ARRAY['koltos','kp','keszpenz','penztarca'], FALSE, 3, NULL),
  ('Irattartó',  'reserve',  '🗂️', '#a855f7', ARRAY['irattarto','iratt','tartalek'],     FALSE, 4, NULL),
  ('Nyaralás',   'envelope', '🏖️', '#06b6d4', ARRAY['nyaralas'],                          TRUE,  5, 300000);

INSERT INTO categories (name, kind, icon, color, keywords, sort_order) VALUES
  ('Kaja',          'expense', '🍝', '#f97316', ARRAY['kaja','ebed','vacsora','lidl','aldi','spar','tesco','penny','bolt'], 1),
  ('Nasi',          'expense', '🍦', '#ec4899', ARRAY['nasi','fagyi','kave','csoki','suti','pekseg'], 2),
  ('Drogéria',      'expense', '🧴', '#8b5cf6', ARRAY['dm','rossmann','muller','drogeria'], 3),
  ('Egyetem',       'expense', '🎓', '#3b82f6', ARRAY['egyetem','jegyzet','tankonyv','tandij','nyomtatas'], 4),
  ('Utazás',        'expense', '🚌', '#14b8a6', ARRAY['bkk','berlet','mav','volan','uber','taxi','jegy'], 5),
  ('Szórakozás',    'expense', '🎉', '#eab308', ARRAY['mozi','buli','koncert','sor','netflix','spotify'], 6),
  ('Egyéb kiadás',  'expense', '📦', '#64748b', ARRAY['egyeb'], 7),
  ('Side-hustle',   'income',  '💼', '#22c55e', ARRAY['munka','meló','melo','fizetes','projekt'], 1),
  ('Család / Ajándék', 'income', '🎁', '#f43f5e', ARRAY['mama','papa','nagyi','anya','apa','csalad','ajandek'], 2),
  ('Ösztöndíj',     'income',  '🎓', '#0ea5e9', ARRAY['osztondij','tanulmanyi'], 3),
  ('Egyéb bevétel', 'income',  '✨', '#84cc16', ARRAY[]::TEXT[], 4);

INSERT INTO categories (name, kind, icon, color, is_system, sort_order) VALUES
  ('Egyenleg korrekció', 'expense', '⚖️', '#94a3b8', TRUE, 99),
  ('Egyenleg korrekció', 'income',  '⚖️', '#94a3b8', TRUE, 99);

INSERT INTO projects (name, color, sort_order) VALUES
  ('Side-hustle #1', '#22c55e', 1),
  ('Korrepetálás',   '#3b82f6', 2),
  ('Alkalmi munka',  '#f59e0b', 3);

INSERT INTO templates (name, emoji, type, amount, wallet_id, category_id, sort_order) VALUES
  ('Kávé',       '☕', 'expense', 850,  (SELECT id FROM wallets WHERE name = 'Költős'),     (SELECT id FROM categories WHERE name = 'Nasi'), 1),
  ('Fagyi',      '🍦', 'expense', 1500, (SELECT id FROM wallets WHERE name = 'Költős'),     (SELECT id FROM categories WHERE name = 'Nasi'), 2),
  ('BKK bérlet', '🚌', 'expense', 3450, (SELECT id FROM wallets WHERE name = 'OTP Számla'), (SELECT id FROM categories WHERE name = 'Utazás'), 3);

INSERT INTO settings (id, spending_wallet_id) VALUES (1, (SELECT id FROM wallets WHERE name = 'Költős'));
