-- Az előre feltöltött (seed) kategóriák törlése: a felhasználó nulláról építi fel a saját kategóriafáját.
--  - Törlődik a 002-es seed 11 kategóriája és a régi projektekből lett 3 alkategória
--    (Side-hustle #1, Korrepetálás, Alkalmi munka a Side-hustle alatt).
--  - A hozzájuk rendelt tételek és sablonok „Kategória nélkül” maradnak (ON DELETE SET NULL).
--  - Ha a felhasználó már tett saját alkategóriát valamelyik alá, az főkategória lesz, nem vész el.
--  - A rejtett „Egyenleg korrekció” rendszer-kategóriák maradnak (a készpénz-leltár használja őket).

CREATE TEMP TABLE seeded_categories ON COMMIT DROP AS
SELECT c.id FROM categories c
WHERE NOT c.is_system AND (
  (c.kind, c.name) IN (
    ('expense', 'Kaja'), ('expense', 'Nasi'), ('expense', 'Drogéria'), ('expense', 'Egyetem'),
    ('expense', 'Utazás'), ('expense', 'Szórakozás'), ('expense', 'Egyéb kiadás'),
    ('income', 'Side-hustle'), ('income', 'Család / Ajándék'), ('income', 'Ösztöndíj'), ('income', 'Egyéb bevétel')
  )
  OR (c.kind = 'income' AND c.name IN ('Side-hustle #1', 'Korrepetálás', 'Alkalmi munka')
      AND c.parent_id IN (SELECT id FROM categories WHERE kind = 'income' AND name = 'Side-hustle'))
);

UPDATE categories SET parent_id = NULL
WHERE parent_id IN (SELECT id FROM seeded_categories)
  AND id NOT IN (SELECT id FROM seeded_categories);

UPDATE transactions SET category_id = NULL WHERE category_id IN (SELECT id FROM seeded_categories);
UPDATE templates SET category_id = NULL WHERE category_id IN (SELECT id FROM seeded_categories);
DELETE FROM categories WHERE id IN (SELECT id FROM seeded_categories);
DROP TABLE seeded_categories;
