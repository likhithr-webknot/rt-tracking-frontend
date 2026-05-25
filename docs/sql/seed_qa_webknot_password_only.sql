-- =============================================================================
-- QA accounts — DATABASE ONLY (no API / Node). Run in psql, DBeaver, etc.
--
-- PLAINTEXT PASSWORD (all three logins):  WebknotQA#Test1
--
-- BCrypt hash below = Spring Security BCryptPasswordEncoder (strength 10).
-- If your column expects $2a$ instead of $2b$, replace the prefix:  $2b$  ->  $2a$
--
-- EMAILS:
--   qa.employee.one@webknot.in   — treat as Employee in your app / employee row
--   qa.employee.two@webknot.in   — treat as Employee
--   qa.manager.one@webknot.in    — treat as Manager
-- =============================================================================
--
-- BEFORE YOU RUN: inspect your auth table (names differ per app):
--   PostgreSQL:  \d+ users     or     \d+ user
--   MySQL:       SHOW CREATE TABLE users;
--
-- Adjust:  table name (users / user / app_user),  email column (email / username),
--          password column (password / password_hash),  and any NOT NULL columns.
-- =============================================================================

-- --- PostgreSQL: upsert password for existing rows, or insert minimal rows --------
-- Uncomment and edit table/column names to match YOUR schema.

-- BEGIN;

-- INSERT INTO users (email, password, enabled)
-- VALUES
--   ('qa.employee.one@webknot.in', '$2b$10$hZeOTPNv1i5DUPerNREkz.MHHCruRWFfHZktJVzLc.XbMyfYKThfq', TRUE),
--   ('qa.employee.two@webknot.in', '$2b$10$hZeOTPNv1i5DUPerNREkz.MHHCruRWFfHZktJVzLc.XbMyfYKThfq', TRUE),
--   ('qa.manager.one@webknot.in',   '$2b$10$hZeOTPNv1i5DUPerNREkz.MHHCruRWFfHZktJVzLc.XbMyfYKThfq', TRUE)
-- ON CONFLICT (email) DO UPDATE
--   SET password = EXCLUDED.password;

-- If you use `username` instead of `email`:
-- INSERT INTO users (username, password, enabled)
-- VALUES
--   ('qa.employee.one@webknot.in', '$2b$10$hZeOTPNv1i5DUPerNREkz.MHHCruRWFfHZktJVzLc.XbMyfYKThfq', TRUE),
--   ...

-- COMMIT;

-- Prefer API seed when Webtrak runs with dev profile:
--   POST http://localhost:8080/api/v1/dev/seed-qa-users
-- List who can use password login:
--   GET  http://localhost:8080/api/v1/dev/auth-users

-- --- Optional: Spring-style authorities (if your stack uses this table) ----------
-- INSERT INTO authorities (username, authority) VALUES
--   ('qa.employee.one@webknot.in', 'ROLE_EMPLOYEE'),
--   ('qa.employee.two@webknot.in', 'ROLE_EMPLOYEE'),
--   ('qa.manager.one@webknot.in', 'ROLE_MANAGER')
-- ON CONFLICT DO NOTHING;

-- --- MySQL variant ---------------------------------------------------------------
-- INSERT INTO users (email, password, enabled) VALUES
--   ('qa.employee.one@webknot.in', '$2b$10$hZeOTPNv1i5DUPerNREkz.MHHCruRWFfHZktJVzLc.XbMyfYKThfq', 1),
--   ('qa.employee.two@webknot.in', '$2b$10$hZeOTPNv1i5DUPerNREkz.MHHCruRWFfHZktJVzLc.XbMyfYKThfq', 1),
--   ('qa.manager.one@webknot.in',   '$2b$10$hZeOTPNv1i5DUPerNREkz.MHHCruRWFfHZktJVzLc.XbMyfYKThfq', 1)
-- ON DUPLICATE KEY UPDATE password = VALUES(password);
