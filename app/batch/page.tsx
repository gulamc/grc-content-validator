// app/batch/page.tsx - EXAMPLE IMPLEMENTATION FOR TWO-BUTTON APPROACH
'use client';

import React, { useState } from 'react';
import { processExcelFile, BatchResults, ContentType } from '@/lib/batchProcessor';
import ResultsTable from '@/components/batch/ResultsTable';
import DetailsModal from '@/components/batch/DetailsModal';
import { FileText, Settings, Upload } from 'lucide-react';

export default function BatchValidatorPage() {
  const [results, setResults] = useState<BatchResults | null>(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handler for Evidence Tasks upload
  const handleETUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await processFile(file, 'et');
  };

  // Handler for Controls upload
  const handleControlsUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await processFile(file, 'control');
  };

  // Common processing logic
  const processFile = async (file: File, contentType: ContentType) => {
    setIsProcessing(true);
    setError(null);
    setResults(null);

    try {
      console.log(`Processing file as: ${contentType}`);
      
      // CRITICAL: Pass the content type explicitly
      const batchResults = await processExcelFile(file, contentType);
      
      setResults(batchResults);
    } catch (err: any) {
      setError(err.message || 'Failed to process file');
      console.error('Processing error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Batch Content Validator
          </h1>
          <p className="text-lg text-gray-600">
            Select the type of content you want to validate
          </p>
        </div>

        {/* Upload Cards */}
        {!results && (
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Evidence Tasks Card */}
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <div className="flex items-start mb-4">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4 flex-1">
                  <h3 className="text-xl font-bold text-gray-900">Evidence Tasks</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Upload Excel file with Evidence Tasks<br />
                    (what_to_collect, how_to_collect, etc.)
                  </p>
                </div>
              </div>
              
              <p className="text-xs text-gray-500 mb-4">
                Supported formats: .xlsx, .xls, .csv
              </p>

              <label className="block">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleETUpload}
                  disabled={isProcessing}
                  className="hidden"
                />
                <div className="flex items-center justify-center w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer font-semibold">
                  <Upload className="w-5 h-5 mr-2" />
                  Upload Evidence Tasks
                </div>
              </label>
            </div>

            {/* Controls Card */}
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <div className="flex items-start mb-4">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <Settings className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4 flex-1">
                  <h3 className="text-xl font-bold text-gray-900">Controls</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Upload CSV/Excel file with Controls<br />
                    (control_name, description, guidance)
                  </p>
                </div>
              </div>
              
              <p className="text-xs text-gray-500 mb-4">
                Supported formats: .csv, .xlsx, .xls
              </p>

              <label className="block">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleControlsUpload}
                  disabled={isProcessing}
                  className="hidden"
                />
                <div className="flex items-center justify-center w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer font-semibold">
                  <Upload className="w-5 h-5 mr-2" />
                  Upload Controls
                </div>
              </label>
            </div>
          </div>
        )}

        {/* How It Works */}
        {!results && (
          <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
            <div className="flex items-start">
              <div className="bg-blue-100 p-2 rounded">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div className="ml-4">
                <h4 className="font-semibold text-gray-900 mb-2">How It Works</h4>
                <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside">
                  <li>Select the content type you want to validate</li>
                  <li>Upload your file in the supported format</li>
                  <li>Review results with detailed scores and suggestions</li>
                  <li>Export results to Excel for further analysis</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-700 font-medium">Processing your file...</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 font-semibold">Error: {error}</p>
          </div>
        )}

        {/* Results */}
        {results && !isProcessing && (
          <div>
            <ResultsTable 
              results={results} 
              onViewDetails={setSelectedItem}
            />
            
            {/* New Upload Button */}
            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setResults(null);
                  setError(null);
                }}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold"
              >
                Upload New File
              </button>
            </div>
          </div>
        )}

        {/* Details Modal */}
        {selectedItem && (
          <DetailsModal 
            item={selectedItem} 
            onClose={() => setSelectedItem(null)} 
          />
        )}
      </div>
    </div>
  );
}