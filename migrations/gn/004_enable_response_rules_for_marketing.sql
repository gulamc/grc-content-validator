-- ============================================================
-- Migration 004 — Enable response-scanning rules for Marketing docs
-- ============================================================
--
-- Historical context (pre-#28):
--   Direct Marketing GNs used a 1-row Citation-only format with NO
--   Response cell. parser-marketing.ts never populated q.response —
--   every response-scanning rule (F1, F2, I1, I2, I3) got
--   `if (!question.response) continue` and silently no-op'd. To stop
--   these rules from being exercised on marketing docs where they
--   would run trivially and pointlessly, the initial seed
--   (001_gn_validator_tables.sql) marks them as:
--
--     F1: applies_marketing = 0
--     F2: applies_marketing = 0
--     I1: applies_marketing = 0
--     I2: applies_marketing = 0
--     I3: applies_marketing = 0
--
--   All G-series rules (which read the SAME response text via
--   responseCitationCells) are marked applies_marketing = 1.
--
-- Post-#28:
--   parser-marketing now populates q.response from paragraphs (the
--   correct DM structure). Response-scanning rules SHOULD fire on
--   DM docs. But runGNRules in production respects the DB
--   applies_marketing flag; the DB still says "these don't apply
--   to marketing". Result: on the deployed route, F1/F2/I1/I2/I3
--   are silently skipped for marketing docs — Turkey shows F1=0
--   and I2=0 in production despite the fixture (which calls
--   RULE_FNS directly, bypassing the config filter) showing F1=25
--   and I2=1.
--
--   Analyst-reported bug on 2026-07-05: post-#28 deploy, Turkey
--   returned 54 comments but F1 (25 real "Please refer to Section
--   X" findings) and I2 (1 short-response finding) were both zero.
--   The 6 G-series rules all fired correctly. Sole cause: this DB
--   config flag.
--
-- Fix: flip applies_marketing = 1 for the 5 response-scanning
-- rules. G-series was already 1. C1-C3, D2, D4, A2, A4 (persona /
-- persona-related, Overview-specific) stay 0 — they operate on
-- fields DM docs genuinely don't have (persona cells, GDPR-only
-- phrases in EU Overview breach responses).
--
-- Verified by scripts/verify-marketing-rule-config-consistency.mjs
-- which parses this migration alongside 001 and asserts every rule
-- that reads question.response.text (per code inspection) ends up
-- applies_marketing = 1 in the final DB state.
-- ============================================================

UPDATE gn_rules SET applies_marketing = 1 WHERE id = 'F1';
UPDATE gn_rules SET applies_marketing = 1 WHERE id = 'F2';
UPDATE gn_rules SET applies_marketing = 1 WHERE id = 'I1';
UPDATE gn_rules SET applies_marketing = 1 WHERE id = 'I2';
UPDATE gn_rules SET applies_marketing = 1 WHERE id = 'I3';

-- Sanity: after this migration runs on a database seeded from 001,
-- exactly these 5 rules should have flipped. To verify:
--   SELECT id, applies_marketing FROM gn_rules
--    WHERE id IN ('F1', 'F2', 'I1', 'I2', 'I3');
-- Expected: all 5 rows show applies_marketing = 1.
