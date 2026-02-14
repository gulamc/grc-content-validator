import { NextResponse } from 'next/server';
import { getInsightsMetrics } from '@/lib/analytics-db';

/**
 * GET /api/analytics
 * 
 * Returns Insights validator metrics for the analytics dashboard.
 * Falls back to empty response if DB is unavailable.
 */
export async function GET() {
  try {
    const metrics = await getInsightsMetrics();

    return NextResponse.json({
      success: true,
      source: 'live',
      data: metrics,
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