// app/dashboard/page.tsx
'use client';

import { useState } from 'react';
import { CheckCircle2, FileText, Upload, BarChart3 } from 'lucide-react';

type ValidatorPage = 'analytics' | 'controls' | 'ets' | 'batch' | 'insights';

export default function DashboardPage() {
  const [activePage, setActivePage] = useState<ValidatorPage>('analytics');

  const grcItems = [
    { id: 'controls' as ValidatorPage, label: 'Controls Validator', icon: CheckCircle2, path: '/controls' },
    { id: 'ets' as ValidatorPage, label: 'Evidence Tasks Validator', icon: FileText, path: '/ets' },
    { id: 'batch' as ValidatorPage, label: 'Batch Validator', icon: Upload, path: '/batch' },
  ];

  const dataGuidanceItems = [
    { id: 'insights' as ValidatorPage, label: 'Insights Validator', icon: BarChart3, path: '/insights' },
  ];

  const analyticsItem = { id: 'analytics' as ValidatorPage, path: '/analytics' };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Fixed Left Navigation */}
      <div className="w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white flex flex-col">
        {/* Header */}
        <button
          onClick={() => setActivePage('analytics')}
          className="p-6 border-b border-slate-700 hover:bg-slate-700 transition-colors cursor-pointer text-left w-full"
        >
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-6 h-6 text-emerald-400" />
            <h1 className="text-xl font-bold">Regulatory Intelligence</h1>
          </div>
          <p className="text-sm text-slate-400">Content Validators</p>
        </button>

        {/* Navigation Items */}
        <nav className="flex-1 p-4">
          <div className="space-y-6">
            {/* GRC Content Section */}
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-3">
                GRC Content
              </div>
              <div className="space-y-2">
                {grcItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActivePage(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        activePage === item.id
                          ? 'bg-emerald-500 text-white shadow-lg'
                          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* DataGuidance Content Section */}
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-3">
                DataGuidance Content
              </div>
              <div className="space-y-2">
                {dataGuidanceItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActivePage(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        activePage === item.id
                          ? 'bg-emerald-500 text-white shadow-lg'
                          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700">
          <p className="text-xs text-slate-500">Version 2.0.0</p>
          <p className="text-xs text-slate-500">© 2025 Regulatory Intelligence</p>
        </div>
      </div>

      {/* Main Content Area - iframe */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <iframe
          key={activePage}
          src={
            activePage === 'analytics' 
              ? analyticsItem.path 
              : [...grcItems, ...dataGuidanceItems].find(item => item.id === activePage)?.path
          }
          className="w-full h-full border-0"
          title={`${activePage} view`}
        />
      </div>
    </div>
  );
}