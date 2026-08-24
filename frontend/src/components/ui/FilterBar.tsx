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
    <div className="card-surface p-4 border border-[#94A3B8]/14 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Lado Esquerdo: Seleção de Campanha & Período */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-[#FF5A0A]" />
            <span className="text-xs font-semibold text-white whitespace-nowrap">Filtros Operacionais</span>
            {activeFiltersCount > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-[#FF5A0A]/15 text-[#FF5A0A] text-[11px] font-bold border border-[#FF5A0A]/30">
                {activeFiltersCount} ativo{activeFiltersCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Selector de Campanha */}
          <select
            value={selectedCampaignId ?? ''}
            onChange={(e) => onSelectCampaign(e.target.value ? Number(e.target.value) : null)}
            className="input-field px-3 py-1.5 text-xs font-medium cursor-pointer max-w-[260px] truncate"
          >
            <option value="">Todas as Campanhas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.id} - {c.name}
              </option>
            ))}
          </select>

          {/* Selector de Período */}
          <div className="flex items-center gap-1 bg-[#050814] p-1 rounded-xl border border-[#94A3B8]/14">
            {[
              { id: 'today', label: 'Hoje' },
              { id: '7d', label: '7 Dias' },
              { id: '30d', label: '30 Dias' },
              { id: 'all', label: 'Tudo' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPeriod(p.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                  period === p.id
                    ? 'bg-[#FF5A0A] text-white font-semibold shadow-sm'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Selector de Status da Chamada */}
          <div className="flex items-center gap-1 bg-[#050814] p-1 rounded-xl border border-[#94A3B8]/14">
            {[
              { id: 'all', label: 'Todos Status' },
              { id: 'formalize', label: 'Formalizado' },
              { id: 'schedule', label: 'Agendado' },
              { id: 'zero', label: 'Sem Acordo' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectStatusFilter(s.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                  statusFilter === s.id
                    ? 'bg-[#FF5A0A] text-white font-semibold shadow-sm'
                    : 'text-[#94A3B8] hover:text-white'
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
            <Search size={14} className="absolute left-3 top-2.5 text-[#94A3B8]" />
            <input
              type="text"
              placeholder="Buscar CPF, Telefone..."
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              className="input-field pl-8 pr-3 py-1.5 text-xs w-44 sm:w-56"
            />
          </div>

          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={onClearFilters}
              className="btn-click px-2.5 py-1.5 text-xs font-semibold text-[#94A3B8] hover:text-white bg-[#151C2B] hover:bg-[#1A2334] rounded-xl border border-[#94A3B8]/20 flex items-center gap-1.5"
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
