// app/analytics/page.tsx - Analytics dashboard (moved from main page)
'use client';

import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

export default function AnalyticsPage() {
  // Mock data - Quality trend over 6 months
  const trendData = [
    { month: 'Jun', passRate: 85, avgScore: 84.2 },
    { month: 'Jul', passRate: 87, avgScore: 85.8 },
    { month: 'Aug', passRate: 89, avgScore: 87.1 },
    { month: 'Sep', passRate: 90, avgScore: 88.4 },
    { month: 'Oct', passRate: 91, avgScore: 89.2 },
    { month: 'Nov', passRate: 93, avgScore: 90.5 },
  ];

  // Top failure reasons
  const topFailures = [
    { reason: 'Modal verbs', count: 183, percentage: 28 },
    { reason: 'Missing preamble', count: 94, percentage: 22 },
    { reason: 'Passive voice', count: 67, percentage: 18 },
    { reason: 'Generic terms', count: 52, percentage: 16 },
    { reason: 'Vendor references', count: 38, percentage: 12 },
  ];

  // Validator performance
  const validatorStats = [
    { name: 'Controls', runs: 847, passed: 754, passRate: 89, avgScore: 88.2, timeSaved: 127 },
    { name: 'Evidence Tasks', runs: 623, passed: 586, passRate: 94, avgScore: 90.1, timeSaved: 89 },
    { name: 'Structure', runs: 156, passed: 142, passRate: 91, avgScore: 89.4, timeSaved: 23 },
    { name: 'Batch Processor', runs: 45, passed: 39, passRate: 87, avgScore: 87.5, timeSaved: 18 },
    { name: 'Insights', runs: 12, passed: 12, passRate: 100, avgScore: 92.3, timeSaved: 4 },
  ];

  const totalRuns = validatorStats.reduce((sum, v) => sum + v.runs, 0);
  const totalPassed = validatorStats.reduce((sum, v) => sum + v.passed, 0);
  const totalTimeSaved = validatorStats.reduce((sum, v) => sum + v.timeSaved, 0);
  const overallPassRate = Math.round((totalPassed / totalRuns) * 100);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* ========== NEW: MOCK DATA WARNING BANNER ========== */}
      <div className="mb-6 bg-red-50 border-2 border-red-500 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-red-900 font-bold text-lg">⚠️ DEMONSTRATION DATA</h3>
            <p className="text-red-800 text-sm">
              This dashboard displays mock data for demonstration purposes only. 
              Production metrics will be available after deployment.
            </p>
          </div>
        </div>
      </div>
      {/* ========== END NEW SECTION ========== */}

      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-800">Content Validation Analytics</h2>
        <p className="text-gray-600 mt-2">
          Executive Dashboard - Last 6 Months
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Validations */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Total Validations</span>
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-teal-600" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{totalRuns.toLocaleString()}</div>
          <p className="text-sm text-gray-500 mt-1">65+ validation checks</p>
        </div>

        {/* Pass Rate */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Pass Rate</span>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{overallPassRate}%</div>
          <p className="text-sm text-green-600 mt-1">↗ +8% from 6 months ago</p>
        </div>

        {/* Time Saved */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Time Saved</span>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900">{totalTimeSaved}hrs</div>
          <p className="text-sm text-gray-500 mt-1">~8 min per validation</p>
        </div>

        {/* Error Reduction */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Error Reduction</span>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-purple-600" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900">-34%</div>
          <p className="text-sm text-purple-600 mt-1">Since launch</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Quality Trend Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Quality Improvement Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" stroke="#6b7280" />
              <YAxis stroke="#6b7280" domain={[80, 100]} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="passRate" 
                stroke="#14b8a6" 
                strokeWidth={3}
                name="Pass Rate (%)"
                dot={{ fill: '#14b8a6', r: 5 }}
              />
              <Line 
                type="monotone" 
                dataKey="avgScore" 
                stroke="#3b82f6" 
                strokeWidth={3}
                name="Avg Score"
                dot={{ fill: '#3b82f6', r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-sm text-gray-600 mt-4">
            <span className="text-green-600 font-semibold">↗ 8% improvement</span> in pass rate over 6 months
          </p>
        </div>

        {/* Top Failure Reasons */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Top 5 Failure Reasons</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topFailures} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" stroke="#6b7280" />
              <YAxis dataKey="reason" type="category" width={120} stroke="#6b7280" tick={{ fontSize: 12 }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
              />
              <Bar dataKey="percentage" fill="#ef4444" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-sm text-gray-600 mt-4">
            Focus areas for quality improvement initiatives
          </p>
        </div>
      </div>

      {/* Validator Performance Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Validator Performance Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Validator</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Total Runs</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Passed</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Pass Rate</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Avg Score</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Time Saved</th>
              </tr>
            </thead>
            <tbody>
              {validatorStats.map((stat, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center">
                      <div className={`w-2 h-2 rounded-full mr-3 ${
                        stat.name === 'Controls' ? 'bg-teal-500' :
                        stat.name === 'Evidence Tasks' ? 'bg-blue-500' :
                        stat.name === 'Structure' ? 'bg-green-500' :
                        stat.name === 'Batch Processor' ? 'bg-purple-500' :
                        'bg-indigo-500'
                      }`}></div>
                      <span className="font-medium text-gray-900">{stat.name}</span>
                    </div>
                  </td>
                  <td className="text-right py-3 px-4 text-gray-700">{stat.runs}</td>
                  <td className="text-right py-3 px-4 text-gray-700">{stat.passed}</td>
                  <td className="text-right py-3 px-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      stat.passRate >= 95 ? 'bg-green-100 text-green-800' :
                      stat.passRate >= 90 ? 'bg-blue-100 text-blue-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {stat.passRate}%
                    </span>
                  </td>
                  <td className="text-right py-3 px-4 text-gray-700">{stat.avgScore}</td>
                  <td className="text-right py-3 px-4 text-gray-700">{stat.timeSaved}hrs</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold">
                <td className="py-3 px-4 text-gray-900">Total</td>
                <td className="text-right py-3 px-4 text-gray-900">{totalRuns}</td>
                <td className="text-right py-3 px-4 text-gray-900">{totalPassed}</td>
                <td className="text-right py-3 px-4">
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                    {overallPassRate}%
                  </span>
                </td>
                <td className="text-right py-3 px-4 text-gray-900">88.8</td>
                <td className="text-right py-3 px-4 text-gray-900">{totalTimeSaved}hrs</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Key Insights */}
      <div className="mt-8 bg-gradient-to-r from-teal-50 to-blue-50 rounded-lg border border-teal-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Key Insights</h3>
        <ul className="space-y-2">
          <li className="flex items-start">
            <span className="text-teal-600 mr-2">✓</span>
            <span className="text-gray-700"><strong>Quality Improvement:</strong> Pass rate increased from 85% to 93% over 6 months (+8%)</span>
          </li>
          <li className="flex items-start">
            <span className="text-teal-600 mr-2">✓</span>
            <span className="text-gray-700"><strong>Efficiency Gains:</strong> Saved 238+ hours of manual review time (avg 8 min per validation)</span>
          </li>
          <li className="flex items-start">
            <span className="text-teal-600 mr-2">✓</span>
            <span className="text-gray-700"><strong>Error Reduction:</strong> 34% decrease in validation failures since system launch</span>
          </li>
          <li className="flex items-start">
            <span className="text-teal-600 mr-2">✓</span>
            <span className="text-gray-700"><strong>Top Issue:</strong> Modal verbs in descriptions account for 28% of failures - training opportunity</span>
          </li>
        </ul>
      </div>

      {/* ========== NEW: INSIGHTS VALIDATOR DETAILED ANALYTICS ========== */}
      <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Insights Validator Analytics</h3>
            <p className="text-sm text-gray-600 mt-1">Detailed breakdown for DataGuidance articles</p>
          </div>
          <span className="px-3 py-1 bg-indigo-100 text-indigo-800 text-sm font-semibold rounded-full">
            31 Dimensions
          </span>
        </div>

        {/* Insights-specific metrics cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 border border-indigo-200">
            <p className="text-sm text-indigo-700 font-medium mb-1">Articles Validated</p>
            <p className="text-3xl font-bold text-indigo-900">127</p>
            <p className="text-xs text-indigo-600 mt-1">Last 6 months</p>
          </div>
          
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
            <p className="text-sm text-green-700 font-medium mb-1">Avg Validation Time</p>
            <p className="text-3xl font-bold text-green-900">30s</p>
            <p className="text-xs text-green-600 mt-1">Per article</p>
          </div>
          
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
            <p className="text-sm text-purple-700 font-medium mb-1">Avg Quality Score</p>
            <p className="text-3xl font-bold text-purple-900">88.5</p>
            <p className="text-xs text-purple-600 mt-1">Out of 100</p>
          </div>
          
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
            <p className="text-sm text-orange-700 font-medium mb-1">Time Saved</p>
            <p className="text-3xl font-bold text-orange-900">254hrs</p>
            <p className="text-xs text-orange-600 mt-1">~2hrs per article</p>
          </div>
        </div>

        {/* Quality by Category */}
        <div className="mb-6">
          <h4 className="text-md font-semibold text-gray-800 mb-3">Quality by Category</h4>
          <div className="space-y-3">
            {[
              { category: 'Legal & Brand Accuracy', score: 92, color: 'bg-blue-500' },
              { category: 'Grammar & Style', score: 89, color: 'bg-green-500' },
              { category: 'Formatting', score: 85, color: 'bg-yellow-500' },
              { category: 'Content Quality', score: 87, color: 'bg-purple-500' },
              { category: 'Structure', score: 90, color: 'bg-teal-500' },
            ].map((item) => (
              <div key={item.category}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700 font-medium">{item.category}</span>
                  <span className="text-gray-900 font-semibold">{item.score}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`${item.color} h-2 rounded-full transition-all duration-500`}
                    style={{ width: `${item.score}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top 5 Issues for Insights */}
        <div>
          <h4 className="text-md font-semibold text-gray-800 mb-3">Top 5 Most Common Issues</h4>
          <div className="space-y-2">
            {[
              { issue: 'British Spellings (Dim 2 - Style)', count: 47, percentage: 28 },
              { issue: 'Undefined Acronyms (Dim 5)', count: 38, percentage: 23 },
              { issue: 'Lowercase Law Names (Dim 5)', count: 31, percentage: 19 },
              { issue: 'Missing Oxford Comma (Dim 11)', count: 26, percentage: 16 },
              { issue: 'State Abbreviations (Dim 18)', count: 23, percentage: 14 },
            ].map((item, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-sm">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{item.issue}</p>
                  <p className="text-xs text-gray-500">{item.count} occurrences</p>
                </div>
                <div className="flex-shrink-0">
                  <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded">
                    {item.percentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-600 mt-4">
            <strong>Recommendation:</strong> Update style guide for British spellings and provide acronym definition training
          </p>
        </div>
      </div>
      {/* ========== END NEW SECTION ========== */}

    </div>
  );
}