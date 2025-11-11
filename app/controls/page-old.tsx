'use client';

import { useState } from 'react';
import { Shield, Loader2, AlertCircle, CheckCircle2, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';

// Types
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

// ControlScorePanel Component
function ControlScorePanel({ result }: { result: ScoreResult }) {
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
        <h3 className="font-semibold text-blue-900 mb-4 flex items-center gap-2">
          <Info className="w-5 h-5" />
          Suggestions
        </h3>
        
        <div className="space-y-6">
          {result.dimensions.id_quality.checks.some(c => c.violations) && (
            <div>
              <h4 className="text-sm font-semibold text-blue-900 mb-2">ID Format</h4>
              <ul className="space-y-2">
                {result.dimensions.id_quality.checks
                  .filter(c => c.violations)
                  .flatMap(c => c.violations!)
                  .map((s, i) => (
                    <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
                      <span className="text-blue-400 mt-0.5">•</span>
                      <span>{s}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          
          {result.dimensions.name_quality.checks.some(c => c.violations) && (
            <div>
              <h4 className="text-sm font-semibold text-blue-900 mb-2">Name Quality</h4>
              <ul className="space-y-2">
                {result.dimensions.name_quality.checks
                  .filter(c => c.violations)
                  .flatMap(c => c.violations!)
                  .map((s, i) => (
                    <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
                      <span className="text-blue-400 mt-0.5">•</span>
                      <span>{s}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          
          {result.dimensions.description_quality.checks.some(c => c.violations) && (
            <div>
              <h4 className="text-sm font-semibold text-blue-900 mb-2">Description (Outcome)</h4>
              <ul className="space-y-2">
                {result.dimensions.description_quality.checks
                  .filter(c => c.violations)
                  .flatMap(c => c.violations!)
                  .map((s, i) => (
                    <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
                      <span className="text-blue-400 mt-0.5">•</span>
                      <span>{s}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          
          {result.dimensions.guidance_quality.checks.some(c => c.violations) && (
            <div>
              <h4 className="text-sm font-semibold text-blue-900 mb-2">Guidance (Implementation)</h4>
              <ul className="space-y-2">
                {result.dimensions.guidance_quality.checks
                  .filter(c => c.violations)
                  .flatMap(c => c.violations!)
                  .map((s, i) => (
                    <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
                      <span className="text-blue-400 mt-0.5">•</span>
                      <span>{s}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    )}
    </div>
  );
}

// Main Component
export default function ControlValidator() {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [guidance, setGuidance] = useState('');
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<any>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  const handleScore = async () => {
    if (!id.trim() && !name.trim() && !description.trim() && !guidance.trim()) {
      setError('Please fill in at least one field');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setAiSuggestions(null);

    try {
      const response = await fetch('/api/controls/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, description, guidance })
      });

      if (!response.ok) {
        throw new Error('Scoring failed');
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to score control');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setId('');
    setName('');
    setDescription('');
    setGuidance('');
    setResult(null);
    setError('');
    setAiSuggestions(null);
  };

  const enhanceWithAI = async () => {
    if (!result) return;
    
    setLoadingAI(true);
    setAiSuggestions(null);
    
    try {
      const response = await fetch('/api/enhance-control-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name,
          description,
          guidance,
          violations: result.suggestions || []
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setAiSuggestions(data.enhanced);
      } else {
        alert('AI enhancement failed: ' + data.error);
      }
    } catch (error) {
      console.error('AI error:', error);
      alert('AI enhancement failed. Check console.');
    } finally {
      setLoadingAI(false);
    }
  };

  const loadExample = () => {
    setId('GDPR.1.1');
    setName('Data Protection Officer Designation');
    setDescription('A Data Protection Officer (DPO) is designated and contact details are maintained and communicated to relevant stakeholders and supervisory authorities.');
    setGuidance(`Organizations should designate a Data Protection Officer to ensure compliance with data protection regulations and serve as a point of contact for data subjects and supervisory authorities.

1. Identify and appoint a qualified individual as the Data Protection Officer
2. Document the DPO's roles, responsibilities, and authority
3. Maintain current contact information for the DPO
4. Communicate DPO contact details internally to all staff
5. Publish DPO contact information externally where required
6. Report the DPO's contact details to the relevant supervisory authority`);
};

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Control Validator</h1>
              <p className="text-slate-600">Validate Control ID, Name, Description, and Guidance</p>
            </div>
          </div>
          <button
            onClick={loadExample}
            className="text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            Load Example Control →
          </button>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Control Details</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Control ID
                    <span className="text-slate-400 font-normal ml-2">(e.g., GDPR.1.1)</span>
                  </label>
                  <input
                    type="text"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    placeholder="GDPR.1.1"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Control Name
                    <span className="text-slate-400 font-normal ml-2">(concise, action-oriented)</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Data Protection Officer Designation"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Description
                    <span className="text-slate-400 font-normal ml-2">(present tense, passive voice, 25-120 words)</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder="A Data Protection Officer (DPO) is designated and contact details are maintained..."
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  />
                  <div className="text-xs text-slate-500 mt-1">
                    {description.trim().split(/\s+/).filter(Boolean).length} words
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Guidance
                    <span className="text-slate-400 font-normal ml-2">(preamble + 2-8 structured steps)</span>
                  </label>
                  <textarea
                    value={guidance}
                    onChange={(e) => setGuidance(e.target.value)}
                    rows={8}
                    placeholder="Organizations should designate a DPO to ensure compliance...&#10;&#10;1. Identify and appoint a qualified individual&#10;2. Document roles and responsibilities&#10;..."
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                  />
                </div>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleScore}
                  disabled={loading}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-400 text-white py-3 px-6 rounded-xl font-semibold transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Scoring...
                    </>
                  ) : (
                    'Score Control'
                  )}
                </button>
                <button
                  onClick={handleClear}
                  disabled={loading}
                  className="px-6 py-3 border-2 border-slate-300 hover:border-slate-400 text-slate-700 rounded-xl font-semibold transition-colors duration-200"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* Results Section */}
          <div className="space-y-6">
            {result ? (
              <>
                <ControlScorePanel result={result} />
                
                {/* AI Enhancement Section */}
                {result && (
                  <div className="mt-6">
                    <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-4 border border-purple-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                          <span className="text-2xl">✨</span>
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900">AI-Enhanced Suggestions</h3>
                          <p className="text-sm text-slate-600">Get intelligent improvements powered by Claude</p>
                        </div>
                      </div>
                      <button 
                        onClick={enhanceWithAI}
                        disabled={loadingAI}
                        className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                      >
                        {loadingAI ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <span>🤖</span>
                            Get AI Suggestions
                          </>
                        )}
                      </button>
                    </div>
                    
                    {aiSuggestions && (
                      <div className="mt-4 p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                          <h3 className="text-lg font-semibold text-slate-900">Improved Content</h3>
                        </div>
                        
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-medium text-slate-900 mb-2">📝 Description:</h4>
                            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                              <p className="text-sm text-slate-800">{aiSuggestions.description.improved}</p>
                            </div>
                          </div>
                          
                          {aiSuggestions.guidance?.improved && (
                            <div>
                              <h4 className="font-medium text-slate-900 mb-2">📚 Guidance:</h4>
                              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                                <p className="text-sm text-slate-800 whitespace-pre-line">{aiSuggestions.guidance.improved}</p>
                              </div>
                            </div>
                          )}
                          
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(aiSuggestions.description.improved);
                              alert('Copied!');
                            }}
                            className="px-4 py-2 bg-slate-600 text-white text-sm rounded-lg hover:bg-slate-700"
                          >
                            📋 Copy Improved Content
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                </div>
              </>
            ) : (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Ready to Score</h3>
                <p className="text-slate-600">
                  Fill in the control details and click "Score Control" to see validation results
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}