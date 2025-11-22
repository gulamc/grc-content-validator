'use client';

import React, { useState } from 'react';
import { ArticleUploader } from './components/ArticleUploader';
import { ValidationResults } from './components/ValidationResults';
import { ValidationResult } from './types/insights';

export default function InsightsValidatorPage() {
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const handleValidation = async (file: File) => {
    setIsValidating(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/insights-validator/api/validate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Validation failed: ${response.statusText}`);
      }

      const result: ValidationResult = await response.json();
      setValidationResult(result);
    } catch (error) {
      console.error('Validation error:', error);
      alert('Failed to validate article. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Insights Article Validator
          </h1>
          <p className="text-gray-600">
            Upload your Insights article (DOCX format) to validate against quality standards
          </p>
        </div>

        <ArticleUploader
          onValidate={handleValidation}
          isValidating={isValidating}
        />

        {validationResult && (
          <ValidationResults result={validationResult} />
        )}
      </div>
    </div>
  );
}
