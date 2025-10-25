// components/Modal.tsx
'use client';
import React from 'react';

export default function Modal({
  open, title, onClose, children
}: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-[101] w-full max-w-2xl rounded-2xl bg-white shadow-xl border border-gray-200">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button className="text-sm text-gray-500 hover:text-gray-900" onClick={onClose}>Close</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
