// app/reports/page.tsx - Reports dashboard
'use client';

import { useState, useEffect } from 'react';
import { FileText, Users, History, Loader2, AlertTriangle, Download, ChevronDown, ChevronUp } from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface ValidationLogEntry {
  id: number;
  date: string;
  user: string;
  filename: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  wordCount: number | null;
  durationMs: number;
  issueCount: number;
}

interface UserSummaryEntry {
  user: string;
  totalRuns: number;
  avgScore: number;
  passRate: number;
  lastActive: string;
  totalTimeSavedHours: number;
}

interface ArticleHistoryEntry {
  filename: string;
  runs: number;
  firstScore: number;
  latestScore: number;
  improvement: number;
  firstDate: string;
  latestDate: string;
}

interface ReportsData {
  validationLog: ValidationLogEntry[];
  userSummary: UserSummaryEntry[];
  articleHistory: ArticleHistoryEntry[];
}

// ============================================================
// Helpers
// ============================================================

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function scoreColor(pct: number): string {
  if (pct >= 90) return 'bg-green-100 text-green-800';
  if (pct >= 80) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

function userName(email: string): string {
  if (!email || email === 'Unknown') return 'Unknown';
  const name = email.split('@')[0];
  return name.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

// ============================================================
// Component
// ============================================================

export default function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(90);
  const [activeTab, setActiveTab] = useState<'log' | 'users' | 'articles'>('log');
  const [sortField, setSortField] = useState<string>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    async function fetchReports() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/reports?days=${days}`);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error || 'Failed to load reports');
        }
      } catch {
        setError('Failed to connect to reports API');
      } finally {
        setLoading(false);
      }
    }
    fetchReports();
  }, [days]);

  // Sort validation log
  function sortedLog(): ValidationLogEntry[] {
    if (!data) return [];
    const log = [...data.validationLog];
    log.sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortField) {
        case 'date': aVal = new Date(a.date).getTime(); bVal = new Date(b.date).getTime(); break;
        case 'user': aVal = a.user; bVal = b.user; break;
        case 'filename': aVal = a.filename; bVal = b.filename; break;
        case 'score': aVal = a.percentage; bVal = b.percentage; break;
        case 'words': aVal = a.wordCount || 0; bVal = b.wordCount || 0; break;
        case 'duration': aVal = a.durationMs; bVal = b.durationMs; break;
        default: aVal = a.id; bVal = b.id;
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return log;
  }

  function toggleSort(field: string) {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return null;
    return sortDir === 'asc' 
      ? <ChevronUp className="w-3 h-3 inline ml-1" /> 
      : <ChevronDown className="w-3 h-3 inline ml-1" />;
  }

  // Export CSV
  function exportCSV() {
    if (!data) return;
    const headers = ['Date', 'User', 'Filename', 'Score', 'Max Score', 'Percentage', 'Pass/Fail', 'Word Count', 'Duration (ms)', 'Issues'];
    const rows = data.validationLog.map(r => [
      formatDateTime(r.date),
      r.user,
      r.filename,
      r.score,
      r.maxScore,
      r.percentage,
      r.passed ? 'PASS' : 'FAIL',
      r.wordCount || '',
      r.durationMs,
      r.issueCount,
    ]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insights-validation-report-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-800">Validation Reports</h2>
          <p className="text-gray-600 mt-1">Insights Validator usage and performance data</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Time range selector */}
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 6 months</option>
            <option value={365}>Last year</option>
          </select>
          
          {/* Export button */}
          <button
            onClick={exportCSV}
            disabled={!data || data.validationLog.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Loading / Error states */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-indigo-600 animate-spin mr-3" />
          <p className="text-gray-600">Loading reports...</p>
        </div>
      )}

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500 mb-1">Total Validations</p>
              <p className="text-2xl font-bold text-gray-900">{data.validationLog.length}</p>
              <p className="text-xs text-gray-400 mt-1">Last {days} days</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500 mb-1">Active Users</p>
              <p className="text-2xl font-bold text-gray-900">{data.userSummary.length}</p>
              <p className="text-xs text-gray-400 mt-1">Unique editors</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500 mb-1">Unique Articles</p>
              <p className="text-2xl font-bold text-gray-900">{data.articleHistory.length}</p>
              <p className="text-xs text-gray-400 mt-1">Files validated</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500 mb-1">Re-validations</p>
              <p className="text-2xl font-bold text-gray-900">
                {data.articleHistory.filter(a => a.runs > 1).length}
              </p>
              <p className="text-xs text-gray-400 mt-1">Articles checked 2+ times</p>
            </div>
          </div>

          {/* Tab navigation */}
          <div className="flex gap-1 mb-6 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('log')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'log'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              Validation Log
              <span className="ml-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                {data.validationLog.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'users'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Users className="w-4 h-4" />
              User Summary
              <span className="ml-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                {data.userSummary.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('articles')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'articles'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <History className="w-4 h-4" />
              Article History
              <span className="ml-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                {data.articleHistory.length}
              </span>
            </button>
          </div>

          {/* ============================================================ */}
          {/* TAB 1: Validation Log */}
          {/* ============================================================ */}
          {activeTab === 'log' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {data.validationLog.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-lg font-medium">No validations yet</p>
                  <p className="text-sm mt-1">Run an Insights validation to see data here</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th onClick={() => toggleSort('date')} className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-gray-700">
                          Date <SortIcon field="date" />
                        </th>
                        <th onClick={() => toggleSort('user')} className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-gray-700">
                          User <SortIcon field="user" />
                        </th>
                        <th onClick={() => toggleSort('filename')} className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-gray-700">
                          File <SortIcon field="filename" />
                        </th>
                        <th onClick={() => toggleSort('score')} className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-gray-700">
                          Score <SortIcon field="score" />
                        </th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                          Status
                        </th>
                        <th onClick={() => toggleSort('words')} className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-gray-700">
                          Words <SortIcon field="words" />
                        </th>
                        <th onClick={() => toggleSort('duration')} className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-gray-700">
                          Time <SortIcon field="duration" />
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">
                          Issues
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedLog().map((entry) => (
                        <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4 text-sm text-gray-600">{formatDateTime(entry.date)}</td>
                          <td className="py-3 px-4 text-sm text-gray-900 font-medium">{userName(entry.user)}</td>
                          <td className="py-3 px-4 text-sm text-gray-700 max-w-xs truncate" title={entry.filename}>
                            {entry.filename}
                          </td>
                          <td className="text-right py-3 px-4">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${scoreColor(entry.percentage)}`}>
                              {entry.percentage}%
                            </span>
                          </td>
                          <td className="text-center py-3 px-4">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              entry.passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {entry.passed ? 'PASS' : 'FAIL'}
                            </span>
                          </td>
                          <td className="text-right py-3 px-4 text-sm text-gray-600">
                            {entry.wordCount?.toLocaleString() || '—'}
                          </td>
                          <td className="text-right py-3 px-4 text-sm text-gray-600">
                            {formatDuration(entry.durationMs)}
                          </td>
                          <td className="text-right py-3 px-4 text-sm text-gray-600">
                            {entry.issueCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 2: User Summary */}
          {/* ============================================================ */}
          {activeTab === 'users' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {data.userSummary.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-lg font-medium">No user data yet</p>
                  <p className="text-sm mt-1">Data will appear after validations are run</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">User</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Validations</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Avg Score</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Pass Rate</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Time Saved</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Last Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.userSummary.map((user) => (
                        <tr key={user.user} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4">
                            <p className="text-sm text-gray-900 font-medium">{userName(user.user)}</p>
                            <p className="text-xs text-gray-400">{user.user}</p>
                          </td>
                          <td className="text-right py-3 px-4 text-sm text-gray-700 font-medium">{user.totalRuns}</td>
                          <td className="text-right py-3 px-4">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${scoreColor(user.avgScore)}`}>
                              {user.avgScore}%
                            </span>
                          </td>
                          <td className="text-right py-3 px-4">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${scoreColor(user.passRate)}`}>
                              {user.passRate}%
                            </span>
                          </td>
                          <td className="text-right py-3 px-4 text-sm text-gray-700">{user.totalTimeSavedHours}hrs</td>
                          <td className="text-right py-3 px-4 text-sm text-gray-500">{formatDate(user.lastActive)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 3: Article History */}
          {/* ============================================================ */}
          {activeTab === 'articles' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {data.articleHistory.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <History className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-lg font-medium">No article data yet</p>
                  <p className="text-sm mt-1">Data will appear after validations are run</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Filename</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Times Validated</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">First Score</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Latest Score</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Improvement</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">First Checked</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Last Checked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.articleHistory.map((article) => (
                        <tr key={article.filename} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4 text-sm text-gray-900 font-medium max-w-xs truncate" title={article.filename}>
                            {article.filename}
                          </td>
                          <td className="text-right py-3 px-4">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              article.runs > 1 ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {article.runs}
                            </span>
                          </td>
                          <td className="text-right py-3 px-4">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${scoreColor(article.firstScore)}`}>
                              {article.firstScore}%
                            </span>
                          </td>
                          <td className="text-right py-3 px-4">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${scoreColor(article.latestScore)}`}>
                              {article.latestScore}%
                            </span>
                          </td>
                          <td className="text-right py-3 px-4">
                            {article.runs > 1 ? (
                              <span className={`text-sm font-medium ${
                                article.improvement > 0 ? 'text-green-600' : 
                                article.improvement < 0 ? 'text-red-600' : 'text-gray-500'
                              }`}>
                                {article.improvement > 0 ? '+' : ''}{article.improvement}%
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </td>
                          <td className="text-right py-3 px-4 text-sm text-gray-500">{formatDate(article.firstDate)}</td>
                          <td className="text-right py-3 px-4 text-sm text-gray-500">{formatDate(article.latestDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}