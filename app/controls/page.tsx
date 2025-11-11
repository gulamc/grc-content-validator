'use client';

import { useState } from 'react';
import { Shield, Info, CheckCircle2, Loader2, AlertCircle, AlertTriangle, ChevronDown } from 'lucide-react';
import { AIEnhancedSuggestionsControl } from '@/components/AIEnhancedSuggestionsControl';

interface ScoringCheckResult {
  id: string;
  label: string;
  points: number;
  max: number;
  status: 'PASS' | 'WARN' | 'FAIL';
  notes?: string;
  violations?: string[];
}

interface DimensionScore {
  dimension_id: string;
  label: string;
  score: number;
  max: number;
  weight: number;
  weighted_contribution: number;
  checks: ScoringCheckResult[];
}

interface ScoringResult {
  overall_score: number;
  overall_max: number;
  letter_grade: string;
  dimensions: {
    id_quality: DimensionScore;
    name_quality: DimensionScore;
    description_quality: DimensionScore;
    guidance_quality: DimensionScore;
  };
  suggestions: string[];
}

export default function ControlsPage() {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [guidance, setGuidance] = useState('');
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedDimensions, setExpandedDimensions] = useState<Record<string, boolean>>({});

  const handleScore = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/controls/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, description, guidance })
      });

      if (response.ok) {
        const data = await response.json();
        setResult(data);
      } else {
        alert('Scoring failed');
      }
    } catch (error) {
      console.error('Scoring error:', error);
      alert('Scoring failed. Check console.');
    } finally {
      setLoading(false);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PASS': return 'text-green-600';
      case 'WARN': return 'text-yellow-600';
      case 'FAIL': return 'text-red-600';
      default: return 'text-gray-600';
    }
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Form */}
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">Control Details</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Control ID <span className="text-slate-500">(e.g., GDPR.1.1)</span>
                </label>
                <input
                  type="text"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="TEST-001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Control Name <span className="text-slate-500">(concise, action-oriented)</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Data Encryption"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Description <span className="text-slate-500">(present tense, passive voice, 15-45 words)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Data is encrypted..."
                />
                <p className="text-xs text-slate-500 mt-1">{description.split(/\s+/).filter(Boolean).length} words</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Guidance <span className="text-slate-500">(preamble + 2-8 structured steps)</span>
                </label>
                <textarea
                  value={guidance}
                  onChange={(e) => setGuidance(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Organizations should..."
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleScore}
                  disabled={loading || !id || !name || !description}
                  className="flex-1 px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all shadow-md"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                      Scoring...
                    </>
                  ) : (
                    'Score Control'
                  )}
                </button>
                <button
                  onClick={() => {
                    setId('');
                    setName('');
                    setDescription('');
                    setGuidance('');
                    setResult(null);
                  }}
                  className="px-6 py-3 bg-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-300"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* Results */}
          <div>
            {result ? (
              <div className="space-y-4">
                {/* Overall Score */}
                <div className="bg-white rounded-xl border-2 border-slate-200 p-6">
                  {/* PASS Badge for scores >= 85 */}
                  {result.overall_score >= 85 && result.letter_grade !== 'F' && (
                    <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg w-fit">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <span className="text-sm font-semibold text-green-600">PASS</span>
                    </div>
                  )}
                  {/* FAIL Badge */}
                  {result.letter_grade === 'F' && (
                    <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg w-fit">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                      <span className="text-sm font-semibold text-red-600">FAIL</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-slate-900">Overall Score</h2>
                    <div className="text-right">
                      <div className="text-4xl font-bold text-purple-600">
                        {result.letter_grade === 'F' ? 'N/A' : result.overall_score}
                      </div>
                      <div className="text-sm text-slate-600">/ {result.overall_max}</div>
                    </div>
                  </div>
                  {result.letter_grade === 'F' && (
                    <p className="mt-3 text-sm text-slate-600">
                      Score gated by critical failure (check with max ≥15 failed)
                    </p>
                  )}
                </div>

                {/* Dimensions - Collapsible */}
                {Object.values(result.dimensions).map((dim) => (
                  <div key={dim.dimension_id} className="bg-white rounded-xl border-2 border-slate-200">
                    <button
                      onClick={() => toggleDimension(dim.dimension_id)}
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
                        <div className="text-right">
                          <div className="text-2xl font-bold text-purple-600">{dim.score}</div>
                          <div className="text-sm text-slate-600">/ {dim.max}</div>
                        </div>
                        <ChevronDown 
                          className={`w-5 h-5 text-slate-400 transition-transform ${expandedDimensions[dim.dimension_id] ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </button>

                    {expandedDimensions[dim.dimension_id] && (
                      <div className="px-6 pb-6 space-y-3 border-t border-slate-200">
                        {dim.checks.map((check) => (
                          <div key={check.id} className="border-l-4 pl-4 py-2" style={{
                            borderColor: check.status === 'PASS' ? '#22c55e' : check.status === 'WARN' ? '#eab308' : '#ef4444'
                          }}>
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-2 flex-1">
                                {getStatusIcon(check.status)}
                                <div className="flex-1">
                                  <div className="font-medium text-slate-900">{check.label}</div>
                                  {check.notes && (
                                    <div className="text-sm text-slate-600 mt-1">{check.notes}</div>
                                  )}
                                  {check.violations && check.violations.length > 0 && (
                                    <ul className="mt-2 space-y-1">
                                      {check.violations.map((v, i) => (
                                        <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                                          <span className="text-slate-400 mt-0.5">•</span>
                                          <span>{v}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </div>
                              <div className={`text-sm font-semibold ${getStatusColor(check.status)}`}>
                                {check.points} / {check.max}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

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

                {/* AI Enhancement Component */}
                <AIEnhancedSuggestionsControl
                  id={id}
                  name={name}
                  description={description}
                  guidance={guidance}
                  scoreResult={result}
                  enabled={true}
                />
              </div>
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