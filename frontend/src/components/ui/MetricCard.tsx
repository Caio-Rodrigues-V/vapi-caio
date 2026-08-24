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

const colorMap: Record<SemanticColor, { text: string; bg: string; border: string }> = {
  primary: {
    text: 'text-[#FF5A0A]',
    bg: 'bg-[#FF5A0A]/10',
    border: 'border-[#FF5A0A]/20',
  },
  success: {
    text: 'text-[#10B981]',
    bg: 'bg-[#10B981]/10',
    border: 'border-[#10B981]/20',
  },
  warning: {
    text: 'text-[#F59E0B]',
    bg: 'bg-[#F59E0B]/10',
    border: 'border-[#F59E0B]/20',
  },
  danger: {
    text: 'text-[#F43F5E]',
    bg: 'bg-[#F43F5E]/10',
    border: 'border-[#F43F5E]/20',
  },
  info: {
    text: 'text-[#38BDF8]',
    bg: 'bg-[#38BDF8]/10',
    border: 'border-[#38BDF8]/20',
  },
  neutral: {
    text: 'text-[#94A3B8]',
    bg: 'bg-[#151C2B]',
    border: 'border-[#94A3B8]/14',
  },
};

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  description,
  icon: Icon,
  semanticColor = 'neutral',
  priority = 1,
  pulse = false,
  loading = false,
  onClick,
}) => {
  if (loading) return <MetricCardSkeleton />;

  const styles = colorMap[semanticColor];
  const isHighPriority = priority === 1;

  return (
    <div
      onClick={onClick}
      className={`gsap-card relative overflow-hidden rounded-[14px] ${
        isHighPriority ? 'bg-[#101521]' : 'bg-[#0A0E1A]'
      } border border-[#94A3B8]/14 p-5 flex items-center justify-between transition-all duration-200 hover:border-[#FF5A0A]/30 hover:bg-[#151C2B] ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="space-y-1.5 min-w-0">
        <p className="text-[13px] font-semibold text-[#94A3B8] truncate">{title}</p>
        <div className="flex items-center gap-2">
          <p className={`${isHighPriority ? 'text-3xl' : 'text-2xl'} font-bold text-white tracking-tight`}>
            {value}
          </p>
          {pulse && (
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#10B981]"></span>
            </span>
          )}
        </div>
        {description && (
          <p className="text-[12px] text-[#64748B] font-normal truncate">{description}</p>
        )}
      </div>

      <div className={`p-3 rounded-xl ${styles.bg} ${styles.border} ${styles.text} flex-shrink-0 ml-3`}>
        <Icon size={20} />
      </div>
    </div>
  );
};
