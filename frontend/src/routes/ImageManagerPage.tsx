/**
 * ImageManagerPage.tsx
 * Image management route - lazy-loaded.
 */
import React, { useState } from 'react';
import { ImageSelector } from '../components/image-selector';

const ImageManagerPage: React.FC = () => {
  const [selected, setSelected] = useState<any>(null);
  return (
    <div className="w-full h-full bg-gray-950">
      <ImageSelector
        type="all"
        modal={false}
        title="图片管理"
        onSelect={(img) => {
          setSelected(img);
        }}
      />
    </div>
  );
};

export default ImageManagerPage;
