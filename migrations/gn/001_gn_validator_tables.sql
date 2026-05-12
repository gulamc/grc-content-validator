-- ============================================================
-- GN Validator — Migration 001
-- Creates tables and seeds all 42 rule configurations.
-- Run once against the Azure SQL database before deploying.
-- ============================================================

-- Rules configuration table.
-- applies_* flags control which GN types each rule runs against.
-- fix_type is the primary behaviour: 'auto' | 'ai-suggestion' | 'flag'.
-- Rules whose fix_type varies per finding (e.g. C1) use the primary type here;
-- the actual per-finding fixType is set by the rule function in code.
CREATE TABLE gn_rules (
  id                  NVARCHAR(10)   NOT NULL PRIMARY KEY,
  name                NVARCHAR(200)  NOT NULL,
  category            NVARCHAR(50)   NOT NULL,
  what_it_checks      NVARCHAR(MAX)  NULL,
  fix_type            NVARCHAR(20)   NOT NULL,  -- 'auto' | 'ai-suggestion' | 'flag'
  applies_overview    BIT            NOT NULL DEFAULT 1,
  applies_breach      BIT            NOT NULL DEFAULT 1,
  applies_pia         BIT            NOT NULL DEFAULT 1,
  applies_employment  BIT            NOT NULL DEFAULT 1,
  applies_marketing   BIT            NOT NULL DEFAULT 1,
  is_active           BIT            NOT NULL DEFAULT 1,
  created_at          DATETIME2      NOT NULL DEFAULT GETDATE()
);

-- Validation runs log.
CREATE TABLE gn_validation_runs (
  id            UNIQUEIDENTIFIER  NOT NULL PRIMARY KEY DEFAULT NEWID(),
  gn_type       NVARCHAR(50)      NOT NULL,
  jurisdiction  NVARCHAR(200)     NULL,
  file_name     NVARCHAR(500)     NULL,
  run_at        DATETIME2         NOT NULL DEFAULT GETDATE(),
  run_by        NVARCHAR(200)     NULL,
  total_issues  INT               NULL,
  auto_fixed    INT               NULL,
  ai_suggestions INT              NULL,
  flags         INT               NULL
);

-- Individual results per question/field per run.
CREATE TABLE gn_validation_results (
  id              UNIQUEIDENTIFIER  NOT NULL PRIMARY KEY DEFAULT NEWID(),
  run_id          UNIQUEIDENTIFIER  NOT NULL REFERENCES gn_validation_runs(id),
  rule_id         NVARCHAR(10)      NOT NULL REFERENCES gn_rules(id),
  question_number NVARCHAR(50)      NULL,
  field           NVARCHAR(50)      NULL,  -- 'response' | 'citation' | 'persona' | 'document'
  severity        NVARCHAR(20)      NULL,
  message         NVARCHAR(MAX)     NULL,
  suggested_fix   NVARCHAR(MAX)     NULL,
  fix_type        NVARCHAR(20)      NULL
);

-- ============================================================
-- Seed: all 42 rules
-- Columns: id, name, category, what_it_checks, fix_type,
--          applies_overview, applies_breach, applies_pia,
--          applies_employment, applies_marketing, is_active
-- ============================================================

-- CATEGORY A — Structure
INSERT INTO gn_rules VALUES ('A1', 'Table Structure Integrity',
  'A - Structure',
  'Every sub-question has the expected number of rows for the GN type.',
  'flag', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('A2', 'Response Not Empty',
  'A - Structure',
  'Response cell must not be blank (with parent-child skip logic for 8.1.x).',
  'flag', 1,1,1,1,0, 1, GETDATE());

INSERT INTO gn_rules VALUES ('A3', 'Citation Not Empty',
  'A - Structure',
  'Citation cell must not be blank. Minimum valid value: "Not applicable."',
  'flag', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('A4', 'Applicable Persona Not Empty',
  'A - Structure',
  'Applicable Persona cell must not be blank.',
  'flag', 1,1,1,0,0, 1, GETDATE());

-- CATEGORY B — Citations
INSERT INTO gn_rules VALUES ('B1', 'Citation Field Formatting',
  'B - Citations',
  'Each law on its own line; no bullets; laws not joined with "and".',
  'auto', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('B2', 'Citation Article Range Format',
  'B - Citations',
  'Three or more consecutive articles must use a dash range.',
  'auto', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('B3', 'No Citations in List-of-Laws Questions',
  'B - Citations',
  'For list-of-laws questions (1.1.1 and 1.3.1), Citation must be "Not applicable."',
  'flag', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('B4', 'References in Response Must Appear in Citation',
  'B - Citations',
  'Any law, case, or guideline mentioned in Response must appear in Citation.',
  'ai-suggestion', 1,1,1,1,1, 1, GETDATE());

-- CATEGORY C — Applicable Persona
INSERT INTO gn_rules VALUES ('C1', 'Valid Persona Values',
  'C - Applicable Persona',
  'Auto-corrects known variants; flags prohibited terms; AI assesses everything else.',
  'ai-suggestion', 1,1,1,0,0, 1, GETDATE());

INSERT INTO gn_rules VALUES ('C2', 'Specific Sections Require Not Applicable Persona',
  'C - Applicable Persona',
  'Certain sections must have "Not applicable." in Applicable Persona.',
  'auto', 1,1,1,0,0, 1, GETDATE());

INSERT INTO gn_rules VALUES ('C3', 'Persona Consistency Within Legal Basis',
  'C - Applicable Persona',
  'Within sections 5 and 6, all questions in a sub-section must share the same persona.',
  'flag', 1,0,0,0,0, 1, GETDATE());

-- CATEGORY D — Full Stop Rules
INSERT INTO gn_rules VALUES ('D1', 'Not Applicable Requires Full Stop',
  'D - Full Stop Rules',
  '"Not applicable" in any cell must end with a full stop and capital N.',
  'auto', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('D2', 'GDPR No-Variation Phrase Requires Full Stop',
  'D - Full Stop Rules',
  '"There are no national variations from the GDPR" must end with a full stop.',
  'auto', 1,1,1,0,0, 1, GETDATE());

INSERT INTO gn_rules VALUES ('D3', 'Citations Do Not End With Full Stop',
  'D - Full Stop Rules',
  'Citation cell content must not end with a full stop (except allowed phrases).',
  'auto', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('D4', 'Persona Role Labels Do Not End With Full Stop',
  'D - Full Stop Rules',
  'Applicable Persona values must not end with a full stop (except "Not applicable.").',
  'auto', 1,1,1,0,0, 1, GETDATE());

-- CATEGORY E — EU / GDPR
-- Note: E1 and E2 are runtime-filtered by jurisdiction inside the rule function.
-- The applies_* flags here govern GN type; EU-only logic is in code.
INSERT INTO gn_rules VALUES ('E1', 'GDPR No-Variation Triple Placement',
  'E - EU / GDPR',
  'If Response is the no-variation phrase, same phrase must appear in Citation and Persona.',
  'auto', 1,1,1,0,0, 1, GETDATE());

-- E2 deferred to Phase 1E: semantic check requires AI evaluation; heuristic would erode analyst trust.
INSERT INTO gn_rules VALUES ('E2', 'GDPR National Interpretation Must Be Cited',
  'E - EU / GDPR',
  'If Response cites both GDPR and a national law, the GDPR provision must appear in Citation.',
  'flag', 1,1,1,1,0, 0, GETDATE());  -- is_active=0: deferred to 1E (AI-evaluated)

-- CATEGORY F — Cross-References
INSERT INTO gn_rules VALUES ('F1', 'Cross-Reference Format',
  'F - Cross-References',
  'Cross-references must follow "Please see section X.X.X. above/below." format.',
  'auto', 1,1,1,1,0, 1, GETDATE());

INSERT INTO gn_rules VALUES ('F2', 'Citation Duplication on Cross-References',
  'F - Cross-References',
  'When a Response cross-references another section, Citation must include that section''s citations.',
  'ai-suggestion', 1,1,1,1,0, 1, GETDATE());

-- CATEGORY G — Language & Style
INSERT INTO gn_rules VALUES ('G1', 'US English Spelling',
  'G - Language & Style',
  'Response and Citation cells must use US English spelling.',
  'flag', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('G2', 'Oxford Comma',
  'G - Language & Style',
  'Lists of three or more items must use the Oxford comma.',
  'auto', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('G3', 'Numbers Spell Out Zero Through Nine',
  'G - Language & Style',
  'Numbers zero through nine must be spelled out (except article/section numbers after legal prefixes).',
  'flag', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('G4', 'Date Format',
  'G - Language & Style',
  'Dates must be in Month DD, YYYY format.',
  'flag', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('G5', 'Decimals and Fractions',
  'G - Language & Style',
  'Decimals and fractions must follow style guide format.',
  'flag', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('G6', 'Money and Currency',
  'G - Language & Style',
  'Currency code before number; USD conversion in brackets.',
  'flag', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('G7', 'Straight Apostrophes and Quotation Marks',
  'G - Language & Style',
  'Curly (smart) apostrophes and quotation marks must be replaced with straight ones.',
  'auto', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('G8', 'Lists Use Bullets Not Roman Numerals or Numbers',
  'G - Language & Style',
  'General non-sequential lists must use bullet points, not roman numerals or numbered lists.',
  'flag', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('G9', 'Latin Words in Italics',
  'G - Language & Style',
  'Latin words and phrases must appear in italics.',
  'flag', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('G10', 'Key Concepts Capitalized',
  'G - Language & Style',
  'Specified key concepts (DPO, BCRs, IoT, etc.) must be capitalized.',
  'flag', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('G10b', 'First Word in Bulleted List Not Capitalized',
  'G - Language & Style',
  'First word of each bullet must not be capitalized unless it is a proper noun or law title.',
  'flag', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('G11', 'Section Lowercase for GN References',
  'G - Language & Style',
  '"section" is lowercase when referring to GN parts; capitalized only for legal instruments.',
  'auto', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('G12', 'No Ampersands',
  'G - Language & Style',
  'Ampersands must not be used in running text (exception: company/brand names).',
  'flag', 1,1,1,1,1, 1, GETDATE());

-- CATEGORY H — References
INSERT INTO gn_rules VALUES ('H1', 'Authority Names No The in Abbreviation',
  'H - References',
  'When an authority is defined in brackets, "the" must not appear inside the brackets.',
  'auto', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('H2', 'DPA Abbreviation Rule',
  'H - References',
  '"DPA" must never abbreviate a data protection act.',
  'flag', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('H3', 'Attorneys General Plural',
  'H - References',
  '"Attorneys General" is the correct plural; "Attorney Generals" is incorrect.',
  'auto', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('H4', 'Full Legal Citation on First Mention',
  'H - References',
  'Laws must be cited in full on first mention, with abbreviation defined.',
  'ai-suggestion', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('H5', 'Abbreviations Spelled Out on First Use',
  'H - References',
  'Abbreviations must be spelled out on first use (with standard exceptions).',
  'flag', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('H6', 'Non-English Source Notation',
  'H - References',
  'Non-English-only laws must include "(only available in [language] here)" before the abbreviation.',
  'flag', 1,1,1,1,1, 1, GETDATE());

INSERT INTO gn_rules VALUES ('H7', 'Case Law Citation Format',
  'H - References',
  'Only parties'' names italicised; case number, court, year in roman type.',
  'flag', 1,1,1,1,1, 1, GETDATE());

-- CATEGORY I — AI-Evaluated Quality
INSERT INTO gn_rules VALUES ('I1', 'Response Prose Quality',
  'I - AI-Evaluated Quality',
  'Response must be full professional prose, not shorthand or fragments.',
  'ai-suggestion', 1,1,1,1,0, 1, GETDATE());

INSERT INTO gn_rules VALUES ('I2', 'Response Completeness',
  'I - AI-Evaluated Quality',
  'Very short responses that cannot constitute a complete answer are flagged.',
  'flag', 1,1,1,1,0, 1, GETDATE());

INSERT INTO gn_rules VALUES ('I3', 'Tense Consistency',
  'I - AI-Evaluated Quality',
  'Tense must be consistent within a single Response cell.',
  'flag', 1,1,1,1,0, 1, GETDATE());
