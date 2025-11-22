import React, { useCallback, useState } from 'react';

interface ArticleUploaderProps {
  onValidate: (file: File) => Promise<void>;
  isValidating: boolean;
}

export function ArticleUploader({ onValidate, isValidating }: ArticleUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.docx')) {
        setSelectedFile(file);
      } else {
        alert('Please upload a .docx file');
      }
    }
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  }, []);

  const handleValidate = useCallback(async () => {
    if (selectedFile) {
      await onValidate(selectedFile);
    }
  }, [selectedFile, onValidate]);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div
        className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
          dragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-upload"
          accept=".docx"
          onChange={handleChange}
          className="hidden"
          disabled={isValidating}
        />

        {!selectedFile ? (
          <>
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
              aria-hidden="true"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="mt-4">
              <label
                htmlFor="file-upload"
                className="cursor-pointer text-blue-600 hover:text-blue-700 font-medium"
              >
                Upload a file
              </label>
              <span className="text-gray-600"> or drag and drop</span>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              DOCX files only
            </p>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-center space-x-2">
              <svg
                className="h-8 w-8 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span className="text-gray-900 font-medium">{selectedFile.name}</span>
            </div>
            <div className="flex space-x-3 justify-center">
              <button
                onClick={handleValidate}
                disabled={isValidating}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isValidating ? 'Validating...' : 'Validate Article'}
              </button>
              <button
                onClick={() => setSelectedFile(null)}
                disabled={isValidating}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
