// components/EtScorePanel.tsx - SAFE VERSION with proper error handling

'use client';

import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, ChevronDown, Info } from 'lucide-react';

interface Check {
  id: string;
  label: string;
  points: number;
  max: number;
  status: 'PASS' | 'WARN' | 'FAIL';
  notes?: string;
  violations?: string[];
}

interface Dimension {
  key: string;
  label: string;
  score: number;
  max: number;
  weight: number;
  checks: Check[];
}

interface ScoreResult {
  version?: string;
  verdict: 'pass' | 'partial' | 'fail';
  total: {
    score: number;
    max: number;
    gated_fail?: boolean;
  };
  dimensions?: {
    what_quality?: Dimension;
    how_quality?: Dimension;
    cohesion?: Dimension;
    clarity?: Dimension;
    what?: Dimension;
    how?: Dimension;
  };
  suggestions?: string[];
}

interface EtScorePanelProps {
  scoreResult: ScoreResult;
  showTitle?: boolean;
}

export function EtScorePanel({ scoreResult, showTitle = true }: EtScorePanelProps) {
  const [expandedDimensions, setExpandedDimensions] = useState<Record<string, boolean>>({});

  // SAFE: Check if dimensions exist
  if (!scoreResult.dimensions) {
    return (
      <div className="bg-red-50 border-l-4 border-red-400 p-4">
        <p className="text-red-800 font-semibold">Error: No dimensions in score result</p>
        <pre className="text-xs mt-2 text-red-700">
          {JSON.stringify(scoreResult, null, 2)}
        </pre>
      </div>
    );
  }

  const dimensions = {
    what_quality: scoreResult.dimensions.what_quality || scoreResult.dimensions.what,
    how_quality: scoreResult.dimensions.how_quality || scoreResult.dimensions.how,
    cohesion: scoreResult.dimensions.cohesion,
    clarity: scoreResult.dimensions.clarity,
  };

  // Filter out undefined dimensions
  const validDimensions = Object.entries(dimensions).filter(([_, dim]) => dim !== undefined);

  if (validDimensions.length === 0) {
    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
        <p className="text-yellow-800 font-semibold">Warning: No valid dimensions found</p>
        <p className="text-sm text-yellow-700 mt-2">
          Available dimension keys: {Object.keys(scoreResult.dimensions).join(', ')}
        </p>
      </div>
    );
  }

  const getAllViolations = (): string[] => {
    const violations: string[] = [];
    validDimensions.forEach(([_, dim]) => {
      if (!dim) return;
      dim.checks.forEach(check => {
        if (check.status === 'FAIL' && check.violations) {
          check.violations.forEach(v => {
            if (!violations.includes(v)) {
              violations.push(v);
            }
          });
        }
      });
    });
    return violations;
  };

  const toggleDimension = (dimId: string) => {
    setExpandedDimensions(prev => ({
      ...prev,
      [dimId]: !prev[dimId]
    }));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASS': return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'WARN': return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case 'FAIL': return <AlertCircle className="w-5 h-5 text-red-600" />;
      default: return null;
    }
  };

  const getVerdictBadge = (verdict: string) => {
    if (verdict === 'pass') {
      return (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg w-fit">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span className="text-sm font-semibold text-green-600">PASS</span>
        </div>
      );
    }
    if (verdict === 'fail') {
      return (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg w-fit">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-sm font-semibold text-red-600">FAIL</span>
        </div>
      );
    }
    return (
      <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg w-fit">
        <AlertTriangle className="w-5 h-5 text-yellow-600" />
        <span className="text-sm font-semibold text-yellow-600">PARTIAL</span>
      </div>
    );
  };

  const getDisplaySuggestions = (suggestions?: string[]): string[] => {
    if (!suggestions) return [];
    return suggestions.filter(s => 
      !s.startsWith('[HEADER]') && 
      !s.startsWith('[SPACER]') &&
      s.trim().length > 0
    );
  };

  const displaySuggestions = getDisplaySuggestions(scoreResult.suggestions);
  const allViolations = getAllViolations();

  const shouldShowNA = scoreResult.verdict === 'fail';

  return (
    <div className="space-y-4">
      {/* Overall Score */}
      <div className="bg-white rounded-xl border-2 border-slate-200 p-6">
        {getVerdictBadge(scoreResult.verdict)}
        {showTitle && <h2 className="text-xl font-semibold text-slate-900 mb-4">Overall Score</h2>}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-600">Total Score</div>
            <div className="text-sm text-slate-500 mt-1">
              Verdict: <span className="font-semibold uppercase">{scoreResult.verdict}</span>
            </div>
          </div>
          <div className="text-right">
            {shouldShowNA ? (
              <>
                <div className="text-4xl font-bold text-slate-400">N/A</div>
                <div className="text-sm text-slate-600">Critical issues detected</div>
              </>
            ) : (
              <>
                <div className="text-4xl font-bold text-purple-600">{scoreResult.total.score}</div>
                <div className="text-sm text-slate-600">/ {scoreResult.total.max}</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Dimensions */}
      {validDimensions.map(([key, dim]) => {
        if (!dim) return null;
        return (
          <div key={key} className="bg-white rounded-xl border-2 border-slate-200">
            <button
              onClick={() => toggleDimension(key)}
              className="w-full p-6 flex items-center justify-between text-left hover:bg-slate-50 transition-colors rounded-xl"
            >
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900">{dim.label}</h3>
                <p className="text-sm text-slate-600">Weight: {(dim.weight * 100).toFixed(0)}%</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  {dim.checks.filter(c => c.status === 'PASS').length > 0 && (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="w-4 h-4" />
                      {dim.checks.filter(c => c.status === 'PASS').length}
                    </span>
                  )}
                  {dim.checks.filter(c => c.status === 'WARN').length > 0 && (
                    <span className="flex items-center gap-1 text-yellow-600">
                      <AlertTriangle className="w-4 h-4" />
                      {dim.checks.filter(c => c.status === 'WARN').length}
                    </span>
                  )}
                  {dim.checks.filter(c => c.status === 'FAIL').length > 0 && (
                    <span className="flex items-center gap-1 text-red-600">
                      <AlertCircle className="w-4 h-4" />
                      {dim.checks.filter(c => c.status === 'FAIL').length}
                    </span>
                  )}
                </div>
                <div className="text-2xl font-bold text-purple-600">{dim.score}</div>
                <div className="text-sm text-slate-600">/ {dim.max}</div>
                <ChevronDown 
                  className={`w-5 h-5 text-slate-400 transition-transform ${expandedDimensions[key] ? 'rotate-180' : ''}`}
                />
              </div>
            </button>

            {expandedDimensions[key] && (
              <div className="px-6 pb-6 space-y-3 border-t border-slate-200">
                {dim.checks.map((check) => (
                  <div 
                    key={check.id} 
                    className={`flex items-start gap-3 p-3 rounded-lg ${
                      check.status === 'FAIL' && check.max >= 15 
                        ? 'bg-red-50 border-2 border-red-300' 
                        : 'bg-slate-50'
                    }`}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {getStatusIcon(check.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-semibold text-slate-900">
                          {check.label}
                          {check.status === 'FAIL' && check.max >= 15 && (
                            <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
                              🚨 GATES VERDICT
                            </span>
                          )}
                        </h4>
                        <span className="text-sm font-semibold text-slate-600 ml-4">
                          {check.points} / {check.max}
                        </span>
                      </div>
                      {check.notes && (
                        <p className="text-sm text-slate-600 mb-2">{check.notes}</p>
                      )}
                      {check.violations && check.violations.length > 0 && (
                        <ul className="text-sm text-slate-600 space-y-1">
                          {check.violations.map((violation, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-slate-400 flex-shrink-0">•</span>
                              <span>{violation}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Suggestions or Violations */}
      {(displaySuggestions.length > 0 || allViolations.length > 0) && (
        <div className="bg-blue-50 rounded-xl border-2 border-blue-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Info className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-slate-900">
              {displaySuggestions.length > 0 ? 'Suggestions' : 'Issues Found'}
            </h3>
          </div>
          {displaySuggestions.length > 0 ? (
            <ul className="space-y-2">
              {displaySuggestions.map((suggestion, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="text-blue-600 flex-shrink-0">•</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          ) : allViolations.length > 0 ? (
            <>
              <p className="text-sm text-slate-600 mb-3">
                The following issues were detected. Expand dimensions above for detailed recommendations.
              </p>
              <ul className="space-y-2">
                {allViolations.map((violation, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="text-blue-600 flex-shrink-0">•</span>
                    <span>{violation}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}