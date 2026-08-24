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
    <div className="rounded-xl bg-white p-3 border border-[#E5E7EB] shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Lado Esquerdo: Seleção de Campanha & Período */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-[#D9480F]" />
            <span className="text-xs font-semibold text-[#18181B] whitespace-nowrap">Filtros:</span>
            {activeFiltersCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#FFF1E8] text-[#B9380B] text-[11px] font-semibold border border-[#FFD1B8]">
                {activeFiltersCount} ativo{activeFiltersCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Selector de Campanha */}
          <select
            value={selectedCampaignId ?? ''}
            onChange={(e) => onSelectCampaign(e.target.value ? Number(e.target.value) : null)}
            className="bg-white text-[#18181B] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-xs font-medium cursor-pointer max-w-[240px] truncate focus:outline-none focus:border-[#D9480F] focus:ring-2 focus:ring-[#D9480F]/14 transition-all"
          >
            <option value="">Todas as Campanhas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.id} - {c.name}
              </option>
            ))}
          </select>

          {/* Selector de Período */}
          <div className="flex items-center gap-1 bg-[#F8F9FB] p-1 rounded-lg border border-[#E5E7EB]">
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
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  period === p.id
                    ? 'bg-[#FFF1E8] text-[#B9380B] font-bold border border-[#FFD1B8]'
                    : 'text-[#5F6570] hover:text-[#18181B] hover:bg-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Selector de Status da Chamada */}
          <div className="flex items-center gap-1 bg-[#F8F9FB] p-1 rounded-lg border border-[#E5E7EB]">
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
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === s.id
                    ? 'bg-[#FFF1E8] text-[#B9380B] font-bold border border-[#FFD1B8]'
                    : 'text-[#5F6570] hover:text-[#18181B] hover:bg-white'
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
            <Search size={13} className="absolute left-2.5 top-2.5 text-[#8B92A0]" />
            <input
              type="text"
              placeholder="Buscar CPF, Telefone..."
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              className="bg-white text-[#18181B] border border-[#E5E7EB] rounded-lg pl-8 pr-3 py-1.5 text-xs w-44 sm:w-56 focus:outline-none focus:border-[#D9480F] focus:ring-2 focus:ring-[#D9480F]/14 transition-all"
            />
          </div>

          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={onClearFilters}
              className="btn-click px-2.5 py-1.5 text-xs font-semibold text-[#5F6570] hover:text-[#18181B] bg-[#FAFAFA] hover:bg-[#E5E7EB] rounded-lg border border-[#E5E7EB] flex items-center gap-1"
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
