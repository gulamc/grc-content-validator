'use client';

import { useState, useRef } from 'react';
import {
  FileText, Upload, Loader2, Download, CheckCircle2,
  AlertTriangle, Lightbulb, AlertCircle, ChevronDown, MapPin,
} from 'lucide-react';
import { JURISDICTION_GROUPS } from '@/app/gn-validator/utils/jurisdictions';
import { compareQuestionNumbers } from '@/app/gn-validator/utils/question-sort';

type GNType = 'overview' | 'breach' | 'pia' | 'employment' | 'marketing';

const GN_TYPE_LABELS: Record<GNType, string> = {
  overview:   'Privacy Overview',
  breach:     'Data Breach',
  pia:        'Privacy Impact Assessment',
  employment: 'Employment',
  marketing:  'Direct Marketing',
};

interface Finding {
  ruleId: string;
  questionNumber: string;
  field: string;
  fixType: 'auto' | 'flag' | 'ai-suggestion';
  severity: string;
  message: string;
  suggestedFix?: string;
}

interface Summary {
  fileName: string;
  gnType: string;
  jurisdiction: string;
  questionCount: number;
  totalFindings: number;
  autoFixed: number;
  flags: number;
  aiSuggestions: number;
}

interface ValidationResult {
  summary: Summary;
  findings: Finding[];
  docxBase64: string;
  parseWarning?: string;
}

// 'detecting'  — file selected, detection API call in flight
// 'detected'   — detection complete; show inferred jurisdiction or dropdown
type PageState = 'idle' | 'detecting' | 'detected' | 'validating' | 'results';

function downloadDocx(base64: string, fileName: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.replace(/\.docx$/, '') + ' - GN Validator Output.docx';
  a.click();
  URL.revokeObjectURL(url);
}

export default function GNValidatorPage() {
  const [gnType, setGnType] = useState<GNType | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [pageState, setPageState] = useState<PageState>('idle');
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    auto: false,
    flag: true,
    'ai-suggestion': true,
  });

  // Jurisdiction inference state
  const [inferredJurisdiction, setInferredJurisdiction] = useState<string | null>(null);
  const [inferredConfidence, setInferredConfidence] = useState<'high' | 'medium' | 'low'>('low');
  const [inferredSource, setInferredSource] = useState<'filename' | 'content' | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [manualJurisdiction, setManualJurisdiction] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // High-confidence auto-detected jurisdiction; otherwise the user must pick from dropdown.
  const effectiveJurisdiction =
    manualJurisdiction ||
    (inferredConfidence === 'high' && !showOverride ? inferredJurisdiction ?? '' : '');

  // pageState check kept out of canValidate to avoid TypeScript narrowing issues in the button
  const canValidate = !!gnType && !!effectiveJurisdiction;

  const handleFileChange = async (selectedFile: File) => {
    setFile(selectedFile);
    setManualJurisdiction('');
    setShowOverride(false);
    setInferredJurisdiction(null);
    setInferredConfidence('low');
    setInferredSource(null);
    setPageState('detecting');

    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      const res = await fetch('/api/gn-validator/detect-jurisdiction', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success && data.jurisdiction) {
        setInferredJurisdiction(data.jurisdiction);
        setInferredConfidence(data.confidence as 'high' | 'medium' | 'low');
        setInferredSource((data.source ?? null) as 'filename' | 'content' | null);
      }
    } catch {
      // Detection failure: leave confidence 'low', user picks from dropdown
    }
    setPageState('detected');
  };

  const handleValidate = async () => {
    if (!canValidate) return;
    setPageState('validating');
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file!);
    formData.append('gnType', gnType);
    formData.append('jurisdiction', effectiveJurisdiction);

    try {
      const res = await fetch('/api/gn-validator/validate', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? 'Validation failed.');
        setPageState('detected');
        return;
      }
      setResult(data);
      setPageState('results');
    } catch {
      setError('Network error — could not reach the server.');
      setPageState('detected');
    }
  };

  const handleReset = () => {
    setPageState('idle');
    setResult(null);
    setError('');
    setFile(null);
    setInferredJurisdiction(null);
    setInferredConfidence('low');
    setInferredSource(null);
    setShowOverride(false);
    setManualJurisdiction('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleGroup = (key: string) =>
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));

  const findingsByType = (type: string) =>
    result?.findings.filter(f => f.fixType === type) ?? [];

  const fieldLabel = (f: string) =>
    f === 'response' ? 'Response' : f === 'citation' ? 'Citation' : f === 'persona' ? 'Persona' : f;

  // Which jurisdiction string to show in the validating/results panels
  const displayJurisdiction = effectiveJurisdiction || inferredJurisdiction || '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">GN Validator</h1>
              <p className="text-slate-600">Guidance Note quality validation — 42 rules across structure, style, and citations</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* ── Left: Upload form ──────────────────────────────────────────── */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-6">Upload GN Document</h2>

              <div className="space-y-5">
                {/* GN Type */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    GN Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={gnType}
                    onChange={e => setGnType(e.target.value as GNType | '')}
                    disabled={pageState === 'validating'}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    <option value="">Select GN type…</option>
                    {(Object.entries(GN_TYPE_LABELS) as [GNType, string][]).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>

                {/* File upload */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    GN Document (.docx) <span className="text-red-500">*</span>
                  </label>
                  <div
                    onClick={() => pageState !== 'validating' && fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                      file
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
                    } ${pageState === 'validating' ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    {file ? (
                      <>
                        <FileText className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                        <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                        <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(0)} KB — click to change</p>
                      </>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                        <p className="text-sm text-slate-600">Click to select a .docx file</p>
                        <p className="text-xs text-slate-400 mt-1">Max 10 MB</p>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFileChange(f); }}
                  />
                </div>

                {/* Jurisdiction — inferred or manual */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Jurisdiction <span className="text-red-500">*</span>
                  </label>

                  {pageState === 'idle' && (
                    <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-400">
                      Upload a document above to detect jurisdiction.
                    </div>
                  )}

                  {pageState === 'detecting' && !showOverride && (
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        Detecting jurisdiction…
                      </div>
                      <button
                        onClick={() => setShowOverride(true)}
                        className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
                      >
                        select manually
                      </button>
                    </div>
                  )}

                  {(pageState === 'detected' || pageState === 'validating' || pageState === 'results' || (pageState === 'detecting' && showOverride)) && (
                    <>
                      {inferredConfidence === 'high' && !showOverride ? (
                        // High confidence — show detected badge with source label and override link
                        <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                          <div className="flex items-center gap-2 min-w-0">
                            <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-medium text-emerald-800 truncate">{inferredJurisdiction}</span>
                              {inferredSource && (
                                <span className="text-xs text-emerald-600">
                                  Detected from {inferredSource === 'filename' ? 'filename' : 'document content'}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => setShowOverride(true)}
                            disabled={pageState === 'validating'}
                            className="text-xs text-emerald-600 hover:text-emerald-800 underline underline-offset-2 disabled:opacity-50 shrink-0 ml-2"
                          >
                            override
                          </button>
                        </div>
                      ) : (
                        // Medium/low confidence or override active — show full dropdown
                        <>
                          {inferredJurisdiction && inferredConfidence !== 'high' && (
                            <p className="text-xs text-slate-400 mb-1.5">
                              Could not detect jurisdiction automatically — please select.
                            </p>
                          )}
                          <select
                            value={manualJurisdiction}
                            onChange={e => setManualJurisdiction(e.target.value)}
                            disabled={pageState === 'validating'}
                            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500"
                          >
                            <option value="">Select jurisdiction…</option>
                            {JURISDICTION_GROUPS.map(group => (
                              <optgroup key={group.label} label={group.label}>
                                {group.jurisdictions.map(j => (
                                  <option key={j} value={j}>{j}</option>
                                ))}
                              </optgroup>
                            ))}
                            <option value="Other">Other</option>
                          </select>
                          {showOverride && (
                            <button
                              onClick={() => { setShowOverride(false); setManualJurisdiction(''); }}
                              className="mt-1 text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
                            >
                              cancel — use detected value
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    {error}
                  </div>
                )}

                {/* Buttons */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleValidate}
                    disabled={!canValidate || pageState !== 'detected'}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors shadow"
                  >
                    {pageState === 'validating' ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Validating…
                      </>
                    ) : (
                      'Validate'
                    )}
                  </button>
                  {pageState === 'results' && (
                    <button
                      onClick={handleReset}
                      className="px-5 py-3 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition-colors"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Right: Results / empty state ──────────────────────────────── */}
          <div className="lg:col-span-3 space-y-4">

            {/* Empty / loading */}
            {(pageState === 'idle' || pageState === 'detecting' || pageState === 'detected') && !result && (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Ready to Validate</h3>
                <p className="text-slate-500 text-sm max-w-sm mx-auto">
                  Select a GN type, upload your .docx file — jurisdiction is detected automatically.
                  The annotated output is available for download once validation completes.
                </p>
              </div>
            )}

            {pageState === 'validating' && (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Validating…</h3>
                <p className="text-slate-500 text-sm">
                  Running {gnType && GN_TYPE_LABELS[gnType as GNType]} rules for {displayJurisdiction}.
                  This usually takes 5–15 seconds.
                </p>
              </div>
            )}

            {pageState === 'results' && result && (
              <>
                {/* Low-confidence parse warning (Direct Marketing) */}
                {result.parseWarning && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl shadow-sm p-4 flex items-start gap-3 mb-6">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-900">{result.parseWarning}</div>
                  </div>
                )}

                {/* Summary card */}
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                  {/* min-w-0 on left div allows it to shrink so the Download button never overflows */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-slate-900">
                        {result.summary.jurisdiction} — {GN_TYPE_LABELS[result.summary.gnType as GNType] ?? result.summary.gnType}
                      </h2>
                      <p className="text-sm text-slate-500 mt-0.5 truncate">{result.summary.fileName}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{result.summary.questionCount} questions parsed</p>
                    </div>
                    <button
                      onClick={() => downloadDocx(result.docxBase64, result.summary.fileName)}
                      className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow shrink-0"
                    >
                      <Download className="w-4 h-4" />
                      Download Annotated .docx
                    </button>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-4 mt-6">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-center">
                      <div className="text-2xl font-bold text-emerald-700">{result.summary.autoFixed}</div>
                      <div className="text-xs text-emerald-600 font-medium mt-0.5">Auto-fixed</div>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-center">
                      <div className="text-2xl font-bold text-amber-700">{result.summary.flags}</div>
                      <div className="text-xs text-amber-600 font-medium mt-0.5">Flagged for Review</div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-center">
                      <div className="text-2xl font-bold text-blue-700">{result.summary.aiSuggestions}</div>
                      <div className="text-xs text-blue-600 font-medium mt-0.5">AI Suggestions</div>
                    </div>
                  </div>
                </div>

                {/* Findings — auto-fix */}
                {findingsByType('auto').length > 0 && (
                  <FindingsGroup
                    label="Auto-fixed"
                    count={findingsByType('auto').length}
                    icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    color="emerald"
                    expanded={expandedGroups.auto}
                    onToggle={() => toggleGroup('auto')}
                    findings={findingsByType('auto')}
                    fieldLabel={fieldLabel}
                  />
                )}

                {/* Findings — flag */}
                {findingsByType('flag').length > 0 && (
                  <FindingsGroup
                    label="Flagged for Review"
                    count={findingsByType('flag').length}
                    icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}
                    color="amber"
                    expanded={expandedGroups.flag}
                    onToggle={() => toggleGroup('flag')}
                    findings={findingsByType('flag')}
                    fieldLabel={fieldLabel}
                  />
                )}

                {/* Findings — ai-suggestion */}
                {findingsByType('ai-suggestion').length > 0 && (
                  <FindingsGroup
                    label="AI Suggestions"
                    count={findingsByType('ai-suggestion').length}
                    icon={<Lightbulb className="w-4 h-4 text-blue-600" />}
                    color="blue"
                    expanded={expandedGroups['ai-suggestion']}
                    onToggle={() => toggleGroup('ai-suggestion')}
                    findings={findingsByType('ai-suggestion')}
                    fieldLabel={fieldLabel}
                  />
                )}

                {result.summary.totalFindings === 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                    <p className="font-semibold text-emerald-800">No issues found</p>
                    <p className="text-sm text-emerald-600 mt-1">This GN passed all active validation rules.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface FindingsGroupProps {
  label: string;
  count: number;
  icon: React.ReactNode;
  color: 'emerald' | 'amber' | 'blue';
  expanded: boolean;
  onToggle: () => void;
  findings: Finding[];
  fieldLabel: (f: string) => string;
}

const COLOR_MAP = {
  emerald: {
    header: 'bg-emerald-50 border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-700',
    rule: 'text-emerald-700 bg-emerald-50',
  },
  amber: {
    header: 'bg-amber-50 border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
    rule: 'text-amber-700 bg-amber-50',
  },
  blue: {
    header: 'bg-blue-50 border-blue-200',
    badge: 'bg-blue-100 text-blue-700',
    rule: 'text-blue-700 bg-blue-50',
  },
};

function FindingsGroup({
  label, count, icon, color, expanded, onToggle, findings, fieldLabel,
}: FindingsGroupProps) {
  const c = COLOR_MAP[color];
  return (
    <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-6 py-4 border-b ${c.header} text-left hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold text-slate-900">{label}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.badge}`}>{count}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="divide-y divide-slate-100">
          {[...findings].sort((a, b) => compareQuestionNumbers(a.questionNumber, b.questionNumber)).map((f, i) => (
            <div key={i} className="px-6 py-3 flex items-start gap-3">
              <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${c.rule}`}>
                {f.ruleId}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-800">Q{f.questionNumber}</span>
                  <span className="text-xs text-slate-400">{fieldLabel(f.field)}</span>
                </div>
                <p className="text-sm text-slate-600 mt-0.5">{f.message}</p>
                {f.suggestedFix && (
                  <p className="text-xs text-slate-500 mt-1 italic">Suggestion: {f.suggestedFix}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
