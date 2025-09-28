'use client';
import React, { useState } from 'react';
import ScorePanel from '@/components/ScorePanel';

export default function ControlsPage() {
  const [id, setId] = useState('A.5.1');
  const [name, setName] = useState('Information Security Policy');
  const [desc, setDesc] = useState('An information security policy is documented, approved, communicated, and maintained to establish direction and support for information security.');
  const [guid, setGuid] = useState('Establish and maintain a formal information security policy to guide acceptable practices and ensure consistent governance.\n\nTo meet this control effectively, carry out the following steps:\n a) Document the policy and assign ownership.\n b) Obtain formal approval from executive management.\n c) Ensure the policy is disseminated to the relevant stakeholders.\n d) Review the policy at regular intervals and after significant changes.');
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  async function score() {
    setLoading(true);
    try {
      const res = await fetch('/api/controls/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, description: desc, guidance: guid })
      });
      const json = await res.json();
      setResult(json.results?.[0] || null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="card"><div className="card-body space-y-4">
        <h2 className="text-lg font-semibold">Control</h2>
        <div>
          <div className="label mb-1">Control ID</div>
          <input className="input" value={id} onChange={e=>setId(e.target.value)} />
        </div>
        <div>
          <div className="label mb-1">Control Name</div>
          <input className="input" value={name} onChange={e=>setName(e.target.value)} />
        </div>
        <div>
          <div className="label mb-1">Control Description</div>
          <textarea className="textarea h-28" value={desc} onChange={e=>setDesc(e.target.value)} />
        </div>
        <div>
          <div className="label mb-1">Control Guidance (preamble → steps)</div>
          <textarea className="textarea h-48" value={guid} onChange={e=>setGuid(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={score} disabled={loading}>{loading ? 'Scoring…' : 'Score Control'}</button>
        <p className="text-xs text-slate-500">Vendor-neutral, role-neutral, preamble first, then structured steps.</p>
      </div></div>

      <div className="card"><div className="card-body">
        <ScorePanel result={result} />
      </div></div>
    </div>
  );
}
