import { useState } from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';

interface CheckResult {
  id: string;
  label: string;
  points: number;
  max: number;
  status: 'PASS' | 'WARN' | 'FAIL' | 'N/A';
  notes?: string;
  violations?: string[];
}

interface Dimension {
  key: string;
  label: string;
  score: number;
  max: number;
  weight: number;
  checks: CheckResult[];
}

interface ScoreResult {
  verdict: 'pass' | 'partial' | 'fail';
  total: {
    score: number;
    max: number;
    formula: string;
    gated_fail?: boolean;
  };
  dimensions: {
    id_quality: Dimension;
    name_quality: Dimension;
    description_quality: Dimension;
    guidance_quality: Dimension;
  };
  suggestions: string[];
}

export default function ControlScorePanel({ result }: { result: ScoreResult }) {
  const [expandedDim, setExpandedDim] = useState<string | null>(null);

  const getVerdictColor = (verdict: string) => {
    if (verdict === 'pass') return 'bg-green-100 text-green-800 border-green-200';
    if (verdict === 'partial') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  const getVerdictIcon = (verdict: string) => {
    if (verdict === 'pass') return <CheckCircle2 className="w-5 h-5" />;
    if (verdict === 'partial') return <AlertTriangle className="w-5 h-5" />;
    return <AlertCircle className="w-5 h-5" />;
  };

  const getStatusColor = (status: string) => {
    if (status === 'PASS') return 'text-green-600';
    if (status === 'WARN') return 'text-yellow-600';
    if (status === 'FAIL') return 'text-red-600';
    return 'text-gray-400';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'PASS') return <CheckCircle2 className="w-4 h-4" />;
    if (status === 'WARN') return <AlertTriangle className="w-4 h-4" />;
    if (status === 'FAIL') return <AlertCircle className="w-4 h-4" />;
    return <Info className="w-4 h-4" />;
  };

  const dimensions = [
    result.dimensions.id_quality,
    result.dimensions.name_quality,
    result.dimensions.description_quality,
    result.dimensions.guidance_quality
  ];

  return (
    <div className="space-y-6">
      {/* Verdict Badge */}
      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 font-semibold ${getVerdictColor(result.verdict)}`}>
        {getVerdictIcon(result.verdict)}
        <span className="uppercase tracking-wide">{result.verdict}</span>
      </div>

      {/* Total Score */}
      <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200">
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-4xl font-bold text-slate-900">
            {result.total.gated_fail ? 'N/A' : result.total.score}
          </span>
          <span className="text-lg text-slate-500">/ {result.total.max}</span>
        </div>
        {result.total.gated_fail && (
          <p className="text-sm text-red-600 mb-2">
            Score gated by critical failure (check with max ≥15 failed)
          </p>
        )}
        <p className="text-xs text-slate-500 font-mono">{result.total.formula}</p>
      </div>

      {/* Dimensions */}
      <div className="space-y-3">
        {dimensions.map((dim) => {
          const isExpanded = expandedDim === dim.key;
          const passCount = dim.checks.filter(c => c.status === 'PASS').length;
          const warnCount = dim.checks.filter(c => c.status === 'WARN').length;
          const failCount = dim.checks.filter(c => c.status === 'FAIL').length;

          return (
            <div key={dim.key} className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
              <button
                onClick={() => setExpandedDim(isExpanded ? null : dim.key)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="text-left">
                    <h3 className="font-semibold text-slate-900">{dim.label}</h3>
                    <p className="text-xs text-slate-500">Weight: {Math.round(dim.weight * 100)}%</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3 text-sm">
                    {passCount > 0 && (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="w-4 h-4" />
                        {passCount}
                      </span>
                    )}
                    {warnCount > 0 && (
                      <span className="flex items-center gap-1 text-yellow-600">
                        <AlertTriangle className="w-4 h-4" />
                        {warnCount}
                      </span>
                    )}
                    {failCount > 0 && (
                      <span className="flex items-center gap-1 text-red-600">
                        <AlertCircle className="w-4 h-4" />
                        {failCount}
                      </span>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-bold text-slate-900">{dim.score}</div>
                    <div className="text-xs text-slate-500">/ {dim.max}</div>
                  </div>

                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-200 bg-slate-50">
                  <div className="p-6 space-y-4">
                    {dim.checks.map((check) => (
                      <div key={check.id} className="bg-white rounded-lg p-4 border border-slate-200">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-start gap-2 flex-1">
                            <div className={getStatusColor(check.status)}>
                              {getStatusIcon(check.status)}
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium text-slate-900 text-sm">{check.label}</h4>
                              {check.notes && (
                                <p className="text-sm text-slate-600 mt-1">{check.notes}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right ml-4">
                            <div className={`text-sm font-semibold ${getStatusColor(check.status)}`}>
                              {check.points} / {check.max}
                            </div>
                          </div>
                        </div>

                        {check.violations && check.violations.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <ul className="space-y-1 text-sm text-slate-700">
                              {check.violations.map((violation, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <span className="text-slate-400 mt-0.5">•</span>
                                  <span>{violation}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Suggestions */}
      {result.suggestions.length > 0 && (
        <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <Info className="w-5 h-5" />
            Suggestions for Improvement
          </h3>
          <ul className="space-y-2">
            {result.suggestions.map((suggestion, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-blue-800">
                <span className="text-blue-400 mt-0.5">→</span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}