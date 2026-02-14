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
    const passed = result.status === 'pass' || result.total_percentage >= 70;
    
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

    // Insert failures (only dimensions with issues)
    for (const dim of allDimensions) {
      if (dim.issues.length === 0) continue;

      await db.request()
        .input('run_id', sql.Int, runId)
        .input('dimension_id', sql.Int, dim.dimension_id)
        .input('dimension_name', sql.VarChar, dim.dimension_name)
        .input('category', sql.VarChar, getDimensionCategory(dim.dimension_id))
        .input('score', sql.Decimal(5, 2), dim.score)
        .input('max_score', sql.Decimal(5, 2), dim.max_score)
        .input('issues_count', sql.Int, dim.issues.length)
        .input('issue_description', sql.NVarChar, dim.issues.join('\n'))
        .query(`
          INSERT INTO ValidationFailures 
            (validation_run_id, dimension_id, dimension_name, category, score, max_score, issues_count, issue_description)
          VALUES 
            (@run_id, @dimension_id, @dimension_name, @category, @score, @max_score, @issues_count, @issue_description)
        `);
    }

    // Update DailyMetrics
    const today = new Date().toISOString().split('T')[0];
    await db.request()
      .input('date', sql.Date, today)
      .input('validator_type', sql.VarChar, 'insights')
      .input('score', sql.Decimal(5, 2), result.total_percentage)
      .input('passed', sql.Int, passed ? 1 : 0)
      .input('failed', sql.Int, passed ? 0 : 1)
      .input('time_saved', sql.Int, 120) // 2 hours = 120 minutes per article
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
      AVG(overall_score / CAST(max_score AS FLOAT) * 100) AS avg_score,
      SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) AS total_passed
    FROM ValidationRuns
    WHERE validator_type = 'insights'
  `);

  const kpi = kpiResult.recordset[0];
  const totalRuns = kpi.total_runs || 0;

  // 2. Category scores (avg percentage per category)
  const categoryResult = await db.request().query(`
    SELECT 
      category,
      AVG(CASE WHEN max_score > 0 THEN (score / max_score) * 100 ELSE 100 END) AS avg_pct
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

  // 3. Top 5 issues (most frequent dimension failures)
  const issuesResult = await db.request().query(`
    SELECT TOP 5
      dimension_name,
      SUM(issues_count) AS total_issues
    FROM ValidationFailures vf
    JOIN ValidationRuns vr ON vf.validation_run_id = vr.id
    WHERE vr.validator_type = 'insights'
    GROUP BY dimension_name
    ORDER BY total_issues DESC
  `);

  const totalIssues = issuesResult.recordset.reduce((sum: number, r: any) => sum + r.total_issues, 0);
  const topIssues = issuesResult.recordset.map((r: any) => ({
    issue: r.dimension_name,
    count: r.total_issues,
    percentage: totalIssues > 0 ? Math.round((r.total_issues / totalIssues) * 100) : 0,
  }));

  // 4. Monthly trend (last 6 months)
  const trendResult = await db.request().query(`
    SELECT 
      FORMAT(created_at, 'yyyy-MM') AS month_key,
      FORMAT(created_at, 'MMM') AS month_label,
      AVG(overall_score / CAST(max_score AS FLOAT) * 100) AS avg_score,
      SUM(CASE WHEN passed = 1 THEN 1.0 ELSE 0.0 END) / COUNT(*) * 100 AS pass_rate
    FROM ValidationRuns
    WHERE validator_type = 'insights'
      AND created_at >= DATEADD(month, -6, GETUTCDATE())
    GROUP BY FORMAT(created_at, 'yyyy-MM'), FORMAT(created_at, 'MMM')
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
    timeSavedHours: Math.round((totalRuns * 120) / 60), // 2hrs per article
    passRate: totalRuns > 0 ? Math.round((kpi.total_passed / totalRuns) * 100) : 0,
    categoryScores,
    topIssues,
    trendData,
  };
}