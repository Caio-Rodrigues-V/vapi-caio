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
    <div className="card-surface p-8 border border-[#F43F5E]/30 bg-[#F43F5E]/5 text-center flex flex-col items-center justify-center space-y-3 my-4">
      <div className="p-3 rounded-xl bg-[#F43F5E]/10 text-[#F43F5E] border border-[#F43F5E]/20">
        <AlertCircle size={24} />
      </div>
      <div className="space-y-1 max-w-md">
        <h4 className="text-sm font-semibold text-white">{title}</h4>
        <p className="text-xs text-[#94A3B8]">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-click inline-flex items-center gap-2 px-4 py-2 bg-[#151C2B] hover:bg-[#1A2334] text-white text-xs font-semibold rounded-xl border border-[#94A3B8]/20 transition-all mt-2"
        >
          <RefreshCw size={13} />
          Tentar Novamente
        </button>
      )}
    </div>
  );
};
