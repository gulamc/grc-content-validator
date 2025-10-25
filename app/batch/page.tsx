// app/batch/page.tsx
'use client';

import React, { useState } from 'react';
import { parseFile, processBatch, exportToExcel, BatchItem, BatchResult } from '@/lib/batchProcessor';
import ResultsTable from '@/components/batch/ResultsTable';
import DetailsModal from '@/components/batch/DetailsModal';

export default function BatchPage() {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<BatchResult | null>(null);
  const [selectedItem, setSelectedItem] = useState<BatchItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setResult(null);
    }
  };

  const handleProcess = async () => {
    if (!file) return;

    setProcessing(true);
    setError(null);
    setProgress({ current: 0, total: 0 });

    try {
      // Parse file
      const { items, type } = await parseFile(file);
      
      // Process batch
      const batchResult = await processBatch(items, type, (current, total) => {
        setProgress({ current, total });
      });
      
      setResult(batchResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setProcessing(false);
    }
  };

  const handleExport = () => {
    if (!result) return;
    exportToExcel(result);
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setProgress({ current: 0, total: 0 });
    setSelectedItem(null);
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Batch Validator</h1>
          <p className="text-gray-600">
            Upload Excel or CSV files containing Controls or ETs for batch validation
          </p>
        </div>

        {/* Upload Section */}
        {!result && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Upload File</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select File (Excel or CSV)
              </label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                disabled={processing}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
              />
            </div>

            {file && (
              <div className="mb-4 p-3 bg-blue-50 rounded">
                <p className="text-sm text-blue-800">
                  <strong>Selected:</strong> {file.name} ({(file.size / 1024).toFixed(2)} KB)
                </p>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 rounded">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <button
              onClick={handleProcess}
              disabled={!file || processing}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {processing ? 'Processing...' : 'Process Batch'}
            </button>

            {processing && (
              <div className="mt-4">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Processing items...</span>
                  <span>{progress.current} / {progress.total}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            <div className="mt-6 p-4 bg-gray-50 rounded">
              <h3 className="font-semibold text-sm text-gray-700 mb-2">File Format Requirements:</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li>Excel (.xlsx, .xls) or CSV (.csv) format</li>
                <li>First row must contain column headers</li>
                <li>Each row represents one Control or ET item</li>
                <li>System will auto-detect type based on columns</li>
              </ul>
            </div>
          </div>
        )}

        {/* Results Section */}
        {result && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-500 mb-1">Total Items</div>
                <div className="text-3xl font-bold text-gray-900">{result.summary.total}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-500 mb-1">Processed</div>
                <div className="text-3xl font-bold text-green-600">{result.summary.processed}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-500 mb-1">Errors</div>
                <div className="text-3xl font-bold text-red-600">{result.summary.errors}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-500 mb-1">Avg Score</div>
                <div className="text-3xl font-bold text-blue-600">{result.summary.avgScore.toFixed(2)}</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={handleExport}
                className="flex-1 bg-green-600 text-white py-3 px-4 rounded font-semibold hover:bg-green-700"
              >
                Export to Excel
              </button>
              <button
                onClick={handleReset}
                className="flex-1 bg-gray-600 text-white py-3 px-4 rounded font-semibold hover:bg-gray-700"
              >
                Process Another File
              </button>
            </div>

            {/* Results Table */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Results</h2>
              <ResultsTable 
                items={result.items} 
                onViewDetails={setSelectedItem}
              />
            </div>
          </div>
        )}

        {/* Details Modal */}
        <DetailsModal 
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      </div>
    </div>
  );
}




