import { NextResponse } from 'next/server';
import { getInsightsMetrics, getGrcMetrics } from '@/lib/analytics-db';

/**
 * GET /api/analytics
 * 
 * Returns all validator metrics for the analytics dashboard.
 * Falls back to empty response if DB is unavailable.
 */
export async function GET() {
  try {
    const [insights, controls, evidenceTasks] = await Promise.all([
      getInsightsMetrics(),
      getGrcMetrics('controls').catch(() => null),
      getGrcMetrics('evidence_tasks').catch(() => null),
    ]);

    return NextResponse.json({
      success: true,
      source: 'live',
      data: insights,
      controls,
      evidenceTasks,
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