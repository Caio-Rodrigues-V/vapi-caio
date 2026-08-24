import React from 'react';
import { Inbox, UploadCloud } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ElementType;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Nenhum dado encontrado',
  description = 'Ainda não existem chamadas ou contatos cadastrados nesta visualização.',
  actionLabel,
  onAction,
  icon: Icon = Inbox,
}) => {
  return (
    <div className="card-surface p-12 text-center flex flex-col items-center justify-center space-y-4 border border-[#94A3B8]/14 my-4">
      <div className="p-4 rounded-2xl bg-[#151C2B] text-[#94A3B8] border border-[#94A3B8]/14 shadow-inner">
        <Icon size={32} />
      </div>
      <div className="space-y-1 max-w-sm">
        <h4 className="text-base font-semibold text-white">{title}</h4>
        <p className="text-xs text-[#94A3B8] leading-relaxed">{description}</p>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="btn-click inline-flex items-center gap-2 px-4 py-2 bg-[#FF5A0A] hover:bg-[#E04B00] text-white text-xs font-bold rounded-xl shadow-md transition-all mt-2"
        >
          <UploadCloud size={14} />
          {actionLabel}
        </button>
      )}
    </div>
  );
};
