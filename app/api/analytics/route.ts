import { NextRequest, NextResponse } from 'next/server';
import { getInsightsMetrics, getGrcMetrics, getOverviewMetrics } from '@/lib/analytics-db';

/**
 * GET /api/analytics?days=30
 * 
 * Returns all validator metrics for the analytics dashboard.
 * Optional days parameter filters data to last N days.
 * Falls back to empty response if DB is unavailable.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const daysParam = searchParams.get('days');
    const days = daysParam ? parseInt(daysParam, 10) : undefined;

    const [insights, controls, evidenceTasks, overview] = await Promise.all([
      getInsightsMetrics(days),
      getGrcMetrics('controls', days).catch(() => null),
      getGrcMetrics('evidence_tasks', days).catch(() => null),
      getOverviewMetrics(days).catch(() => null),
    ]);

    return NextResponse.json({
      success: true,
      source: 'live',
      days: days || 'all',
      data: insights,
      controls,
      evidenceTasks,
      overview,
    });
  } catch (error: any) {
    console.error('[Analytics API] Failed to fetch metrics:', error.message);

    return NextResponse.json({
      success: false,
      source: 'unavailable',
      error: 'Database unavailable',
    }, { status: 503 });
  }
}