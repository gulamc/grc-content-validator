export default function Page() {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="card"><div className="card-body">
        <h2 className="text-lg font-semibold mb-2">Evidence Tasks</h2>
        <p className="text-sm text-slate-600 mb-4">Write an ET with a high-level outcome (What) and tangible methods (How). Score it live.</p>
        <a className="btn btn-primary" href="/ets">Open ET Scorer</a>
      </div></div>
      <div className="card"><div className="card-body">
        <h2 className="text-lg font-semibold mb-2">Controls</h2>
        <p className="text-sm text-slate-600 mb-4">Author a control with Description + Guidance (preamble → steps). Score it live.</p>
        <a className="btn btn-primary" href="/controls">Open Controls Scorer</a>
      </div></div>
    </div>
  );
}
