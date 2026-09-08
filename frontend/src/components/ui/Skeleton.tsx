import React from 'react';

export const MetricCardSkeleton: React.FC = () => {
  return (
    <div className="card-surface p-6 space-y-3 animate-pulse border border-[#94A3B8]/14">
      <div className="flex items-center justify-between">
        <div className="h-3 w-28 skeleton rounded"></div>
        <div className="h-9 w-9 skeleton rounded-xl"></div>
      </div>
      <div className="h-8 w-20 skeleton rounded"></div>
      <div className="h-3 w-36 skeleton rounded"></div>
    </div>
  );
};

export const TableRowSkeleton: React.FC = () => {
  return (
    <tr className="animate-pulse border-b border-[#94A3B8]/14">
      <td className="px-6 py-4"><div className="h-4 w-28 skeleton rounded"></div></td>
      <td className="px-6 py-4"><div className="h-4 w-24 skeleton rounded"></div></td>
      <td className="px-6 py-4"><div className="h-4 w-16 skeleton rounded-full"></div></td>
      <td className="px-6 py-4"><div className="h-4 w-12 skeleton rounded"></div></td>
      <td className="px-6 py-4"><div className="h-4 w-24 skeleton rounded"></div></td>
      <td className="px-6 py-4"><div className="h-4 w-20 skeleton rounded"></div></td>
      <td className="px-6 py-4"><div className="h-4 w-16 skeleton rounded"></div></td>
    </tr>
  );
};
