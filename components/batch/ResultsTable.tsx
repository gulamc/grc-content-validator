// components/batch/ResultsTable.tsx
'use client';

import React from 'react';
import { BatchItem } from '@/lib/batchProcessor';

interface ResultsTableProps {
  items: BatchItem[];
  onViewDetails: (item: BatchItem) => void;
}

export default function ResultsTable({ items, onViewDetails }: ResultsTableProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  const getScoreColor = (score?: number) => {
    if (score === undefined || score === null || isNaN(score)) return 'text-gray-500';
    if (score >= 80) return 'text-green-600 font-semibold';
    if (score >= 60) return 'text-yellow-600 font-semibold';
    if (score > 0) return 'text-orange-600 font-semibold';
    return 'text-red-600 font-semibold';
  };
  
  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow">
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
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Score
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Verdict
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {items.map((item, index) => (
            <tr key={index} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {item.id}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800">
                  {item.type.toUpperCase()}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(item.status)}`}>
                  {item.status.toUpperCase()}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                {item.score !== undefined && item.score !== null && !isNaN(item.score) ? (
                  <span className={getScoreColor(item.score)}>
                    {item.score.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                {item.scoreDetails?.verdict ? (
                  <span className={`px-2 py-1 text-xs font-medium rounded uppercase ${
                    item.scoreDetails.verdict.toLowerCase() === 'pass' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {item.scoreDetails.verdict}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                {item.status === 'success' ? (
                  <button
                    onClick={() => onViewDetails(item)}
                    className="text-blue-600 hover:text-blue-900 font-medium"
                  >
                    View Details
                  </button>
                ) : item.status === 'error' ? (
                  <span className="text-red-600 text-xs" title={item.error}>
                    {item.error?.substring(0, 50)}...
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}