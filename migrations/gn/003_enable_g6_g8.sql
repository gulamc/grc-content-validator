-- ============================================================
-- GN Validator — Migration 003
-- Re-enables G6 (Money and Currency) and G8 (Lists) rules.
-- Run once against the Azure SQL database after deploying the
-- real scorer/rules/money.ts and scorer/rules/lists.ts implementations.
-- Safe to run on environments where 001 was deployed before the seeds were corrected.
-- ============================================================

UPDATE gn_rules SET is_active = 1 WHERE id = 'G6';
UPDATE gn_rules SET is_active = 1 WHERE id = 'G8';
