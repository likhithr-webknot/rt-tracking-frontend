-- submission_cycles.id is UUID; ensure inserts get a value when the app omits id.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE submission_cycles
    ALTER COLUMN id SET DEFAULT gen_random_uuid();

DROP SEQUENCE IF EXISTS submission_cycles_id_seq;
