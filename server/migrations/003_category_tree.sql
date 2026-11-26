-- Kategóriafa: korlátlan mélységű alkategóriák.
-- A side-hustle projektek és a #címkék megszűnnek, minden kategória lesz.
-- A Költős költési keret is megszűnik (az Irattartó célszint marad).

ALTER TABLE categories ADD COLUMN parent_id INT REFERENCES categories(id) ON DELETE RESTRICT;
ALTER TABLE categories ADD CONSTRAINT category_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id);
CREATE INDEX categories_parent_idx ON categories (parent_id);

-- 1. Projektek → a „Side-hustle” bevételi kategória alkategóriái
DO $$
DECLARE
  root_id INT;
  p RECORD;
  new_id INT;
BEGIN
  IF EXISTS (SELECT 1 FROM projects) THEN
    SELECT id INTO root_id FROM categories
     WHERE kind = 'income' AND NOT is_system AND lower(name) = 'side-hustle'
     ORDER BY id LIMIT 1;
    IF root_id IS NULL THEN
      INSERT INTO categories (name, kind, icon, color, sort_order)
      VALUES ('Side-hustle', 'income', '💼', '#22c55e',
              COALESCE((SELECT MAX(sort_order) + 1 FROM categories WHERE kind = 'income' AND NOT is_system), 1))
      RETURNING id INTO root_id;
    END IF;

    FOR p IN SELECT * FROM projects ORDER BY sort_order, id LOOP
      INSERT INTO categories (name, kind, icon, color, archived, sort_order, parent_id)
      VALUES (p.name, 'income', '💼', p.color, p.archived, p.sort_order, root_id)
      RETURNING id INTO new_id;
      UPDATE transactions SET category_id = new_id WHERE project_id = p.id;
    END LOOP;
  END IF;
END $$;

-- 2. Címkék → a megjegyzés végére írva, hogy az információ ne vesszen el
UPDATE transactions t
SET note = btrim(t.note || CASE WHEN btrim(t.note) = '' THEN '' ELSE E'\n' END || x.tags)
FROM (
  SELECT tt.transaction_id, string_agg('#' || g.name, ' ' ORDER BY g.name) AS tags
  FROM transaction_tags tt JOIN tags g ON g.id = tt.tag_id
  GROUP BY tt.transaction_id
) x
WHERE x.transaction_id = t.id;

DROP TABLE transaction_tags;
DROP TABLE tags;
ALTER TABLE transactions DROP COLUMN project_id;
DROP TABLE projects;

-- 3. Költési keret beállításai
ALTER TABLE settings
  DROP COLUMN spending_enabled,
  DROP COLUMN spending_period,
  DROP COLUMN spending_amount,
  DROP COLUMN spending_wallet_id;
