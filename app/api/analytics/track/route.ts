import { NextRequest, NextResponse } from 'next/server';
import { trackGrcValidation, GrcTrackingPayload } from '@/lib/analytics-db';

/**
 * POST /api/analytics/track
 * 
 * Accepts Controls or ET validation results and writes to analytics DB.
 * Called by batch processor and individual validators.
 * Fire-and-forget from client side — errors don't block UI.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Accept single item or array of items
    const items: GrcTrackingPayload[] = Array.isArray(body) ? body : [body];
    
    // Get user from auth header
    const userId = request.headers.get('x-ms-client-principal-name') || undefined;
    
    // Track each item (fire-and-forget per item, don't let one failure stop others)
    let tracked = 0;
    for (const item of items) {
      try {
        // Inject userId if not provided
        if (!item.userId && userId) {
          item.userId = userId;
        }
        await trackGrcValidation(item);
        tracked++;
      } catch (err: any) {
        console.error(`[Track API] Failed to track ${item.contentId}:`, err.message);
      }
    }

    return NextResponse.json({ 
      success: true, 
      tracked, 
      total: items.length 
    });
  } catch (error: any) {
    console.error('[Track API] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Tracking failed' },
      { status: 500 }
    );
  }
}