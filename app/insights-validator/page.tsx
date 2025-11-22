'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import ArticleUploader from './components/ArticleUploader';
import ValidationResults from './components/ValidationResults';
import { ValidationResult } from './types/insights';

export default function InsightsValidatorPage() {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleValidate = async (file: File) => {
    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/app/insights-validator/api/validate', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setResult(data);
      } else {
        alert('Validation failed');
      }
    } catch (error) {
      console.error('Validation error:', error);
      alert('Validation failed. Check console.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setResult(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Insights Article Style Guide Validator</h1>
              <p className="text-slate-600">Validate Word documents against OneTrust DataGuidance standards</p>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Validation Criteria:</strong> 31 dimensions across 5 categories | 100-point scoring system | Pass threshold: 85+ points
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upload Section */}
          <div>
            <ArticleUploader onValidate={handleValidate} loading={loading} onClear={handleClear} />
          </div>

          {/* Results Section */}
          <div>
            {result ? (
              <ValidationResults result={result} />
            ) : (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Ready to Validate</h3>
                <p className="text-slate-600">
                  Upload a Word document (.docx) to validate it against the Insights Article Style Guide
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
