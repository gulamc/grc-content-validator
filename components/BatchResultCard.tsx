import React from 'react';

type Props = {
  i: number; // index of the row
  type: 'CONTROL' | 'ET';
  original: any;
  converted: any;
  result: any;
  expand: boolean;
};

function Badge({ verdict }: { verdict: string }) {
  const v = (verdict || '').toLowerCase();
  const cls =
    v === 'pass'
      ? 'badge badge-pass'
      : v === 'fail'
      ? 'badge badge-fail'
      : 'badge badge-partial';
  return <span className={cls}>{v.toUpperCase()}</span>;
}

function CodeBlock({ value }: { value: any }) {
  return (
    <pre className="text-xs bg-slate-50 p-3 rounded-xl border border-slate-200 overflow-auto">
      {typeof value === 'string'
        ? value
        : JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function BatchResultCard({
  i,
  type,
  original,
  converted,
  result,
  expand,
}: Props) {
  const safe = result ?? {};
  const verdict = (safe.verdict || 'partial') as string;
  const total =
    typeof safe.total === 'number' ? safe.total : '-';

  return (
    <div className="card">
      <div className="card-body space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">
            <b>Item {i + 1}</b> •{' '}
            {type === 'CONTROL' ? 'Control' : 'Evidence Task'}{' '}
            {type === 'CONTROL' && converted?.id ? (
              <>• ID: <b>{converted.id}</b></>
            ) : null}
            {type === 'ET' && converted?.title ? (
              <>• Title: <b>{converted.title}</b></>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <Badge verdict={verdict} />
            <div className="text-sm text-slate-700">
              Score: <b>{total}</b>
            </div>
          </div>
        </div>

        {expand && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold mb-1">
                Original
              </div>
              <CodeBlock value={original} />
            </div>
            <div>
              <div className="text-xs font-semibold mb-1">
                Converted
              </div>
              <CodeBlock value={converted} />
            </div>
          </div>
        )}

        {expand && (
          <div>
            <div className="text-xs font-semibold mb-1">
              Scoring Breakdown
            </div>
            <CodeBlock value={result} />
          </div>
        )}
      </div>
    </div>
  );
}

