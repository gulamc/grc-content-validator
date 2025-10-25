'use client';
import React, { useState } from 'react';

/** ================= Modal (inline, no extra file) ================= */
const Modal = ({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-[101] w-full max-w-2xl rounded-2xl bg-white shadow-xl border border-gray-200">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button className="text-sm text-gray-500 hover:text-gray-900" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};

/** ================= Types ================= */
type CheckStatus = 'PASS' | 'WARN' | 'FAIL' | 'N/A';

type Check = {
  status: CheckStatus;
  label: string;
  points?: number;
  max?: number;
  bonus?: boolean;
  notes?: string;
  violations?: string[];
};

type Dim = {
  key?: string;
  label: string;
  score: number;
  max: number;
  weight?: number;
  checks: Check[];
};

type Normalized = {
  verdict: 'pass' | 'partial' | 'fail';
  totalScore: number;
  formula?: string;
  weights?: Record<string, number>;
  dims: Dim[];
  suggestions: string[];
};

/** ================= Helpers ================= */
function statusClasses(s: CheckStatus) {
  if (s === 'PASS') return 'bg-green-100 text-green-700 ring-1 ring-green-200';
  if (s === 'WARN') return 'bg-amber-100 text-amber-700 ring-1 ring-amber-200';
  if (s === 'FAIL') return 'bg-rose-100 text-rose-700 ring-1 ring-rose-200';
  return 'bg-gray-100 text-gray-600 ring-1 ring-gray-200';
}

function titleForKey(k?: string, fallback?: string) {
  const map: Record<string, string> = {
    what: 'What to Collect',
    how: 'How to Collect (artifacts)',
    cohesion: 'Cohesion',
    clarity: 'Clarity & Readability',
  };
  return (k && map[k]) || fallback || k || 'Dimension';
}

/** Accepts new transparent schema or legacy shape */
function normalizeResult(input: any): Normalized {
  // New schema
  const isNew =
    input &&
    input.total &&
    typeof input.total.score === 'number' &&
    input.dimensions &&
    input.dimensions.what &&
    Array.isArray(input.dimensions.what.checks);

  if (isNew) {
    const dims = [input.dimensions.what, input.dimensions.how, input.dimensions.cohesion, input.dimensions.clarity];
    return {
      verdict: input.verdict || (input.total.score >= 90 ? 'pass' : input.total.score < 60 ? 'fail' : 'partial'),
      totalScore: input.total.score,
      formula: input.total.formula,
      weights: input.total.weights,
      dims: dims.map((d: any) => ({
        key: d.key,
        label: d.label || titleForKey(d.key),
        score: d.score,
        max: d.max ?? 100,
        weight: d.weight,
        checks: d.checks as Check[],
      })),
      suggestions: Array.isArray(input.suggestions) ? input.suggestions : [],
    };
  }

  // Legacy schema
  const dims = (input.dimensions || []).map((d: any) => ({
    key: d.key,
    label: titleForKey(d.key, d.key),
    score: d.score,
    max: 100,
    checks: (d.details || []).map((c: any) => ({
      status: (String(c.level || 'N/A').toUpperCase() as CheckStatus) || 'N/A',
      label: c.message,
    })),
  }));

  return {
    verdict: input.verdict || (input.total >= 90 ? 'pass' : input.total < 60 ? 'fail' : 'partial'),
    totalScore: input.total ?? 0,
    dims,
    suggestions: (input.suggestions || []).map((s: any) => s.message),
  };
}

/** ================= Component ================= */
export default function ScorePanel({ result }: { result: any | null }) {
  const [openDim, setOpenDim] = useState<Dim | null>(null);

  if (!result) return <div className="text-sm text-slate-500">Results will appear here.</div>;

  const data = normalizeResult(result);

  const verdictClass =
    data.verdict === 'pass'
      ? 'bg-green-100 text-green-700 ring-1 ring-green-200'
      : data.verdict === 'fail'
      ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-200'
      : 'bg-amber-100 text-amber-700 ring-1 ring-amber-200';

  return (
    <div className="space-y-4">
      {/* Header row (compact) */}
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${verdictClass}`}>
          {String(data.verdict).toUpperCase()}
        </span>
      <span className="text-sm text-slate-600">
        Total Score: <b>{data.verdict === 'fail' ? 'N/A' : data.totalScore}</b>
        {data.verdict === 'fail' ? (
          <span className="ml-1 text-xs text-slate-500">(gated)</span>
        ) : null}
      </span>

      {data.verdict === 'fail' ? (
        <div className="text-[11px] text-rose-700">
          Gated by:{' '}
          {data.dims
            .flatMap((d: any) =>
              (d.checks || [])
                .filter((c: any) => c.status === 'FAIL' && (c.max ?? 0) >= 15)
                .map((c: any) => `${d.label} → ${c.label}`)
            )
            .join('; ')}
        </div>
      ) : null}


    </div>

      {/* Weights & formula in tiny mono */}
      {(data.formula || data.weights) && (
        <div className="text-[11px] text-slate-500 font-mono space-y-0.5">
          {data.formula && <div>{data.formula}</div>}
          {data.weights && (
            <div>
              {Object.entries(data.weights)
                .map(([k, v]) => `${k}=${Math.round((v as number) * 100)}%`)
                .join('  ')}
            </div>
          )}
        </div>
      )}

      {/* Compact dimension list: only PASS/WARN/FAIL counts + Details */}
      <div className="space-y-3">
        {data.dims.map((d, idx) => {
          const counts = d.checks.reduce(
            (acc: Record<CheckStatus, number>, c) => {
              acc[c.status] = (acc[c.status] || 0) + 1;
              return acc;
            },
            { PASS: 0, WARN: 0, FAIL: 0, 'N/A': 0 } as Record<CheckStatus, number>
          );

          return (
            <div key={idx} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">{d.label}</div>
                <div className="flex items-center gap-2">
                  {(['PASS', 'WARN', 'FAIL'] as CheckStatus[]).map((s) => (
                    <span key={s} className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${statusClasses(s)}`}>
                      {s}: {counts[s] || 0}
                    </span>
                  ))}
                  <button className="text-xs text-blue-600 hover:underline" onClick={() => setOpenDim(d)}>
                    View details
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Suggestions */}
      {data.suggestions?.length ? (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
          <div className="text-sm font-semibold text-gray-900 mb-2">Suggestions</div>
          <ul className="list-disc pl-5 space-y-1">
            {data.suggestions.map((s: string, i: number) => (
              <li key={i} className="text-sm text-slate-700">
                {s}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result?.proposed ? (
        <div className="border rounded-xl p-3 mt-3 bg-slate-50">
          <div className="text-sm font-medium mb-2">Suggested wording (beta)</div>
          <div className="text-xs text-slate-700 mb-1"><b>What to Collect:</b> {result.proposed.what}</div>
          <div className="text-xs text-slate-700"><b>How to Collect:</b> {result.proposed.how}</div>
        </div>
      ) : null}


      {/* Details modal */}
      <Modal open={!!openDim} title={openDim?.label || 'Details'} onClose={() => setOpenDim(null)}>
        {openDim && (
          <div className="space-y-3">
            {openDim.checks.map((c, i) => (
              <div key={i} className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-900">{c.label}</div>
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${statusClasses(c.status)}`}>{c.status}</span>
                </div>
                {'points' in c && typeof c.points === 'number' && typeof c.max === 'number' && (
                  <div className="mt-1 text-xs text-gray-600">
                    Score: {c.points} / {c.max}
                    {c.bonus ? ' (bonus)' : ''}
                  </div>
                )}
                {c.notes && <div className="mt-2 text-sm text-gray-700">{c.notes}</div>}
               <ul className="list-disc pl-4 space-y-1">
                {(c.violations || [])
                  .filter((v: string) => v && v.trim() && v.trim() !== (c.notes || '').trim())
                  .map((v: string, i: number) => (
                    <li key={i} className="text-slate-700">{v}</li>
                  ))}
              </ul>

                ) : null}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
