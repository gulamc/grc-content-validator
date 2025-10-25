export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-slate-200/50" style={{maskImage: 'linear-gradient(0deg,white,rgba(255,255,255,0.6))'}} />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 text-blue-700 text-sm font-medium mb-6">
              <span className="text-lg">🛡️</span>
              <span>Automated Content Quality Assurance</span>
            </div>
            
            <h1 className="text-5xl font-bold text-slate-900 mb-6">
              GRC Content Validator
            </h1>
            
            <p className="text-xl text-slate-600 max-w-3xl mx-auto mb-8">
              Ensure compliance content meets organizational standards with automated scoring, 
              real-time feedback, and actionable recommendations for Controls and Evidence Tasks.
            </p>
            
            <div className="flex items-center justify-center gap-4 mb-12">
              <div className="flex items-center gap-2 text-slate-700">
                <span className="text-green-600 text-lg">✓</span>
                <span className="text-sm font-medium">Real-time Validation</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <span className="text-green-600 text-lg">✓</span>
                <span className="text-sm font-medium">Framework-Agnostic</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <span className="text-green-600 text-lg">✓</span>
                <span className="text-sm font-medium">Actionable Feedback</span>
              </div>
            </div>
          </div>
          
          {/* Stats */}
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-slate-200">
              <div className="text-3xl font-bold text-blue-600 mb-2">15+</div>
              <div className="text-sm text-slate-600">Validation Dimensions</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-slate-200">
              <div className="text-3xl font-bold text-blue-600 mb-2">50+</div>
              <div className="text-sm text-slate-600">Quality Checks</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-slate-200">
              <div className="text-3xl font-bold text-blue-600 mb-2">Real-time</div>
              <div className="text-sm text-slate-600">Feedback & Scoring</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Quick Access Cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {/* Evidence Tasks Card */}
          <div className="group bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">📋</span>
                </div>
                <h2 className="text-2xl font-bold text-white">Evidence Tasks</h2>
              </div>
              <p className="text-blue-50">
                Validate What to Collect and How to Collect statements against organizational standards
              </p>
            </div>
            
            <div className="p-6">
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-2">
                  <span className="text-green-600 text-lg mt-0.5">✓</span>
                  <span className="text-sm text-slate-700">Single-focus outcome validation</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 text-lg mt-0.5">✓</span>
                  <span className="text-sm text-slate-700">Artifact tangibility & context checks</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 text-lg mt-0.5">✓</span>
                  <span className="text-sm text-slate-700">Technology & framework-agnostic scoring</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 text-lg mt-0.5">✓</span>
                  <span className="text-sm text-slate-700">Cohesion & clarity assessment</span>
                </div>
              </div>
              
              <a 
                href="/ets" 
                className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-center py-3 px-4 rounded-xl font-semibold transition-colors duration-200"
              >
                Score Evidence Tasks →
              </a>
            </div>
          </div>

          {/* Controls Card */}
          <div className="group bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">🛡️</span>
                </div>
                <h2 className="text-2xl font-bold text-white">Controls</h2>
              </div>
              <p className="text-purple-50">
                Validate Control ID, Name, Description, and Guidance against content standards
              </p>
            </div>
            
            <div className="p-6">
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-2">
                  <span className="text-green-600 text-lg mt-0.5">✓</span>
                  <span className="text-sm text-slate-700">Structured ID format validation</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 text-lg mt-0.5">✓</span>
                  <span className="text-sm text-slate-700">Present tense & voice checking</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 text-lg mt-0.5">✓</span>
                  <span className="text-sm text-slate-700">Preamble & structured steps review</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 text-lg mt-0.5">✓</span>
                  <span className="text-sm text-slate-700">Role-neutral & vendor-free guidance</span>
                </div>
              </div>
              
              <a 
                href="/controls" 
                className="block w-full bg-purple-600 hover:bg-purple-700 text-white text-center py-3 px-4 rounded-xl font-semibold transition-colors duration-200"
              >
                Score Controls →
              </a>
            </div>
          </div>
        </div>

        {/* Bulk Upload Section */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-2xl p-8 md:p-12 text-white">
          <div className="flex items-start gap-6">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center flex-shrink-0">
              <span className="text-3xl">📤</span>
            </div>
            
            <div className="flex-1">
              <h2 className="text-3xl font-bold mb-4">Bulk Processing</h2>
              <p className="text-slate-300 mb-6 max-w-2xl">
                Upload Excel files containing multiple Controls or Evidence Tasks for batch validation. 
                Review results in an interactive dashboard with filtering and export capabilities.
              </p>
              
              <div className="flex items-center gap-4">
                <button 
                  disabled
                  className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-white py-3 px-6 rounded-xl font-semibold transition-colors duration-200 flex items-center gap-2"
                >
                  <span>📤</span>
                  Upload Controls (Coming Soon)
                </button>
                <button 
                  disabled
                  className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-white py-3 px-6 rounded-xl font-semibold transition-colors duration-200 flex items-center gap-2"
                >
                  <span>📤</span>
                  Upload ETs (Coming Soon)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-16 grid md:grid-cols-3 gap-8">
          <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">⚡</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Instant Feedback</h3>
            <p className="text-sm text-slate-600">
              Get immediate scoring results with transparent breakdowns across multiple quality dimensions
            </p>
          </div>
          
          <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">✓</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Standards-Based</h3>
            <p className="text-sm text-slate-600">
              All validations align with your GRC Content Clarity & Consistency Standard requirements
            </p>
          </div>
          
          <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-4">
              <span className="text-2xl">💡</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Actionable Insights</h3>
            <p className="text-sm text-slate-600">
              Receive specific suggestions for improvement with clear explanations of violations
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}