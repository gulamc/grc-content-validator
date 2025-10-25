// app/landing/page.tsx
'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function LandingPage() {
  const [expandedSection, setExpandedSection] = useState('grc');

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar - OneTrust Dark Theme */}
      <aside className="w-64 bg-slate-800 text-white flex flex-col">
        {/* Navigation */}
        <nav className="flex-1 px-2 py-6 space-y-2">
          {/* Regulatory Intelligence Section */}
          <div className="mb-6">
            <div className="px-4 py-3 text-xs uppercase text-gray-400 font-semibold tracking-wider">
              Regulatory Intelligence
            </div>
            
            {/* GRC Content Validator */}
            <div className="py-1">
              <button
                onClick={() => setExpandedSection(expandedSection === 'grc' ? '' : 'grc')}
                className="w-full flex items-center px-3 py-2 text-sm text-white hover:bg-slate-700 rounded"
              >
                <span className="flex-1 text-left font-medium">GRC Content Validator</span>
                <span className="text-xs">{expandedSection === 'grc' ? '▼' : '▶'}</span>
              </button>
              {expandedSection === 'grc' && (
                <div className="ml-4 mt-1 space-y-1">
                  <Link href="/controls">
                    <div className="px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-slate-700 rounded cursor-pointer">
                      Control Validator
                    </div>
                  </Link>
                  <Link href="/ets">
                    <div className="px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-slate-700 rounded cursor-pointer">
                      ET Validator
                    </div>
                  </Link>
                  <Link href="/batch">
                    <div className="px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-slate-700 rounded cursor-pointer">
                      Batch Validator
                    </div>
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Privacy Content - Coming Soon */}
          <div className="mb-6">
            <div className="px-4 py-3 text-xs uppercase text-gray-400 font-semibold tracking-wider flex items-center justify-between">
              <span>Privacy Content</span>
              <span className="text-xs normal-case bg-slate-700 px-2 py-0.5 rounded text-gray-300">
                Coming Soon
              </span>
            </div>
          </div>

          {/* DataGuidance - Coming Soon */}
          <div className="mb-6">
            <div className="px-4 py-3 text-xs uppercase text-gray-400 font-semibold tracking-wider flex items-center justify-between">
              <span>DataGuidance</span>
              <span className="text-xs normal-case bg-slate-700 px-2 py-0.5 rounded text-gray-300">
                Coming Soon
              </span>
            </div>
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">GRC Content Validator</h1>
            <p className="text-gray-600 mt-2">
              Validate and score your GRC content against industry standards
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <StatCard 
              title="Total Validations" 
              value="1,247" 
              change="+12.3%" 
              positive 
            />
            <StatCard 
              title="Pass Rate" 
              value="94.2%" 
              change="+3.1%" 
              positive 
            />
            <StatCard 
              title="Avg Score" 
              value="87.5" 
              change="+1.8%" 
              positive 
            />
            <StatCard 
              title="Critical Failures" 
              value="23" 
              change="-5.2%" 
              positive 
            />
          </div>

          {/* Validation Tools */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Validation Tools</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <ToolCard
                icon="📝"
                title="Control Validator"
                description="Validate individual controls for outcome-based, neutral design"
                link="/controls"
                color="blue"
              />
              <ToolCard
                icon="📋"
                title="Evidence Task Validator"
                description="Validate evidence tasks for clarity and specificity"
                link="/ets"
                color="green"
              />
              <ToolCard
                icon="📦"
                title="Batch Validator"
                description="Process multiple items at once for efficient validation"
                link="/batch"
                color="purple"
              />
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Recent Validations</h2>
              <Link href="/batch" className="text-green-600 hover:text-green-700 text-sm font-semibold">
                View All →
              </Link>
            </div>
            <div className="space-y-3">
              <ActivityItem
                title="User Access Review"
                type="Control"
                score={94}
                time="2 minutes ago"
                status="pass"
              />
              <ActivityItem
                title="Provide evidence of access reviews"
                type="Evidence Task"
                score={87}
                time="5 minutes ago"
                status="pass"
              />
              <ActivityItem
                title="Batch validation - 20 items"
                type="Batch"
                score={91}
                time="15 minutes ago"
                status="pass"
              />
              <ActivityItem
                title="MFA Implementation"
                type="Control"
                score={62}
                time="1 hour ago"
                status="fail"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, change, positive }: any) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="text-sm text-gray-600 mb-2">{title}</div>
      <div className="flex items-end justify-between">
        <div className="text-3xl font-bold text-gray-900">{value}</div>
        <div className={`text-sm font-semibold ${positive ? 'text-green-600' : 'text-red-600'}`}>
          {change}
        </div>
      </div>
    </div>
  );
}

function ToolCard({ icon, title, description, link, color }: any) {
  const colorClasses = {
    blue: 'border-blue-200 bg-blue-50 hover:border-blue-300',
    green: 'border-green-200 bg-green-50 hover:border-green-300',
    purple: 'border-purple-200 bg-purple-50 hover:border-purple-300',
  };

  return (
    <Link href={link}>
      <div className={`p-6 rounded-lg border-2 transition-all cursor-pointer ${colorClasses[color as keyof typeof colorClasses]}`}>
        <div className="text-4xl mb-3">{icon}</div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600">{description}</p>
        <div className="mt-4 text-sm font-semibold text-green-600">
          Open Tool →
        </div>
      </div>
    </Link>
  );
}

function ActivityItem({ title, type, score, time, status }: any) {
  return (
    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
      <div className="flex-1">
        <div className="font-semibold text-gray-900">{title}</div>
        <div className="text-sm text-gray-600 mt-1">
          {type} • {time}
        </div>
      </div>
      <div className="flex items-center space-x-4">
        <div className={`text-lg font-bold ${
          status === 'pass' ? 'text-green-600' : 'text-red-600'
        }`}>
          {score}
        </div>
        <div className={`px-3 py-1 rounded text-xs font-semibold ${
          status === 'pass' 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800'
        }`}>
          {status.toUpperCase()}
        </div>
      </div>
    </div>
  );
}