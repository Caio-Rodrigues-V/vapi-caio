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
        compact ? 'p-4' : 'bg-white p-8 sm:p-12 border border-[#E5E7EB] rounded-xl shadow-xs my-2'
      }`}
    >
      <div className={`rounded-xl bg-[#FFF1E8] text-[#D9480F] border border-[#FFD1B8] shadow-xs ${compact ? 'p-2.5' : 'p-3.5'}`}>
        <Icon size={compact ? 22 : 32} strokeWidth={2} />
      </div>
      <div className="space-y-1 max-w-xs">
        <h4 className={`${compact ? 'text-xs font-bold' : 'text-base font-bold'} text-[#18181B]`}>{title}</h4>
        <p className="text-[11px] text-[#5F6570] leading-relaxed">{description}</p>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="btn-click inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#D9480F] hover:bg-[#B9380B] text-white text-xs font-bold rounded-lg shadow-xs transition-all mt-1"
        >
          <UploadCloud size={14} />
          {actionLabel}
        </button>
      )}
    </div>
  );
};
