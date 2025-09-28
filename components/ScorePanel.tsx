'use client';
import React from 'react';

export default function ScorePanel({ result }: { result: any | null }) {
  if (!result) return <div className="text-sm text-slate-500">Results will appear here.</div>;

  const verdict = result.verdict || 'partial';
  const badgeClass = verdict === 'pass' ? 'badge badge-pass' : verdict === 'fail' ? 'badge badge-fail' : 'badge badge-partial';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={badgeClass}>{verdict.toUpperCase()}</span>
        <span className="text-sm text-slate-600">Total Score: <b>{result.total}</b></span>
      </div>
      <div className="space-y-3">
        {result.dimensions?.map((d: any) => (
          <div key={d.key} className="border rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">{d.key}</div>
              <div className="text-sm text-slate-600">{d.score}</div>
            </div>
            <ul className="list-disc pl-4 space-y-1">
              {d.details?.map((c: any, idx: number) => (
                <li key={idx} className={c.level === 'fail' ? 'text-red-700' : c.level === 'warn' ? 'text-yellow-700' : 'text-slate-700'}>
                  <b>{c.level.toUpperCase()}</b>: {c.message}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {result.suggestions?.length ? (
        <div className="border rounded-xl p-3">
          <div className="text-sm font-medium mb-2">Suggestions</div>
          <ul className="list-disc pl-4 space-y-1">
            {result.suggestions.map((s: any, i: number) => (
              <li key={i} className="text-slate-700">{s.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
