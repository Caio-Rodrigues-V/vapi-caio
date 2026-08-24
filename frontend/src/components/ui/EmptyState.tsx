import React from 'react';
import { Inbox, UploadCloud } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ElementType;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Nenhum dado encontrado',
  description = 'Ainda não existem chamadas ou contatos cadastrados nesta visualização.',
  actionLabel,
  onAction,
  icon: Icon = Inbox,
  compact = false,
}) => {
  return (
    <div
      className={`text-center flex flex-col items-center justify-center space-y-2.5 w-full h-full ${
        compact ? 'p-4' : 'card-surface p-8 sm:p-12 border border-[#94A3B8]/14 my-2'
      }`}
    >
      <div className={`rounded-2xl bg-[#151C2B] text-[#94A3B8] border border-[#94A3B8]/14 shadow-inner ${compact ? 'p-2.5' : 'p-3.5'}`}>
        <Icon size={compact ? 22 : 32} />
      </div>
      <div className="space-y-1 max-w-xs">
        <h4 className={`${compact ? 'text-xs font-bold' : 'text-base font-semibold'} text-white`}>{title}</h4>
        <p className="text-[11px] text-[#94A3B8] leading-relaxed">{description}</p>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="btn-click inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FF5A0A] hover:bg-[#E04B00] text-white text-xs font-bold rounded-xl shadow-md transition-all mt-1"
        >
          <UploadCloud size={13} />
          {actionLabel}
        </button>
      )}
    </div>
  );
};
