-- ============================================================
-- GN Validator — Migration 002
-- Disables G6 (Money/Currency) and G8 (Lists) in gn_rules.
--
-- Run this only if migration 001 was already applied before
-- the G6/G8 seed was corrected to is_active = 0.
-- On a fresh deploy, 001 already seeds them as inactive —
-- running this migration is safe either way (idempotent).
--
-- Root cause: ruleG6 and ruleG8 in rules-g.ts delegate to
-- the scorer registry keys 'money' and 'lists', which are
-- PASS-always stubs for Insights parity. GN-local
-- implementations must be written in app/gn-validator/rules/
-- before these rules can be re-enabled.
-- ============================================================

UPDATE gn_rules SET is_active = 0 WHERE id = 'G6';
UPDATE gn_rules SET is_active = 0 WHERE id = 'G8';
