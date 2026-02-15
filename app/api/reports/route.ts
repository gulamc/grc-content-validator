import { NextRequest, NextResponse } from 'next/server';
import { getReportsData } from '@/lib/analytics-db';

/**
 * GET /api/reports
 * 
 * Returns reports data for the reports dashboard.
 * Query params:
 *   - days: number of days to look back (default 90)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '90', 10);

    const data = await getReportsData(days);

    return NextResponse.json({
      success: true,
      source: 'live',
      data,
    });
  } catch (error: any) {
    console.error('[Reports API] Failed to fetch reports:', error.message);

    return NextResponse.json({
      success: false,
      source: 'unavailable',
      error: 'Database unavailable',
    }, { status: 503 });
  }
}