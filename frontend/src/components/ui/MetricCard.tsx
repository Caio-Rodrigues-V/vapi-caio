import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { MetricCardSkeleton } from './Skeleton';

export type SemanticColor = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  trend?: string;
  trendType?: 'positive' | 'negative' | 'neutral';
  icon: LucideIcon;
  semanticColor?: SemanticColor;
  priority?: 1 | 2;
  pulse?: boolean;
  glow?: boolean;
  loading?: boolean;
  onClick?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  description,
  trend,
  trendType = 'neutral',
  icon: Icon,
  pulse = false,
  loading = false,
  onClick,
}) => {
  if (loading) return <MetricCardSkeleton />;

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl bg-white border border-[#E5E7EB] p-4 flex items-center justify-between shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] transition-all duration-150 hover:border-[#D1D5DB] ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="space-y-1 min-w-0">
        <p className="text-[12px] font-medium text-[#5F6570] truncate">{title}</p>
        <div className="flex items-center gap-2">
          <p className="text-2xl sm:text-3xl font-extrabold text-[#18181B] tracking-tight">
            {value}
          </p>
          {pulse && (
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#15803D]"></span>
            </span>
          )}
        </div>

        {trend ? (
          <p className="text-[12px] font-medium flex items-center gap-1">
            <span className={
              trendType === 'positive' ? 'text-[#15803D] font-semibold' :
              trendType === 'negative' ? 'text-[#B91C1C] font-semibold' :
              'text-[#5F6570]'
            }>
              {trendType === 'positive' && '↑ '}
              {trendType === 'negative' && '↓ '}
              {trend}
            </span>
          </p>
        ) : description ? (
          <p className="text-[12px] text-[#8B92A0] font-medium truncate">{description}</p>
        ) : null}
      </div>

      <div className="p-2.5 rounded-lg bg-[#FFF1E8] text-[#D9480F] border border-[#FFD1B8] flex-shrink-0 ml-3">
        <Icon size={20} strokeWidth={2} />
      </div>
    </div>
  );
};
