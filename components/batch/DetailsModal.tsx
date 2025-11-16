// components/batch/DetailsModal.tsx
'use client';

import React from 'react';
import { BatchItem } from '@/lib/batchProcessor';
import { EtScorePanel } from '@/components/EtScorePanel';
import ControlScorePanel from '@/components/ControlScorePanel';
import { AIEnhancedSuggestionsControl } from '@/components/AIEnhancedSuggestionsControl';

interface DetailsModalProps {
  item: BatchItem | null;
  onClose: () => void;
}

export default function DetailsModal({ item, onClose }: DetailsModalProps) {
  if (!item) return null;
  
  if (!item.scoreDetails) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-2xl w-full">
          <div className="px-6 py-4 border-b flex justify-between items-center">
            <h3 className="text-xl font-bold">Details: {item.id}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl">X</button>
          </div>
          <div className="p-6">
            <p className="text-red-600">No score details available.</p>
            {item.error && <p className="text-sm text-red-500 mt-2">Error: {item.error}</p>}
          </div>
          <div className="px-6 py-4 border-t flex justify-end">
            <button onClick={onClose} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  const isET = item.type === 'ET';
  const isControl = item.type === 'Control';
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {isControl ? 'Control' : 'Evidence Task'}: {item.id}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {isET && item.data?.what_to_collect && <span>{item.data.what_to_collect}</span>}
              {isControl && item.data?.name && <span>{item.data.name}</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl">X</button>
        </div>
        
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isET ? (
            <>
              {/* Evidence Tasks - Full detailed breakdown */}
              <EtScorePanel scoreResult={item.scoreDetails} showTitle={false} />
              
              {/* AI-Enhanced Suggestions for ETs */}
              <AIEnhancedSuggestionsControl
                id={item.id}
                name={item.data.what_to_collect || 'Evidence Task'}
                description={item.data.whatToCollect || item.data.what_to_collect || ''}
                guidance={item.data.howToCollect || item.data.how_to_collect || ''}
                scoreResult={item.scoreDetails}
                enabled={true}
              />
            </>
          ) : isControl ? (
            <>
              {/* Controls - Full detailed breakdown */}
              <ControlScorePanel result={item.scoreDetails} />
              
              {/* AI-Enhanced Suggestions for Controls */}
              <AIEnhancedSuggestionsControl
                id={item.id}
                name={item.data.name || item.data.control_name || 'Control'}
                description={item.data.description || ''}
                guidance={item.data.guidance || ''}
                scoreResult={item.scoreDetails}
                enabled={true}
              />
            </>
          ) : (
            <div>
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
                <p className="text-blue-800">
                  {item.type} detailed view not yet implemented. Score: {item.scoreDetails.total?.score || 'N/A'}
                </p>
              </div>
              <pre className="bg-gray-50 p-4 rounded text-sm overflow-auto">
                {JSON.stringify(item.scoreDetails, null, 2)}
              </pre>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}