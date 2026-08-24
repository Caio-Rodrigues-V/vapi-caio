import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { MetricCardSkeleton } from './Skeleton';

export type SemanticColor = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
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
  icon: Icon,
  pulse = false,
  loading = false,
  onClick,
}) => {
  if (loading) return <MetricCardSkeleton />;

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-lg bg-[#101828] border border-[#1F242F] p-4 flex items-center justify-between transition-colors duration-150 hover:border-[#FF5A0A]/50 ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="space-y-1 min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-300 truncate">{title}</p>
        <div className="flex items-center gap-2">
          <p className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {value}
          </p>
          {pulse && (
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          )}
        </div>
        {description && (
          <p className="text-[12px] text-slate-400 font-medium truncate">{description}</p>
        )}
      </div>

      <div className="p-2.5 rounded-lg bg-white text-[#FF5A0A] border border-slate-200 shadow-sm flex-shrink-0 ml-3">
        <Icon size={18} strokeWidth={2.5} />
      </div>
    </div>
  );
};
