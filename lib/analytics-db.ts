/**
 * Analytics Database Service
 * 
 * Connects to Azure SQL via Managed Identity (Entra ID).
 * Provides:
 *   - trackValidation() — fire-and-forget write after each validation
 *   - getInsightsMetrics() — read aggregated metrics for dashboard
 * 
 * Falls back gracefully if DB is unavailable (logs error, doesn't crash).
 */

import sql from 'mssql';

// ============================================================
// Connection
// ============================================================

let pool: sql.ConnectionPool | null = null;

async function getPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool;

  const server = process.env.AZURE_SQL_SERVER;
  const database = process.env.AZURE_SQL_DATABASE;

  if (!server || !database) {
    throw new Error('Missing AZURE_SQL_SERVER or AZURE_SQL_DATABASE env vars');
  }

  // Use @azure/identity for Managed Identity token
  const { DefaultAzureCredential } = await import('@azure/identity');
  const credential = new DefaultAzureCredential();
  const tokenResponse = await credential.getToken('https://database.windows.net/.default');

  const config: sql.config = {
    server,
    database,
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
    authentication: {
      type: 'azure-active-directory-access-token' as any,
      options: {
        token: tokenResponse.token,
      },
    },
  };

  pool = new sql.ConnectionPool(config);
  await pool.connect();
  console.log('[Analytics DB] Connected to Azure SQL');
  return pool;
}

// ============================================================
// Category mapping (dimension → category)
// ============================================================

function getDimensionCategory(dimId: number): string {
  if (dimId >= 1 && dimId <= 3) return 'Content Quality';
  if (dimId >= 4 && dimId <= 8) return 'Legal & Brand Accuracy';
  if (dimId >= 9 && dimId <= 19) return 'Grammar & Style';
  if (dimId >= 20 && dimId <= 29) return 'Formatting';
  if (dimId >= 30) return 'Structure';
  return 'Other';
}

// ============================================================
// Issue type classifier (parses message text → tag)
// ============================================================

function classifyIssue(message: string): string {
  const msg = message.toLowerCase();
  
  // Dim 1 - Writing Goals
  if (msg.includes('writing quality') || msg.includes('ai assessment')) return 'writing_quality';
  if (msg.includes('exceed 40 words') || msg.includes('sentences exceed')) return 'long_sentences';
  
  // Dim 2 - Tone & Style
  if (msg.includes('tone could be improved')) return 'tone_issues';
  if (msg.includes('uk spelling') || msg.includes('us english')) return 'british_spelling';
  
  // Dim 3 - Voice
  if (msg.includes('first-person singular') || msg.includes('replace "i"') || msg.includes('replace "my"')) return 'first_person';
  if (msg.includes('second-person usage')) return 'second_person';
  if (msg.includes('passive voice')) return 'passive_voice';
  
  // Dim 5 - Laws & Regulations
  if (msg.includes("use 'article' not 'art.'") || msg.includes("not 'art.'")) return 'art_shorthand';
  if (msg.includes('use "article') && msg.includes('of the')) return 'wrong_article_format';
  if (msg.includes('acronym') || msg.includes('define on first use')) return 'undefined_acronym';
  if (msg.includes('law name') || msg.includes('capitalize law')) return 'lowercase_law_name';
  
  // Dim 7 - OneTrust
  if (msg.includes('onetrust') && msg.includes('capital o')) return 'onetrust_spelling';
  if (msg.includes("pronoun 'it'") && msg.includes('onetrust')) return 'onetrust_pronoun';
  
  // Dim 8 - Trademarks
  if (msg.includes('missing ™') || msg.includes('missing tm')) return 'missing_trademark';
  if (msg.includes('remove ™')) return 'extra_trademark';
  
  // Dim 9 - Apostrophes
  if (msg.includes('curly apostrophe') || msg.includes('straight apostrophe')) return 'curly_apostrophe';
  
  // Dim 10 - Colons
  if (msg.includes('space before colon') || msg.includes('space(s) before colon')) return 'space_before_colon';
  if (msg.includes('colons in headings')) return 'colon_in_heading';
  if (msg.includes('capitalize the first word') && msg.includes('colon')) return 'lowercase_after_colon';
  
  // Dim 11 - Commas
  if (msg.includes('oxford comma') || msg.includes("before 'and' in list")) return 'missing_oxford_comma';
  if (msg.includes('multiple spaces') || msg.includes('use single space')) return 'double_spaces';
  
  // Dim 12 - Quotation Marks
  if (msg.includes('curly quote') || msg.includes('straight quotes')) return 'curly_quotes';
  
  // Dim 13 - Ellipses
  if (msg.includes('ellips') || msg.includes('three periods')) return 'improper_ellipsis';
  
  // Dim 14 - Semicolons
  if (msg.includes('space before semicolon') || msg.includes("before ';'")) return 'space_before_semicolon';
  
  // Dim 15 - Ampersands
  if (msg.includes("'and' instead of '&'") || msg.includes('ampersand')) return 'ampersand_in_text';
  
  // Dim 16 - Pronouns
  if (msg.includes("pronoun") && msg.includes("'we'")) return 'onetrust_pronoun';
  
  // Dim 17 - Names & Titles
  if (msg.includes('capitalize title abbreviation') || msg.includes("should be 'dr.") || msg.includes("should be 'prof.")) return 'lowercase_title';
  
  // Dim 18 - State Abbreviations
  if (msg.includes('state abbreviation') || msg.includes('spell out state')) return 'state_abbreviation';
  
  // Dim 19 - URLs
  if (msg.includes('blank/incomplete url') || msg.includes('url appears broken')) return 'broken_url';
  
  // Dim 20 - Numbers
  if (msg.includes('spell out numbers') || msg.includes('single digit')) return 'unspelled_number';
  
  // Dim 22 - Dates
  if (msg.includes('uk date format') || msg.includes('must use us format')) return 'uk_date_format';
  if (msg.includes('numeric date format') || msg.includes('spell out month')) return 'numeric_date';
  
  // Dim 23 - Decimals
  if (msg.includes('leading zero') || msg.includes("use '0.")) return 'missing_leading_zero';
  
  // Dim 24 - Percentages
  if (msg.includes('space before percent') || msg.includes("not '50 %'")) return 'space_before_percent';
  
  // Dim 25 - Ranges
  if (msg.includes('en-dash') || msg.includes('ranges with hyphens')) return 'hyphen_range';
  
  // Dim 30 - Structure
  if (msg.includes('sentence case') || msg.includes('capitalize only proper nouns')) return 'heading_title_case';
  if (msg.includes('missing: clear title')) return 'missing_title';
  if (msg.includes('missing: introduction') || msg.includes('missing: clear main sections')) return 'missing_structure';
  if (msg.includes('conclusion or summary')) return 'missing_conclusion';
  
  // Dim 31 - Intro Quality
  if (msg.includes('why this topic') || msg.includes('target audience') || msg.includes('preview what readers')) return 'weak_introduction';
  
  return 'other';
}

// ============================================================
// Track a validation run (fire-and-forget)
// ============================================================

export interface ValidationResult {
  total_score: number;
  total_max: number;
  total_percentage: number;
  status: string;
  categories: {
    [key: string]: {
      name: string;
      score: number;
      max_score: number;
      percentage: number;
      dimensions: Array<{
        dimension_id: number;
        dimension_name: string;
        score: number;
        max_score: number;
        issues: string[];
      }>;
    };
  };
}

export async function trackValidation(
  result: ValidationResult,
  filename: string,
  durationMs: number,
  userId?: string,
  wordCount?: number
): Promise<void> {
  try {
    const db = await getPool();
    const passed = result.status === 'pass';
    
    // Flatten dimensions from categories
    const allDimensions = Object.values(result.categories).flatMap(cat => cat.dimensions);
    const dimensionsWithIssues = allDimensions.filter(d => d.issues.length > 0).length;

    // Insert ValidationRun
    const runResult = await db.request()
      .input('validator_type', sql.VarChar, 'insights')
      .input('content_id', sql.VarChar, filename)
      .input('overall_score', sql.Decimal(5, 2), result.total_score)
      .input('max_score', sql.Int, result.total_max)
      .input('passed', sql.Bit, passed ? 1 : 0)
      .input('dimension_count', sql.Int, allDimensions.length)
      .input('dimensions_with_issues', sql.Int, dimensionsWithIssues)
      .input('duration_ms', sql.Int, durationMs)
      .input('user_id', sql.VarChar, userId || null)
      .input('word_count', sql.Int, wordCount || null)
      .query(`
        INSERT INTO ValidationRuns 
          (validator_type, content_id, overall_score, max_score, passed, dimension_count, dimensions_with_issues, duration_ms, user_id, word_count)
        OUTPUT INSERTED.id
        VALUES 
          (@validator_type, @content_id, @overall_score, @max_score, @passed, @dimension_count, @dimensions_with_issues, @duration_ms, @user_id, @word_count)
      `);

    const runId = runResult.recordset[0].id;

    // Insert failures (one row per individual issue for granular tracking)
    for (const dim of allDimensions) {
      if (dim.issues.length === 0) continue;

      for (const issue of dim.issues) {
        // Skip sub-items (indented lines like "  • ..." or "  ...")
        if (issue.startsWith('  ')) continue;
        
        const issueType = classifyIssue(issue);
        
        await db.request()
          .input('run_id', sql.Int, runId)
          .input('dimension_id', sql.Int, dim.dimension_id)
          .input('dimension_name', sql.VarChar, dim.dimension_name)
          .input('category', sql.VarChar, getDimensionCategory(dim.dimension_id))
          .input('score', sql.Decimal(5, 2), dim.score)
          .input('max_score', sql.Decimal(5, 2), dim.max_score)
          .input('issues_count', sql.Int, 1)
          .input('issue_type', sql.VarChar, issueType)
          .input('issue_description', sql.NVarChar, issue)
          .query(`
            INSERT INTO ValidationFailures 
              (validation_run_id, dimension_id, dimension_name, category, score, max_score, issues_count, issue_type, issue_description)
            VALUES 
              (@run_id, @dimension_id, @dimension_name, @category, @score, @max_score, @issues_count, @issue_type, @issue_description)
          `);
      }
    }

    // Update DailyMetrics
    const today = new Date().toISOString().split('T')[0];
    await db.request()
      .input('date', sql.Date, today)
      .input('validator_type', sql.VarChar, 'insights')
      .input('score', sql.Decimal(5, 2), result.total_percentage)
      .input('passed', sql.Int, passed ? 1 : 0)
      .input('failed', sql.Int, passed ? 0 : 1)
      .input('time_saved', sql.Int, 60) // 1 hour = 60 minutes per article
      .query(`
        MERGE DailyMetrics AS target
        USING (SELECT @date AS date, @validator_type AS validator_type) AS source
        ON target.date = source.date AND target.validator_type = source.validator_type
        WHEN MATCHED THEN
          UPDATE SET 
            total_runs = total_runs + 1,
            total_passed = total_passed + @passed,
            total_failed = total_failed + @failed,
            avg_score = ((avg_score * total_runs) + @score) / (total_runs + 1),
            total_time_saved_minutes = total_time_saved_minutes + @time_saved
        WHEN NOT MATCHED THEN
          INSERT (date, validator_type, total_runs, total_passed, total_failed, avg_score, total_time_saved_minutes)
          VALUES (@date, @validator_type, 1, @passed, @failed, @score, @time_saved);
      `);

    console.log(`[Analytics DB] Tracked validation run #${runId} for ${filename}`);
  } catch (error: any) {
    // Fire-and-forget: log but don't crash
    console.error('[Analytics DB] Failed to track validation:', error.message);
  }
}

// ============================================================
// Query metrics for dashboard
// ============================================================

export interface InsightsMetrics {
  articlesValidated: number;
  avgValidationTimeMs: number;
  avgQualityScore: number;
  timeSavedHours: number;
  passRate: number;
  categoryScores: Array<{ category: string; score: number; color: string }>;
  topIssues: Array<{ issue: string; count: number; percentage: number }>;
  trendData: Array<{ month: string; avgScore: number; passRate: number }>;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Legal & Brand Accuracy': 'bg-blue-500',
  'Grammar & Style': 'bg-green-500',
  'Formatting': 'bg-yellow-500',
  'Content Quality': 'bg-purple-500',
  'Structure': 'bg-teal-500',
};

export async function getInsightsMetrics(): Promise<InsightsMetrics> {
  const db = await getPool();

  // 1. KPI cards
  const kpiResult = await db.request().query(`
    SELECT 
      COUNT(*) AS total_runs,
      AVG(duration_ms) AS avg_duration_ms,
      AVG(overall_score / CAST(vr.max_score AS FLOAT) * 100) AS avg_score,
      SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) AS total_passed
    FROM ValidationRuns vr
    WHERE vr.validator_type = 'insights'
  `);

  const kpi = kpiResult.recordset[0];
  const totalRuns = kpi.total_runs || 0;

  // 2. Category scores (avg percentage per category)
  const categoryResult = await db.request().query(`
    SELECT 
      category,
      AVG(CASE WHEN vf.max_score > 0 THEN (vf.score / vf.max_score) * 100 ELSE 100 END) AS avg_pct
    FROM ValidationFailures vf
    JOIN ValidationRuns vr ON vf.validation_run_id = vr.id
    WHERE vr.validator_type = 'insights'
    GROUP BY category
    ORDER BY avg_pct DESC
  `);

  // Build category scores — show 100% for categories with no failures
  const allCategories = ['Legal & Brand Accuracy', 'Grammar & Style', 'Formatting', 'Content Quality', 'Structure'];
  const categoryMap = new Map(categoryResult.recordset.map((r: any) => [r.category, Math.round(r.avg_pct)]));
  const categoryScores = allCategories.map(cat => ({
    category: cat,
    score: categoryMap.get(cat) ?? 100,
    color: CATEGORY_COLORS[cat] || 'bg-gray-500',
  }));

  // 3. Top 5 issues (most frequent issue types)
  const issuesResult = await db.request().query(`
    SELECT TOP 5
      issue_type,
      COUNT(*) AS total_issues
    FROM ValidationFailures vf
    JOIN ValidationRuns vr ON vf.validation_run_id = vr.id
    WHERE vr.validator_type = 'insights'
      AND vf.issue_type IS NOT NULL
      AND vf.issue_type != 'other'
    GROUP BY issue_type
    ORDER BY total_issues DESC
  `);

  const totalIssues = issuesResult.recordset.reduce((sum: number, r: any) => sum + r.total_issues, 0);
  
  const ISSUE_LABELS: Record<string, string> = {
    'british_spelling': 'British Spellings (Dim 2)',
    'art_shorthand': 'Art. Shorthand (Dim 5)',
    'wrong_article_format': 'Wrong Article Format (Dim 5)',
    'undefined_acronym': 'Undefined Acronyms (Dim 5)',
    'lowercase_law_name': 'Lowercase Law Names (Dim 5)',
    'onetrust_spelling': 'OneTrust Misspelling (Dim 7)',
    'onetrust_pronoun': 'OneTrust Pronoun (Dim 7)',
    'missing_trademark': 'Missing Trademark ™ (Dim 8)',
    'curly_apostrophe': 'Curly Apostrophes (Dim 9)',
    'space_before_colon': 'Space Before Colon (Dim 10)',
    'colon_in_heading': 'Colon in Heading (Dim 10)',
    'lowercase_after_colon': 'Lowercase After Colon (Dim 10)',
    'missing_oxford_comma': 'Missing Oxford Comma (Dim 11)',
    'double_spaces': 'Double Spaces (Dim 11)',
    'curly_quotes': 'Curly Quotation Marks (Dim 12)',
    'improper_ellipsis': 'Improper Ellipsis (Dim 13)',
    'space_before_semicolon': 'Space Before Semicolon (Dim 14)',
    'ampersand_in_text': 'Ampersand in Text (Dim 15)',
    'lowercase_title': 'Lowercase Title Abbreviation (Dim 17)',
    'state_abbreviation': 'State Abbreviations (Dim 18)',
    'broken_url': 'Broken/Incomplete URL (Dim 19)',
    'unspelled_number': 'Unspelled Single Digit (Dim 20)',
    'uk_date_format': 'UK Date Format (Dim 22)',
    'numeric_date': 'Numeric Date Format (Dim 22)',
    'missing_leading_zero': 'Missing Leading Zero (Dim 23)',
    'space_before_percent': 'Space Before % (Dim 24)',
    'hyphen_range': 'Hyphen Instead of En-Dash (Dim 25)',
    'heading_title_case': 'Heading Title Case (Dim 30)',
    'missing_title': 'Missing Title (Dim 30)',
    'missing_structure': 'Missing Sections (Dim 30)',
    'missing_conclusion': 'Missing Conclusion (Dim 30)',
    'weak_introduction': 'Weak Introduction (Dim 31)',
    'writing_quality': 'Writing Quality (Dim 1)',
    'long_sentences': 'Long Sentences (Dim 1)',
    'tone_issues': 'Tone Issues (Dim 2)',
    'first_person': 'First Person Usage (Dim 3)',
    'second_person': 'Second Person Usage (Dim 3)',
    'passive_voice': 'Passive Voice (Dim 3)',
  };
  
  const topIssues = issuesResult.recordset.map((r: any) => ({
    issue: ISSUE_LABELS[r.issue_type] || r.issue_type,
    count: r.total_issues,
    percentage: totalIssues > 0 ? Math.round((r.total_issues / totalIssues) * 100) : 0,
  }));

  // 4. Monthly trend (last 6 months)
  const trendResult = await db.request().query(`
    SELECT 
      FORMAT(vr.created_at, 'yyyy-MM') AS month_key,
      FORMAT(vr.created_at, 'MMM') AS month_label,
      AVG(vr.overall_score / CAST(vr.max_score AS FLOAT) * 100) AS avg_score,
      SUM(CASE WHEN vr.passed = 1 THEN 1.0 ELSE 0.0 END) / COUNT(*) * 100 AS pass_rate
    FROM ValidationRuns vr
    WHERE vr.validator_type = 'insights'
      AND vr.created_at >= DATEADD(month, -6, GETUTCDATE())
    GROUP BY FORMAT(vr.created_at, 'yyyy-MM'), FORMAT(vr.created_at, 'MMM')
    ORDER BY month_key
  `);

  const trendData = trendResult.recordset.map((r: any) => ({
    month: r.month_label,
    avgScore: Math.round(r.avg_score * 10) / 10,
    passRate: Math.round(r.pass_rate),
  }));

  return {
    articlesValidated: totalRuns,
    avgValidationTimeMs: Math.round(kpi.avg_duration_ms || 0),
    avgQualityScore: Math.round((kpi.avg_score || 0) * 10) / 10,
    timeSavedHours: Math.round((totalRuns * 60) / 60), // 1hr per article
    passRate: totalRuns > 0 ? Math.round((kpi.total_passed / totalRuns) * 100) : 0,
    categoryScores,
    topIssues,
    trendData,
  };
}

// ============================================================
// Reports data (validation log, user summary, article history)
// ============================================================

export interface ReportsData {
  validationLog: Array<{
    id: number;
    date: string;
    user: string;
    filename: string;
    score: number;
    maxScore: number;
    percentage: number;
    passed: boolean;
    wordCount: number | null;
    durationMs: number;
    issueCount: number;
  }>;
  userSummary: Array<{
    user: string;
    totalRuns: number;
    avgScore: number;
    passRate: number;
    lastActive: string;
    totalTimeSavedHours: number;
  }>;
  articleHistory: Array<{
    filename: string;
    runs: number;
    firstScore: number;
    latestScore: number;
    improvement: number;
    firstDate: string;
    latestDate: string;
  }>;
}

export async function getReportsData(days: number = 90): Promise<ReportsData> {
  const db = await getPool();

  // 1. Validation Log — every run, most recent first
  const logResult = await db.request()
    .input('days', sql.Int, days)
    .query(`
      SELECT 
        vr.id,
        vr.created_at,
        vr.user_id,
        vr.content_id,
        vr.overall_score,
        vr.max_score,
        CASE WHEN vr.max_score > 0 
          THEN ROUND(vr.overall_score / CAST(vr.max_score AS FLOAT) * 100, 1) 
          ELSE 0 END AS percentage,
        vr.passed,
        vr.word_count,
        vr.duration_ms,
        vr.dimensions_with_issues
      FROM ValidationRuns vr
      WHERE vr.validator_type = 'insights'
        AND vr.created_at >= DATEADD(day, -@days, GETUTCDATE())
      ORDER BY vr.created_at DESC
    `);

  const validationLog = logResult.recordset.map((r: any) => ({
    id: r.id,
    date: r.created_at,
    user: r.user_id || 'Unknown',
    filename: r.content_id || 'Unknown',
    score: r.overall_score,
    maxScore: r.max_score,
    percentage: r.percentage,
    passed: !!r.passed,
    wordCount: r.word_count,
    durationMs: r.duration_ms,
    issueCount: r.dimensions_with_issues || 0,
  }));

  // 2. User Summary — aggregated per user
  const userResult = await db.request()
    .input('days', sql.Int, days)
    .query(`
      SELECT 
        vr.user_id,
        COUNT(*) AS total_runs,
        ROUND(AVG(vr.overall_score / CAST(vr.max_score AS FLOAT) * 100), 1) AS avg_score,
        ROUND(SUM(CASE WHEN vr.passed = 1 THEN 1.0 ELSE 0.0 END) / COUNT(*) * 100, 0) AS pass_rate,
        MAX(vr.created_at) AS last_active
      FROM ValidationRuns vr
      WHERE vr.validator_type = 'insights'
        AND vr.created_at >= DATEADD(day, -@days, GETUTCDATE())
      GROUP BY vr.user_id
      ORDER BY total_runs DESC
    `);

  const userSummary = userResult.recordset.map((r: any) => ({
    user: r.user_id || 'Unknown',
    totalRuns: r.total_runs,
    avgScore: r.avg_score,
    passRate: r.pass_rate,
    lastActive: r.last_active,
    totalTimeSavedHours: Math.round((r.total_runs * 60) / 60), // 1hr per article
  }));

  // 3. Article History — files validated multiple times (score progression)
  const articleResult = await db.request()
    .input('days', sql.Int, days)
    .query(`
      SELECT 
        vr.content_id,
        COUNT(*) AS runs,
        MIN(vr.created_at) AS first_date,
        MAX(vr.created_at) AS latest_date
      FROM ValidationRuns vr
      WHERE vr.validator_type = 'insights'
        AND vr.created_at >= DATEADD(day, -@days, GETUTCDATE())
        AND vr.content_id IS NOT NULL
      GROUP BY vr.content_id
      ORDER BY runs DESC, latest_date DESC
    `);

  // Get first and latest scores for each article
  const articleHistory: ReportsData['articleHistory'] = [];
  
  for (const r of articleResult.recordset) {
    const scoresResult = await db.request()
      .input('content_id', sql.VarChar, r.content_id)
      .query(`
        SELECT TOP 1 
          ROUND(vr.overall_score / CAST(vr.max_score AS FLOAT) * 100, 1) AS pct
        FROM ValidationRuns vr
        WHERE vr.content_id = @content_id AND vr.validator_type = 'insights'
        ORDER BY vr.created_at ASC
      `);
    
    const latestResult = await db.request()
      .input('content_id', sql.VarChar, r.content_id)
      .query(`
        SELECT TOP 1 
          ROUND(vr.overall_score / CAST(vr.max_score AS FLOAT) * 100, 1) AS pct
        FROM ValidationRuns vr
        WHERE vr.content_id = @content_id AND vr.validator_type = 'insights'
        ORDER BY vr.created_at DESC
      `);

    const firstScore = scoresResult.recordset[0]?.pct || 0;
    const latestScore = latestResult.recordset[0]?.pct || 0;

    articleHistory.push({
      filename: r.content_id,
      runs: r.runs,
      firstScore,
      latestScore,
      improvement: Math.round((latestScore - firstScore) * 10) / 10,
      firstDate: r.first_date,
      latestDate: r.latest_date,
    });
  }

  return { validationLog, userSummary, articleHistory };
}