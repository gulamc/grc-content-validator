'use client';

import { useState } from 'react';
import { Upload, Loader2, X } from 'lucide-react';

interface ArticleUploaderProps {
  onValidate: (file: File) => void;
  loading: boolean;
  onClear: () => void;
}

export default function ArticleUploader({ onValidate, loading, onClear }: ArticleUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.docx')) {
      setSelectedFile(file);
    } else {
      alert('Please select a valid .docx file');
    }
  };

  const handleValidate = () => {
    if (selectedFile) {
      onValidate(selectedFile);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    onClear();
    // Reset file input
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
      <h2 className="text-xl font-semibold text-slate-900 mb-6">Upload Article</h2>

      <div className="space-y-4">
        {/* File Input */}
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
          <input
            id="file-upload"
            type="file"
            accept=".docx"
            onChange={handleFileChange}
            className="hidden"
          />
          <label htmlFor="file-upload" className="cursor-pointer">
            <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-sm font-medium text-slate-900 mb-1">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-slate-500">Word Document (.docx only)</p>
          </label>
        </div>

        {/* Selected File Display */}
        {selectedFile && (
          <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-3">
              <Upload className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-slate-900">{selectedFile.name}</p>
                <p className="text-xs text-slate-500">
                  {(selectedFile.size / 1024).toFixed(2)} KB
                </p>
              </div>
            </div>
            <button
              onClick={handleClear}
              className="text-slate-400 hover:text-slate-600"
              disabled={loading}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleValidate}
            disabled={loading || !selectedFile}
            className="flex-1 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all shadow-md"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                Validating...
              </>
            ) : (
              'Validate Article'
            )}
          </button>
          <button
            onClick={handleClear}
            disabled={loading}
            className="px-6 py-3 bg-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-300 disabled:opacity-50"
          >
            Clear
          </button>
        </div>

        {/* Info */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">What gets validated?</h3>
          <ul className="text-xs text-slate-600 space-y-1">
            <li>• Content Quality (3 dimensions)</li>
            <li>• Legal & Brand Compliance (5 dimensions)</li>
            <li>• Grammar & Style (11 dimensions)</li>
            <li>• Formatting (10 dimensions)</li>
            <li>• Structure (2 dimensions)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
