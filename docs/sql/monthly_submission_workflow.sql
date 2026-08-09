-- Example migration for MySQL/PostgreSQL-style schema.
-- Adjust column types to your DB engine.

ALTER TABLE monthly_submissions
  ADD COLUMN IF NOT EXISTS submission_type VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS subject_employee_id VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS cycle_key VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS cycle_start_month CHAR(7) NULL,
  ADD COLUMN IF NOT EXISTS cycle_end_month CHAR(7) NULL,
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS manager_review_json JSON NULL,
  ADD COLUMN IF NOT EXISTS manager_evaluation_json JSON NULL,
  ADD COLUMN IF NOT EXISTS manager_submitted_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS admin_review_json JSON NULL,
  ADD COLUMN IF NOT EXISTS admin_evaluation_json JSON NULL,
  ADD COLUMN IF NOT EXISTS admin_submitted_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS reopened_for_resubmission BOOLEAN NOT NULL DEFAULT FALSE;

-- Keep one employee monthly row per month.
CREATE UNIQUE INDEX IF NOT EXISTS ux_monthly_submission_employee_month_type
ON monthly_submissions(employee_id, month_key, submission_type);

-- Suggested index for manager/admin queue screens.
CREATE INDEX IF NOT EXISTS ix_monthly_submission_review_queue
ON monthly_submissions(month_key, status, review_status, submission_type);
