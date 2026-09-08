import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Não foi possível carregar as métricas',
  message = 'Ocorreu um problema de conexão com o servidor. Tente novamente em instantes.',
  onRetry,
}) => {
  return (
    <div className="rounded-xl p-6 border border-[#FCA5A5] bg-[#FEF2F2] text-center flex flex-col items-center justify-center space-y-3 my-4 shadow-xs">
      <div className="p-3 rounded-lg bg-white text-[#B91C1C] border border-[#FCA5A5]">
        <AlertCircle size={24} />
      </div>
      <div className="space-y-1 max-w-md">
        <h4 className="text-sm font-bold text-[#B91C1C]">{title}</h4>
        <p className="text-xs text-[#5F6570]">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-click inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-[#FAFAFA] text-[#B91C1C] text-xs font-bold rounded-lg border border-[#FCA5A5] transition-all mt-1 shadow-xs"
        >
          <RefreshCw size={13} />
          Tentar Novamente
        </button>
      )}
    </div>
  );
};
