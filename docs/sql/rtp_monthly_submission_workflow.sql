-- Run once on PostgreSQL (same as webtrak/src/main/resources/db/rtp-monthly-submission-workflow.sql)

ALTER TABLE monthly_submissions
    ADD COLUMN IF NOT EXISTS reopened_for_resubmission BOOLEAN DEFAULT FALSE;

ALTER TABLE monthly_submissions
    ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE;

ALTER TABLE monthly_submissions
    ADD COLUMN IF NOT EXISTS final_score DOUBLE PRECISION;

ALTER TABLE monthly_submissions
    ADD COLUMN IF NOT EXISTS tech_showcase TEXT;

UPDATE monthly_submissions SET reopened_for_resubmission = FALSE WHERE reopened_for_resubmission IS NULL;
UPDATE monthly_submissions SET locked = FALSE WHERE locked IS NULL;

ALTER TABLE monthly_submissions
    ALTER COLUMN reopened_for_resubmission SET DEFAULT FALSE;

ALTER TABLE monthly_submissions
    ALTER COLUMN locked SET DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS employee_project_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    month VARCHAR(7) NOT NULL,
    project_ids_json TEXT NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT employee_project_preferences_user_month_key UNIQUE (user_id, month)
);
