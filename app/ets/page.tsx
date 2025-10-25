'use client';
import React, { useState } from 'react';
import { scoreET } from '@/scorer/ets';
import etSpec from '@/specs/ets_standard.v1.2.json';

type EtScoreResponse = any;

export default function ETsPage() {
  const [what, setWhat] = useState('');
  const [how, setHow] = useState('');
  const [result, setResult] = useState<EtScoreResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleScore() {
    if (!what.trim() || !how.trim()) {
      alert('Please fill in both What and How fields');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const scored = scoreET(
        { what_to_collect: what, how_to_collect: how },
        etSpec
      );
      console.log('Score result:', scored);
      setResult(scored);
    } catch (e: any) {
      console.error('Scoring error:', e);
      setError(e?.message || 'Scoring failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setWhat('');
    setHow('');
    setResult(null);
    setError(null);
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Evidence Task Validator</h1>
          <p className="text-sm text-slate-600 mt-1">
            Validate Evidence Tasks against the GRC Content Standard
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Panel - Input */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Evidence Task</h2>

            <div className="space-y-4">
              {/* What to Collect */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  What to Collect <span className="text-slate-500">(outcome)</span>
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  rows={4}
                  value={what}
                  onChange={(e) => setWhat(e.target.value)}
                  placeholder="Example: Provide evidence to show that access reviews are completed and approved."
                />
                <p className="text-xs text-slate-500 mt-1">
                  Start with "Provide evidence to show..." and describe the outcome/result.
                </p>
              </div>

              {/* How to Collect */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  How to Collect <span className="text-slate-500">(tangible artifacts)</span>
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  rows={6}
                  value={how}
                  onChange={(e) => setHow(e.target.value)}
                  placeholder="Example: Maintain the following: a) Access review report (last 30 days); b) Approval records for the reviews."
                />
                <p className="text-xs text-slate-500 mt-1">
                  List specific artifacts with timeframes or dates. Use structured format (a, b, c or 1, 2, 3).
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleScore}
                  disabled={loading}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium py-2.5 px-4 rounded-md transition-colors"
                >
                  {loading ? 'Scoring...' : 'Score ET'}
                </button>
                <button
                  onClick={handleClear}
                  className="px-4 py-2.5 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Clear
                </button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
                  Error: {error}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Results */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            {!result ? (
              <div className="flex items-center justify-center h-full text-slate-400">
                <div className="text-center">
                  <svg
                    className="mx-auto h-12 w-12 text-slate-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="mt-2 text-sm">Results will appear here</p>
                </div>
              </div>
            ) : (
              <EtScorePanel result={result} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Score Panel Component
function EtScorePanel({ result }: { result: EtScoreResponse }) {
  if (!result) return null;

  const verdict = result.verdict || 'partial';
  const total = result.total?.score || 0;
  const gatedFail = result.total?.gated_fail || false;

  const verdictText = verdict === 'pass' 
    ? 'PASS' 
    : verdict === 'fail' 
    ? 'FAIL'
    : 'PARTIAL';

  const verdictColor = verdict === 'pass'
    ? 'text-green-600'
    : verdict === 'fail'
    ? 'text-red-600'
    : 'text-amber-600';

  const verdictBg = verdict === 'pass'
    ? 'bg-green-50'
    : verdict === 'fail'
    ? 'bg-red-50'
    : 'bg-amber-50';

  return (
    <div className="space-y-4">
      {/* Overall Score */}
      <div className={`${verdictBg} rounded-lg p-4 border-2 ${verdict === 'pass' ? 'border-green-200' : verdict === 'fail' ? 'border-red-200' : 'border-amber-200'}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-slate-600">Overall Score</div>
          <div className={`text-sm font-bold px-3 py-1 rounded-full ${verdictBg} ${verdictColor}`}>
            {verdictText}
          </div>
        </div>
        
        <div className="flex items-baseline gap-2">
          <div className={`text-4xl font-bold ${gatedFail ? 'text-slate-400' : verdictColor}`}>
            {gatedFail ? 'N/A' : total}
          </div>
          <div className="text-lg text-slate-500">/ 100</div>
        </div>
        
        {gatedFail && (
          <div className="text-xs text-slate-500 mt-2">
            Score gated by critical failure (check with max ≥15 failed)
          </div>
        )}
      </div>

      {/* Dimensions */}
      <div className="space-y-3">
        {result.dimensions && Object.entries(result.dimensions).map(([key, dim]: [string, any]) => (
          <DimensionCard key={key} dimension={dim} />
        ))}
      </div>

      {/* Suggestions */}
      {result.suggestions && result.suggestions.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">Suggestions</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            {result.suggestions.map((sug: string, i: number) => (
              <li key={i} className="leading-snug">
                • {sug}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Dimension Card Component
function DimensionCard({ dimension }: { dimension: any }) {
  const [expanded, setExpanded] = useState(true);
  const { label, score, checks } = dimension;

  const passCount = checks.filter((c: any) => c.status === 'PASS').length;
  const warnCount = checks.filter((c: any) => c.status === 'WARN').length;
  const failCount = checks.filter((c: any) => c.status === 'FAIL').length;

  const scoreColor =
    score >= 90 ? 'text-green-600' : score >= 70 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium text-slate-900">{label}</div>
          <div className="flex items-center gap-2 text-xs">
            {passCount > 0 && (
              <span className="text-green-600">✓ {passCount}</span>
            )}
            {warnCount > 0 && (
              <span className="text-amber-600">⚠ {warnCount}</span>
            )}
            {failCount > 0 && (
              <span className="text-red-600">✗ {failCount}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`text-lg font-bold ${scoreColor}`}>
            {score}<span className="text-sm text-slate-500">/100</span>
          </div>
          <svg
            className={`w-5 h-5 text-slate-400 transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-4 py-3 space-y-2 bg-white">
          {checks.map((check: any) => (
            <CheckItem key={check.id} check={check} />
          ))}
        </div>
      )}
    </div>
  );
}

// Check Item Component
function CheckItem({ check }: { check: any }) {
  const [showSuggestion, setShowSuggestion] = useState(false);
  const { label, points, max, status, notes, bonus, fixSuggestions } = check;

  const statusIcon =
    status === 'PASS' ? '✓' : status === 'WARN' ? '⚠' : status === 'FAIL' ? '✗' : '—';
  const statusColor =
    status === 'PASS'
      ? 'text-green-600'
      : status === 'WARN'
      ? 'text-amber-600'
      : status === 'FAIL'
      ? 'text-red-600'
      : 'text-slate-400';

  const hasSuggestions = fixSuggestions && fixSuggestions.length > 0;

  return (
    <>
      <div className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
        <div className={`${statusColor} font-bold mt-0.5`}>{statusIcon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-900">
            {label}
            {bonus && <span className="text-xs text-purple-600 ml-1">(bonus)</span>}
          </div>
          {notes && (
            <div className="text-xs text-slate-600 mt-1 leading-relaxed">{notes}</div>
          )}
          
        </div>
        <div className={`text-sm font-semibold ${statusColor} whitespace-nowrap`}>
          {points}/{max}
        </div>
      </div>

      
    </>
  );
}

// Suggestion Modal Component
function SuggestionModal({ check, onClose }: { check: any; onClose: () => void }) {
  const { label, fixSuggestions, status } = check;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`text-2xl ${status === 'FAIL' ? 'text-red-600' : 'text-amber-600'}`}>
              {status === 'FAIL' ? '✗' : '⚠'}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{label}</h3>
              <p className="text-sm text-slate-600">How to fix this issue</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {fixSuggestions && fixSuggestions.length > 0 ? (
            <div className="space-y-4">
              {fixSuggestions.map((suggestion: any, i: number) => (
                <div key={i} className="space-y-3">
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-sm text-red-900 font-medium">Issue:</p>
                    <p className="text-sm text-red-800 mt-1">{suggestion.issue}</p>
                  </div>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <p className="text-sm text-blue-900 font-medium">Fix:</p>
                    <p className="text-sm text-blue-800 mt-1">{suggestion.fix}</p>
                  </div>

                  {suggestion.example && (
                    <div className="bg-green-50 border border-green-200 rounded-md p-3">
                      <p className="text-sm text-green-900 font-medium mb-2">Example:</p>
                      {suggestion.example.before && (
                        <div className="mb-3">
                          <p className="text-xs text-slate-600 mb-1">❌ Current:</p>
                          <p className="text-sm text-slate-700 italic">{suggestion.example.before}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-slate-600 mb-1">✓ Improved:</p>
                        <p className="text-sm text-green-800 font-medium">{suggestion.example.after}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-slate-600">No specific fix suggestions available for this check.</p>
              <p className="text-xs text-slate-500 mt-2">Review the violation message above for guidance.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm font-medium"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}