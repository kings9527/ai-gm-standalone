import React from 'react';
import { motion } from 'framer-motion';

interface SkeletonProps {
  className?: string;
  count?: number;
  width?: string | number;
  height?: string | number;
  circle?: boolean;
}

/**
 * Skeleton - 加载骨架屏组件
 * 支持自定义宽高、数量、圆形变体
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  count = 1,
  width = '100%',
  height = 16,
  circle = false,
}) => {
  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <>
      {items.map((i) => (
        <motion.div
          key={i}
          className={`bg-gray-800/60 ${circle ? 'rounded-full' : 'rounded-md'} ${className}`}
          style={{
            width: typeof width === 'number' ? `${width}px` : width,
            height: typeof height === 'number' ? `${height}px` : height,
          }}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: i * 0.1,
            ease: 'easeInOut',
          }}
        />
      ))}
    </>
  );
};

/**
 * SkeletonCard - 卡片式骨架屏
 */
export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`rounded-xl border border-gray-800/40 bg-gray-900/30 p-4 space-y-3 ${className}`}>
    <div className="flex items-center gap-3">
      <Skeleton width={40} height={40} circle />
      <div className="flex-1 space-y-2">
        <Skeleton width="60%" height={16} />
        <Skeleton width="40%" height={12} />
      </div>
    </div>
    <Skeleton width="100%" height={60} />
    <div className="flex gap-2">
      <Skeleton width={80} height={28} />
      <Skeleton width={80} height={28} />
    </div>
  </div>
);

/**
 * SkeletonList - 列表式骨架屏
 */
export const SkeletonList: React.FC<{ rows?: number; className?: string }> = ({ rows = 4, className = '' }) => (
  <div className={`space-y-3 ${className}`}>
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-900/30 border border-gray-800/20">
        <Skeleton width={36} height={36} circle />
        <div className="flex-1 space-y-2">
          <Skeleton width="50%" height={14} />
          <Skeleton width="30%" height={10} />
        </div>
        <Skeleton width={24} height={24} />
      </div>
    ))}
  </div>
);

/**
 * SkeletonText - 文本段落骨架屏
 */
export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({ lines = 3, className = '' }) => (
  <div className={`space-y-2 ${className}`}>
    {Array.from({ length: lines }, (_, i) => (
      <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} height={14} />
    ))}
  </div>
);

export default Skeleton;
