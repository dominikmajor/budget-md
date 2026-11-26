-- Az Irattartó célszint és a hozzá tartozó figyelmeztetés megszűnik: az app tisztán nyilvántartó.
ALTER TABLE settings DROP COLUMN IF EXISTS reserve_target;
