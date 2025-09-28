'use client';
import React from 'react';

function Badge({ verdict }: { verdict: string }) {
  const v = (verdict || '').toLowerCase();
  const cls = v === 'pass' ? 'badge badge-pass' : v === 'fail' ? 'badge badge-fail' : 'badge badge-partial';
  return <span className={cls}>{v.toUpperCase()}</span>;
}

function CodeBlock({ value }: { value: any }) {
  return (
    <pre className="text-xs bg-slate-50 p-3 rounded-xl border border-slate-200 overflow-auto">
      {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function BatchResultCard({
  index,
  type,
  original,
  converted,
  result
}: {
  index: number;
  type: 'CONTROL'|'ET';
  original: any;
  converted: any;
  result: any;
}) {
  return (
    <div className="card">
      <div className="card-body space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">
            <b>Item {index + 1}</b> • {type === 'CONTROL' ? 'Control' : 'Evidence Task'}
            {type === 'CONTROL' && converted?.id ? <> • ID: <b>{converted.id}</b></> : null}
            {type === 'ET' && converted?.title ? <> • Title: <b>{converted.title}</b></> : null}
          </div>)}
          <div className="flex items-center gap-3">
            <Badge verdict={result?.verdict || 'partial'} />
            <div className="text-sm text-slate-700">Score: <b>{result?.total ?? '-'}</b></div>
          </div>
        </div>

        {expand && (<div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-medium mb-2">Original (from Excel)</div>
            <CodeBlock value={original} />
          </div>
          <div>
            <div className="text-sm font-medium mb-2">Converted (Heretto-like JSON)</div>
            <CodeBlock value={converted} />
          </div>
        </div>

        {expand && (<div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-medium mb-2">Dimension breakdown</div>
            <div className="space-y-3">
              {result?.dimensions?.map((d: any, i: number) => (
                <div key={i} className="border rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">{d.key}</div>
                    <div className="text-sm text-slate-600">{d.score}</div>
                  </div>
                  <ul className="list-disc pl-4 space-y-1">
                    {d.details?.map((c: any, j: number) => (
                      <li key={j} className={c.level === 'fail' ? 'text-red-700' : c.level === 'warn' ? 'text-yellow-700' : 'text-slate-700'}>
                        <b>{c.level.toUpperCase()}</b>: {c.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium mb-2">Suggestions</div>
            {result?.suggestions?.length ? (
              <ul className="list-disc pl-4 space-y-1">
                {result.suggestions.map((s: any, i: number) => (
                  <li key={i} className="text-slate-700">{s.message}</li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-slate-500">No suggestions.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
