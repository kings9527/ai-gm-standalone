/**
 * ImageManagerPage.tsx
 * Image management route - lazy-loaded.
 */
import React, { useState } from 'react';
import { ImageSelector } from '../components/image-selector';

const ImageManagerPage: React.FC = () => {
  const [selected, setSelected] = useState<any>(null);
  return (
    <div className="w-full h-full bg-gray-950 flex flex-col">
      {/* Header with back button */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800/60 bg-gray-950/80">
        <div className="flex items-center gap-3">
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); window.location.hash = '#/'; }}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </a>
          <h1 className="text-sm font-semibold text-gray-200">图片管理</h1>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ImageSelector
          type="all"
          modal={false}
          title="图片管理"
          onSelect={(img) => {
            setSelected(img);
          }}
        />
      </div>
    </div>
  );
};

export default ImageManagerPage;
