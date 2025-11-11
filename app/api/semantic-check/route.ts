// app/api/semantic-check/route.ts
// API endpoint wrapper for semantic checking (uses shared function)

import { NextResponse } from 'next/server';
import { checkSemanticEquivalence, getCacheStats } from '@/lib/semanticCheck';

export async function POST(request: Request) {
  try {
    const { term, text, context } = await request.json();

    if (!term || !text) {
      return NextResponse.json(
        { error: 'Missing required fields: term and text' },
        { status: 400 }
      );
    }

    const result = await checkSemanticEquivalence(term, text, context);
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('API Semantic Check Error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error',
        match: false,
        explanation: 'AI check failed, falling back to dictionary'
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check status and cache stats
export async function GET() {
  const cacheStats = getCacheStats();
  
  return NextResponse.json({
    status: 'ok',
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    cacheSize: cacheStats.size,
    cacheTTL: cacheStats.ttl,
    timestamp: new Date().toISOString()
  });
}