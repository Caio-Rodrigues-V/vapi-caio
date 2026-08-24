import React from 'react';
import { Filter, Search, RotateCcw } from 'lucide-react';

export interface FilterBarProps {
  selectedCampaignId: number | null;
  campaigns: Array<{ id: number; name: string }>;
  onSelectCampaign: (id: number | null) => void;
  period: string;
  onSelectPeriod: (period: string) => void;
  statusFilter: string;
  onSelectStatusFilter: (status: string) => void;
  searchInput: string;
  onSearchChange: (value: string) => void;
  onClearFilters: () => void;
  activeFiltersCount: number;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  selectedCampaignId,
  campaigns,
  onSelectCampaign,
  period,
  onSelectPeriod,
  statusFilter,
  onSelectStatusFilter,
  searchInput,
  onSearchChange,
  onClearFilters,
  activeFiltersCount,
}) => {
  return (
    <div className="rounded-lg bg-[#101828] p-3 border border-[#1F242F] space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Lado Esquerdo: Seleção de Campanha & Período */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-[#FF5A0A]" />
            <span className="text-xs font-semibold text-slate-200 whitespace-nowrap">Filtros:</span>
            {activeFiltersCount > 0 && (
              <span className="px-2 py-0.5 rounded bg-[#FF5A0A]/10 text-[#FF5A0A] text-[11px] font-semibold border border-[#FF5A0A]/20">
                {activeFiltersCount} ativo{activeFiltersCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Selector de Campanha */}
          <select
            value={selectedCampaignId ?? ''}
            onChange={(e) => onSelectCampaign(e.target.value ? Number(e.target.value) : null)}
            className="bg-[#0C111D] text-slate-200 border border-[#1F242F] rounded-lg px-2.5 py-1.5 text-xs font-medium cursor-pointer max-w-[240px] truncate focus:outline-none focus:border-[#FF5A0A]"
          >
            <option value="">Todas as Campanhas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.id} - {c.name}
              </option>
            ))}
          </select>

          {/* Selector de Período */}
          <div className="flex items-center gap-1 bg-[#0C111D] p-0.5 rounded-lg border border-[#1F242F]">
            {[
              { id: 'today', label: 'Hoje' },
              { id: '7d', label: '7D' },
              { id: '30d', label: '30D' },
              { id: 'all', label: 'Tudo' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPeriod(p.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  period === p.id
                    ? 'bg-[#FF5A0A] text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Selector de Status da Chamada */}
          <div className="flex items-center gap-1 bg-[#0C111D] p-0.5 rounded-lg border border-[#1F242F]">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'formalize', label: 'Formalizado' },
              { id: 'schedule', label: 'Agendado' },
              { id: 'zero', label: 'Sem Acordo' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectStatusFilter(s.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  statusFilter === s.id
                    ? 'bg-[#FF5A0A] text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lado Direito: Busca e Limpar Filtros */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar CPF, Telefone..."
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              className="bg-[#0C111D] text-slate-200 border border-[#1F242F] rounded-lg pl-8 pr-3 py-1.5 text-xs w-44 sm:w-56 focus:outline-none focus:border-[#FF5A0A]"
            />
          </div>

          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={onClearFilters}
              className="btn-click px-2.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-[#1D2939] hover:bg-slate-700 rounded-lg border border-[#344054]/50 flex items-center gap-1"
            >
              <RotateCcw size={12} />
              Limpar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
