'use client';
import React, { useState } from 'react';
import ScorePanel from '@/components/ScorePanel';

export default function ETSPage() {
  const [what, setWhat] = useState('Provide evidence that network security has been configured for in-scope systems.');
  const [how, setHow] = useState('Maintain one or more of: a) Network diagram; b) Firewall configuration export or screenshot; c) Audit log entries from IDS/Firewall (last 30 days).');
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

async function score() {
  setLoading(true);
  try {
    const res = await fetch('/api/et/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ what_to_collect: what, how_to_collect: how }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ET API ${res.status}: ${text}`);
    }
    const json = await res.json();

    // NEW: your API returns the score object directly (not { results: [...] })
    setResult(json);   // <-- change this line
  } catch (e: any) {
    alert(e?.message || 'Scoring failed');
    setResult(null);
  } finally {
    setLoading(false);
  }
}



  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="card"><div className="card-body space-y-4">
        <h2 className="text-lg font-semibold">Evidence Task</h2>
        <div>
          <div className="label mb-1">What to collect (outcome)</div>
          <textarea className="textarea h-28" value={what} onChange={e=>setWhat(e.target.value)} />
        </div>
        <div>
          <div className="label mb-1">How to collect (tangible artifacts)</div>
          <textarea className="textarea h-40" value={how} onChange={e=>setHow(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={score} disabled={loading}>{loading ? 'Scoring…' : 'Score ET'}</button>
        <p className="text-xs text-slate-500">Tip: Using a fixed cadence (e.g., “12 months”) shows a soft warning unless you cite a clause (e.g., “per PCI DSS”).</p>
      </div></div>

      <div className="card"><div className="card-body">
        <ScorePanel result={result} />
      </div></div>
    </div>
  );
}
