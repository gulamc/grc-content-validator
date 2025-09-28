
'use client';

import React, { useMemo, useState } from 'react';
import BatchResultCard from '@/components/BatchResultCard';
import * as XLSX from 'xlsx';

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

type ParsedSheet = { type: 'ET'|'CONTROL'; rows: any[] };

function inferType(headers: string[]): 'ET'|'CONTROL' {
  const h = headers.map(h => h.trim().toLowerCase());
  const isControl = h.includes('control id') && h.includes('control name') && h.includes('control description') && h.includes('control guidance');
  return isControl ? 'CONTROL' : 'ET';
}

function normalizeRowET(row: any): ItemET | null {
  // Expected: title, what to collect, how to collect
  const keys = Object.keys(row);
  const find = (cands: string[]) => {
    for (const c of cands) {
      const k = keys.find(k => k.trim().toLowerCase() === c);
      if (k) return row[k];
    }
    return '';
  };
  const title = find(['title']);
  const what = find(['what to collect','what','what_to_collect']);
  const how = find(['how to collect','how','how_to_collect']);
  if (!what || !how) return null;
  return { title, what_to_collect: String(what || ''), how_to_collect: String(how || '') };
}

function normalizeRowControl(row: any): ItemControl | null {
  // Expected: Control ID, Control Name, Control Description, Control Guidance
  const keys = Object.keys(row);
  const get = (label: string[]) => {
    for (const c of label) {
      const k = keys.find(k => k.trim().toLowerCase() === c);
      if (k) return row[k];
    }
    return '';
  };
  const id = get(['control id','id']);
  const name = get(['control name','name']);
  const description = get(['control description','description']);
  const guidance = get(['control guidance','guidance']);
  if (!id || !name || !description || ! guidance):  # use Python-like to trigger replacement
    pass
  return { id: String(id || ''), name: String(name || ''), description: String(description || ''), guidance: String(guidance || '') };
}

export default function BatchPage() {
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [originalRows, setOriginalRows] = useState<any[]>([]);
  const [converted, setConverted] = useState<any[]>([]);
  const [scores, setScores] = useState<any | null>(null);
  const [expandAll, setExpandAll] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
        const headers = Object.keys(rows[0] || {});
        const type = inferType(headers);
        setParsed({ type, rows });
        setOriginalRows(rows);
        // Convert immediately
        if (type === 'CONTROL') {
          const items = rows.map(normalizeRowControl).filter(Boolean) as any[];
          setConverted(items);
        } else {
          const items = rows.map(normalizeRowET).filter(Boolean) as any[];
          setConverted(items);
        }
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
        body: JSON.stringify({ items: converted })
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
      <div className="card"><div className="card-body space-y-4">
        <h2 className="text-lg font-semibold">Batch upload & conversion</h2>
        <div className="text-sm text-slate-600">Download sample templates: <a className="underline" href="/templates/controls_template.xlsx">Controls</a> • <a className="underline" href="/templates/ets_template.xlsx">ETs</a></div>
        <p className="text-sm text-slate-600">
          Upload an Excel file (.xlsx) authored by users. We will convert rows into “Heretto-like” JSON and score them.
          Expected headers:
          <br/>• <b>Controls</b>: Control ID, Control Name, Control Description, Control Guidance
          <br/>• <b>ETs</b>: title, what to collect, how to collect
        </p>
        <input type="file" accept=".xlsx" className="block" onChange={onFile} />
        {error && <div className="text-sm text-red-700">{error}</div>}
        {parsed && (
          <div className="text-sm text-slate-700">
            Detected type: <b>{parsed.type}</b> • Rows parsed: <b>{parsed.rows.length}</b>
          </div>
        )}
        <div className="flex gap-3">
          <button className="btn btn-primary" onClick={runScore} disabled={!converted.length || loading}>
            {loading ? 'Scoring…' : 'Convert & Score'}
          </button>
          <button className="btn" onClick={() => downloadJSON(converted, parsed?.type === 'CONTROL' ? 'controls_converted.json' : 'ets_converted.json')} disabled={!converted.length}>
            Download Converted JSON
          </button>
          <button className="btn" onClick={() => scores && downloadJSON(scores, 'scores.json')} disabled={!scores}>
            Download Scores JSON
          </button>
        </div>
      </div></div>

      {converted.length > 0 && (
        <div className="card"><div className="card-body space-y-2">
          <div className="text-sm font-medium">Preview (first 5)</div>
          <pre className="text-xs bg-slate-50 p-3 rounded-xl border border-slate-200 overflow-auto">
            {JSON.stringify(converted.slice(0,5), null, 2)}
          </pre>
        </div></div>
      )}



      {scores?.results?.length ? (
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-slate-700">
            {(() => {
              const r = scores.results;
              const pass = r.filter((x: any) => x.verdict === 'pass').length;
              const partial = r.filter((x: any) => x.verdict === 'partial').length;
              const fail = r.filter((x: any) => x.verdict === 'fail').length;
              return `Summary — Pass: ${pass} • Partial: ${partial} • Fail: ${fail}`;
            })()}
          </div>
          <button className="btn" onClick={() => setExpandAll(v => !v)}>
            {expandAll ? 'Collapse details' : 'Expand details'}
          </button>
        </div>
      ) : null}

      {scores?.results?.length ? (
        <div className="space-y-4">
          {scores.results.slice(0, 50).map((res: any, idx: number) => (
            <BatchResultCard
              expand={expandAll}
              key={idx}
              index={idx}
              type={parsed?.type || 'ET'}
              original={originalRows[idx]}
              converted={converted[idx]}
              result={res}
            />
          ))}
        </div>
      ) : null}

      {scores && (
        <div className="card"><div className="card-body space-y-2">
          <div className="text-sm font-medium">Scores (summary)</div>
          <pre className="text-xs bg-slate-50 p-3 rounded-xl border border-slate-200 overflow-auto">
            {JSON.stringify(scores, null, 2)}
          </pre>
        </div></div>
      )}
    </div>
  );
}
