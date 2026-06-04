-- Sync bands & departments to match Webknot HR CSV catalogs.
-- Run against the Webtrak database after backup.
-- Bands table: band (entity) with name + designation + band_type
-- Departments table: department with name + active

-- 1) Deactivate legacy departments not in the new catalog
UPDATE department
SET active = false
WHERE lower(trim(name)) NOT IN (
  lower('Admin'),
  lower('Account Manager'),
  lower('Business Analyst'),
  lower('Developer'),
  lower('DevOps'),
  lower('Delivery Manager'),
  lower('Executive'),
  lower('Finance'),
  lower('Human Resources'),
  lower('Project Manager'),
  lower('Quality Assurance'),
  lower('UI/UX'),
  lower('AI/ML')
);

-- 2) Upsert departments (PostgreSQL). Adjust table/column names if your schema differs.
INSERT INTO department (name, active, created_at, updated_at)
VALUES
  ('Admin', true, NOW(), NOW()),
  ('Account Manager', true, NOW(), NOW()),
  ('Business Analyst', true, NOW(), NOW()),
  ('Developer', true, NOW(), NOW()),
  ('DevOps', true, NOW(), NOW()),
  ('Delivery Manager', true, NOW(), NOW()),
  ('Executive', true, NOW(), NOW()),
  ('Finance', true, NOW(), NOW()),
  ('Human Resources', true, NOW(), NOW()),
  ('Project Manager', true, NOW(), NOW()),
  ('Quality Assurance', true, NOW(), NOW()),
  ('UI/UX', true, NOW(), NOW()),
  ('AI/ML', true, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET active = true, updated_at = NOW();

-- 3) Bands: remove rows whose name is not in the canonical list (only when unused).
-- Safer approach: use Admin UI "Sync standard catalog" which deactivates/deletes via API.
-- Reference band codes to keep:
-- B1, B2, B3, B4, B4L, B4H, B5, B5H, B5L, B6, B6H, B6L, B7H, B7L, B8

INSERT INTO band (name, designation, band_type, kpis)
SELECT v.code, v.code, 'BOTH', NULL::jsonb
FROM (VALUES
  ('B1'), ('B2'), ('B3'), ('B4'), ('B4L'), ('B4H'), ('B5'), ('B5H'), ('B5L'),
  ('B6'), ('B6H'), ('B6L'), ('B7H'), ('B7L'), ('B8')
) AS v(code)
WHERE NOT EXISTS (SELECT 1 FROM band b WHERE lower(b.name) = lower(v.code));
