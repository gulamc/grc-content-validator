// components/batch/ResultsTable.tsx - FIXED VERSION
'use client';

import React from 'react';
import { BatchResults, BatchItem, exportToExcel } from '@/lib/batchProcessor';
import { CheckCircle, AlertTriangle, XCircle, Download, Eye } from 'lucide-react';

interface ResultsTableProps {
  results: BatchResults;
  onViewDetails: (item: BatchItem) => void;
}

export default function ResultsTable({ results, onViewDetails }: ResultsTableProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'fail':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-gray-400" />;
      default:
        return null;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600 font-semibold';
    if (score >= 70) return 'text-yellow-600 font-semibold';
    return 'text-red-600 font-semibold';
  };

  const getVerdictBadge = (verdict?: string) => {
    if (!verdict) return null;
    
    if (verdict === 'PASS') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          PASS
        </span>
      );
    }
    
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        FAIL
      </span>
    );
  };

  // Get the display text for the content column based on type
  const getContentDisplay = (item: BatchItem): string => {
    if (item.type === 'Control') {
      // For Controls, show the name/title
      return item.data.name || item.data.title || 'N/A';
    } else {
      // For Evidence Tasks, show what to collect
      return item.data.whatToCollect || item.data.what || 'N/A';
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex justify-between items-center">
          <div className="flex gap-8">
            <div>
              <div className="text-sm text-gray-500">Total Items</div>
              <div className="text-2xl font-bold text-gray-900">{results.summary.total}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Passed</div>
              <div className="text-2xl font-bold text-green-600">{results.summary.passed}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Failed</div>
              <div className="text-2xl font-bold text-red-600">{results.summary.failed}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Errors</div>
              <div className="text-2xl font-bold text-gray-400">{results.summary.errors}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Avg Score</div>
              <div className={`text-2xl font-bold ${getScoreColor(results.summary.avgScore)}`}>
                {results.summary.avgScore.toFixed(1)}
              </div>
            </div>
          </div>
          <button
            onClick={() => exportToExcel(results)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
          >
            <Download className="w-4 h-4" />
            Export to Excel
          </button>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {/* Dynamic column header based on content type */}
                Content
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Verdict
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {results.items.map((item, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                    {item.type === 'Control' ? 'Control' : 'ET'}
                  </span>
                  <span className="ml-2">{item.id}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.type === 'Control' ? 'Control' : 'Evidence Task'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 max-w-md truncate">
                  {getContentDisplay(item)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={getScoreColor(item.score)}>
                    {item.score.toFixed(1)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {getVerdictBadge(item.verdict)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(item.status)}
                    <span className="text-sm text-gray-700 capitalize">{item.status}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {item.status !== 'error' ? (
                    <button
                      onClick={() => onViewDetails(item)}
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-900 font-medium"
                    >
                      <Eye className="w-4 h-4" />
                      View Details
                    </button>
                  ) : item.error ? (
                    <span className="text-red-600 text-xs" title={item.error}>
                      {item.error.substring(0, 30)}...
                    </span>
                  ) : (
                    <span className="text-gray-400">â€”</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}