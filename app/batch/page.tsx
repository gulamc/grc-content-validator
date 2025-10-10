'use client';

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import BatchResultCard from '@/components/BatchResultCard';

type ItemET = {
  title?: string;
  what_to_collect: string;
  how_to_collect: string;
  bundle_justification?: string;
};

type ItemControl = {
  id: string;
  name: string;
  description: string;
  guidance: string;
  framework?: string;
};

type ParsedSheet = { type: 'ET' | 'CONTROL'; rows: any[] };

function inferType(headers: string[]): 'ET' | 'CONTROL' {
  const h = headers.map((x) => x.trim().toLowerCase());
  const isControl =
    h.includes('control id') &&
    h.includes('control name') &&
    h.includes('control description') &&
    h.includes('control guidance');
  return isControl ? 'CONTROL' : 'ET';
}

function normalizeRowET(row: any): ItemET | null {
  const keys = Object.keys(row);
  const find = (cands: string[]) => {
    for (const c of cands) {
      const k = keys.find((k) => k.trim().toLowerCase() === c);
      if (k) return row[k];
    }
    return '';
  };
  const title = find(['title']);
  const what = find(['what to collect', 'what', 'what_to_collect']);
  const how = find(['how to collect', 'how', 'how_to_collect']);
  if (!what || !how) return null;
  return {
    title: title ? String(title) : undefined,
    what_to_collect: String(what || ''),
    how_to_collect: String(how || ''),
  };
}

function normalizeRowControl(row: any): ItemControl | null {
  const keys = Object.keys(row);
  const get = (labels: string[]) => {
    for (const c of labels) {
      const k = keys.find((k) => k.trim().toLowerCase() === c);
      if (k) return row[k];
    }
    return '';
  };

  const id = get(['control id', 'id']);
  const name = get(['control name', 'name']);
  const description = get(['control description', 'description']);
  const guidance = get(['control guidance', 'guidance']);

  if (!id || !name || !description || !guidance) return null;

  return {
    id: String(id || ''),
    name: String(name || ''),
    description: String(description || ''),
    guidance: String(guidance || ''),
  };
}

export default function BatchPage() {
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [originalRows, setOriginalRows] = useState<any[]>([]);
  const [converted, setConverted] = useState<any[]>([]);
  const [scores, setScores] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandAll, setExpandAll] = useState<boolean>(true);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array((evt.target?.result as ArrayBuffer) || new ArrayBuffer(0));
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
        if (!rows.length) {
          setError('No rows found in the first sheet.');
          return;
        }
        const headers = Object.keys(rows[0] || {});
        const type = inferType(headers);
        setParsed({ type, rows });
        setOriginalRows(rows);

        if (type === 'CONTROL') {
          const items = rows.map(normalizeRowControl).filter(Boolean) as any[];
          setConverted(items);
        } else {
          const items = rows.map(normalizeRowET).filter(Boolean) as any[];
          setConverted(items);
        }
        setScores(null);
      } catch (e: any) {
        setError(e?.message || 'Failed to read file');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function runScore() {
    if (!converted.length || !parsed) return;
    setLoading(true);
    setScores(null);
    try {
      const endpoint = parsed.type === 'CONTROL' ? '/api/controls/score' : '/api/et/score';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: converted }),
      });
      const json = await res.json();
      setScores(json);
    } catch (e: any) {
      setError(e?.message || 'Scoring failed');
    } finally {
      setLoading(false);
    }
  }

  function downloadJSON(obj: any, filename: string) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="card-body space-y-4">
          <h2 className="text-lg font-semibold">Batch upload & conversion</h2>
          <div className="text-sm text-slate-600">
            Download sample templates:{' '}
            <a className="underline" href="/templates/controls_template.xlsx">
              Controls
            </a>{' '}
            •{' '}
            <a className="underline" href="/templates/ets_template.xlsx">
              ETs
            </a>
          </div>
          <p className="text-sm text-slate-600">
            Upload an Excel (.xlsx). We convert the first sheet into “Heretto-like” JSON and score each row.
            <br />Expected headers:
            <br />• <b>Controls</b>: Control ID, Control Name, Control Description, Control Guidance
            <br />• <b>ETs</b>: title, what to collect, how to collect
          </p>

          <input type="file" accept=".xlsx" className="block" onChange={onFile} />
          {error && <div className="text-sm text-red-700">{error}</div>}

          {parsed && (
            <div className="text-sm text-slate-700">
              Detected type: <b>{parsed.type}</b> • Rows parsed: <b>{parsed.rows.length}</b> • Converted:{' '}
              <b>{converted.length}</b>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" onClick={runScore} disabled={!converted.length || loading}>
              {loading ? 'Scoring…' : 'Convert & Score'}
            </button>
            <button
              className="btn"
              onClick={() =>
                downloadJSON(
                  converted,
                  parsed?.type === 'CONTROL' ? 'controls_converted.json' : 'ets_converted.json'
                )
              }
              disabled={!converted.length}
            >
              Download Converted JSON
            </button>
            <button
              className="btn"
              onClick={() => scores && downloadJSON(scores, 'scores.json')}
              disabled={!scores}
            >
              Download Scores JSON
            </button>
          </div>
        </div>
      </div>

      {/* Summary + expand/collapse */}
      {Array.isArray(scores?.results) && scores.results.filter(Boolean).length ? (
        <>
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-700">
              {(() => {
                const r = scores.results.filter(Boolean);
                const pass = r.filter((x: any) => x.verdict === 'pass').length;
                const partial = r.filter((x: any) => x.verdict === 'partial').length;
                const fail = r.filter((x: any) => x.verdict === 'fail').length;
                return `Summary — Pass: ${pass} • Partial: ${partial} • Fail: ${fail}`;
              })()}
            </div>
            <button className="btn" onClick={() => setExpandAll((v) => !v)}>
              {expandAll ? 'Collapse details' : 'Expand details'}
            </button>
          </div>

          <div className="space-y-4">
            {scores.results
              .map((res: any, idx: number) => ({ res, idx }))
              .filter((x) => !!x.res)
              .slice(0, 50)
              .map(({ res, idx }: any) => (
                <BatchResultCard
                  key={idx}
                  i={idx} // ✅ numeric index prop expected by the card
                  type={parsed?.type || 'ET'}
                  original={originalRows[idx] ?? {}}
                  converted={converted[idx] ?? {}}
                  result={res}
                  expand={expandAll}
                />
              ))}
          </div>
        </>
      ) : null}
    </div>
  );
}




