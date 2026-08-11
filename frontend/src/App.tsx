import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import {
  BarChart3,
  FileText,
  Pause,
  PhoneCall,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  Settings as SettingsIcon,
  ChevronRight,
  Filter,
  Download,
  X,
  Volume2,
  MessageSquare,
  PhoneOff,
  Clock,
  Award,
  Calendar,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { prepareImportFile } from './lib/importFile';
import './index.css';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const apiUrl = (path: string) => `${basePath}/api/v2${path}`;

function getToken(): string {
  return localStorage.getItem('callcenter_api_token') || '';
}

async function apiFetch(path: string, init: RequestInit = {}) {
  let token = getToken();
  if (!token) {
    token = window.prompt('Informe o token administrativo:') || '';
    if (token) localStorage.setItem('callcenter_api_token', token);
  }

  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    headers,
    cache: init.cache ?? 'no-store',
  });

  if (response.status === 401) {
    localStorage.removeItem('callcenter_api_token');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Erro ao consultar a API');
  }

  return data;
}

type Campaign = {
  id: number;
  name: string;
  status: string;
  assistant_id: string;
  max_concurrent: number;
  total_calls: number;
  pending_calls: number;
  active_calls: number;
  completed_calls: number;
  failed_calls: number;
  skipped_calls: number;
  total_leads: number;
  max_attempts?: number;
  answered_calls?: number;
  formalized_calls?: number;
  scheduled_calls?: number;
  zero_calls?: number;
  total_duration_seconds?: number;
  avg_duration_seconds?: number;
};

type CallRow = {
  id: number;
  campaign_id?: number;
  provider_call_id?: string | null;
  customer_number: string;
  cpf?: string | null;
  status: string;
  decision?: string | null;
  ended_reason?: string | null;
  attempts: number;
  updated_at?: string | null;
  transcript?: string | null;
  recording_url?: string | null;
  duration_seconds?: number | null;
  last_error?: string | null;
};

type VapiConfig = {
  operation: string;
  assistant: { id: string; name: string };
  phoneNumber: { id: string; number: string };
};

type ImportError = {
  line: number;
  reason: string;
  cpf?: string;
  telefone?: string;
};

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  
  if (normalized === 'running') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
        Ativa
      </span>
    );
  }
  
  if (normalized === 'paused') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400 border border-amber-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
        Pausada
      </span>
    );
  }

  if (normalized === 'completed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
        Concluída
      </span>
    );
  }

  if (normalized === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-400 border border-rose-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-400"></span>
        Falhou
      </span>
    );
  }

  if (normalized === 'queued' || normalized === 'in_progress' || normalized === 'answered') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-0.5 text-xs font-semibold text-violet-400 border border-violet-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse"></span>
        Em Linha
      </span>
    );
  }

  if (normalized === 'skipped') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-2.5 py-0.5 text-xs font-semibold text-slate-400 border border-slate-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
        Pulado
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-2.5 py-0.5 text-xs font-semibold text-slate-300 border border-slate-500/20">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
      {status}
    </span>
  );
}

function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [decisionFilter, setDecisionFilter] = useState<string>('all');
  const [selectedCall, setSelectedCall] = useState<CallRow | null>(null);
  const [callsPage, setCallsPage] = useState(1);
  const [terminatingCallId, setTerminatingCallId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  async function terminateCall(providerCallId: string, event: React.MouseEvent) {
    event.stopPropagation(); // Prevent opening modal
    const confirmed = window.confirm('Deseja realmente desligar esta chamada ativa?');
    if (!confirmed) return;

    setTerminatingCallId(providerCallId);
    try {
      await apiFetch(`/calls/${providerCallId}/terminate`, { method: 'POST' });
      await load({ silent: true });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Erro ao encerrar chamada');
    } finally {
      setTerminatingCallId(null);
    }
  }

  async function load(options: { silent?: boolean } = {}) {
    if (!options.silent) setLoading(true);
    setError('');

    try {
      const result = await apiFetch(`/campaigns?limit=100&_=${Date.now()}`);
      const nextCampaigns = Array.isArray(result.data) ? result.data : [];
      setCampaigns(nextCampaigns);
      setLastUpdatedAt(new Date());

      if (selectedId) {
        const stillExists = nextCampaigns.some(
          (campaign: Campaign) => campaign.id === selectedId,
        );

        if (stillExists) {
          const callsResult = await apiFetch(
            `/campaigns/${selectedId}/calls?page=${callsPage}&limit=100&decision=${decisionFilter}&search=${searchQuery}&_=${Date.now()}`,
          );
          setCalls(Array.isArray(callsResult.data) ? callsResult.data : []);
        } else {
          setSelectedId(null);
          setCalls([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar campanhas');
    } finally {
      if (!options.silent) setLoading(false);
    }
  }

  async function loadCalls(id: number, page: number = 1) {
    setSelectedId(id);
    setCallsPage(page);
    const result = await apiFetch(`/campaigns/${id}/calls?page=${page}&limit=100&decision=${decisionFilter}&search=${searchQuery}&_=${Date.now()}`);
    setCalls(Array.isArray(result.data) ? result.data : []);
  }

  async function changeStatus(id: number, status: string) {
    try {
      await apiFetch(`/campaigns/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Erro ao alterar campanha');
    }
  }

  async function deleteCampaign(campaign: Campaign) {
    const activeCalls = Number(campaign.active_calls || 0);
    if (campaign.status === 'running' || activeCalls > 0) {
      window.alert(
        'Pause a campanha e aguarde o encerramento das chamadas ativas antes de excluir.',
      );
      return;
    }

    const confirmed = window.confirm(
      `Excluir definitivamente a campanha "${campaign.name}" e todos os contatos/resultados vinculados?`,
    );
    if (!confirmed) return;

    setDeletingId(campaign.id);
    try {
      await apiFetch(`/campaigns/${campaign.id}`, { method: 'DELETE' });
      if (selectedId === campaign.id) {
        setSelectedId(null);
        setCalls([]);
      }
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Erro ao excluir campanha');
    } finally {
      setDeletingId(null);
    }
  }

  async function importFile(id: number, file?: File) {
    if (!file) return;

    try {
      const preparedFile = await prepareImportFile(file);
      const form = new FormData();
      form.append('file', preparedFile);

      const result = await apiFetch(`/campaigns/${id}/import`, {
        method: 'POST',
        body: form,
      });

      const errors = Array.isArray(result.errors)
        ? (result.errors as ImportError[])
        : [];
      const details = errors.length
        ? `\n\nMotivos:\n${errors
            .slice(0, 10)
            .map((item) => `Linha ${item.line}: ${item.reason}`)
            .join('\n')}`
        : '';

      window.alert(
        `Inseridos com sucesso: ${result.inserted} | Contatos ignorados: ${result.ignored}${details}`,
      );

      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Erro ao importar arquivo');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    let eventSource: EventSource | null = null;

    try {
      const streamUrl = apiUrl('/stream');
      eventSource = new EventSource(streamUrl);

      eventSource.addEventListener('call_updated', () => {
        void load({ silent: true });
      });

      eventSource.addEventListener('campaign_updated', () => {
        void load({ silent: true });
      });
    } catch (err) {
      console.warn('[SSE] EventSource error:', err);
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [selectedId]);

  useEffect(() => {
    const hasRunningCampaign = campaigns.some((campaign) => campaign.status === 'running');
    if (!hasRunningCampaign) return;

    const interval = window.setInterval(() => {
      void load({ silent: true });
    }, 5_000);

    return () => window.clearInterval(interval);
  }, [campaigns, selectedId]);

  useEffect(() => {
    if (selectedId) {
      void loadCalls(selectedId, callsPage);
    }
  }, [selectedId, decisionFilter, callsPage, searchQuery]);

  // Helper para formatar segundos em mm:ss
  const formatDuration = (totalSec: number) => {
    if (!totalSec || isNaN(totalSec) || totalSec <= 0) return '00:00';
    const mins = Math.floor(totalSec / 60);
    const secs = Math.round(totalSec % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Estatísticas gerais das campanhas
  const stats = useMemo(() => {
    const raw = campaigns.reduce(
      (acc, item) => ({
        campaigns: acc.campaigns + 1,
        leads: acc.leads + Number(item.total_leads || 0),
        calls: acc.calls + Number(item.total_calls || 0),
        active: acc.active + Number(item.active_calls || 0),
        completed: acc.completed + Number(item.completed_calls || 0),
        pending: acc.pending + Number(item.pending_calls || 0),
        failed: acc.failed + Number(item.failed_calls || 0),
        answered: acc.answered + Number(item.answered_calls || 0),
        formalized: acc.formalized + Number(item.formalized_calls || 0),
        scheduled: acc.scheduled + Number(item.scheduled_calls || 0),
        totalDuration: acc.totalDuration + Number(item.total_duration_seconds || 0),
      }),
      {
        campaigns: 0, leads: 0, calls: 0, active: 0, completed: 0, pending: 0, failed: 0,
        answered: 0, formalized: 0, scheduled: 0, totalDuration: 0,
      },
    );

    const attemptedCalls = raw.completed + raw.failed + raw.active + raw.answered;
    const effectiveCalls = Math.max(raw.calls, attemptedCalls);

    const pickupRate = effectiveCalls > 0
      ? ((raw.answered / effectiveCalls) * 100).toFixed(1)
      : '0.0';

    const conversionRate = raw.answered > 0
      ? ((raw.formalized / raw.answered) * 100).toFixed(1)
      : '0.0';

    const avgDurationSec = raw.answered > 0
      ? Math.round(raw.totalDuration / raw.answered)
      : 0;

    return {
      ...raw,
      pickupRate,
      conversionRate,
      avgDurationFormatted: formatDuration(avgDurationSec),
    };
  }, [campaigns]);

  // Agregações de chamadas para gráficos
  const chartStatusData = useMemo(() => {
    return [
      { name: 'Pendente', value: stats.pending, color: '#6366F1' },     // Indigo
      { name: 'Em Linha', value: stats.active, color: '#A855F7' },      // Violet
      { name: 'Concluído', value: stats.completed, color: '#22C55E' },   // Green
      { name: 'Falhado', value: stats.failed, color: '#EF4444' },       // Rose
    ].filter(item => item.value > 0);
  }, [stats]);

  // Agregação de decisões da campanha selecionada
  const selectedCampaignDecisions = useMemo(() => {
    if (!selectedId || !calls.length) return [];
    
    const decisions = calls.reduce(
      (acc, call) => {
        const dec = call.decision || 'no_decision';
        acc[dec] = (acc[dec] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return [
      { name: 'Formalizado', value: decisions.formalize || 0, color: '#FF5706' }, // Orange DDM
      { name: 'Agendado', value: decisions.schedule || 0, color: '#F59E0B' },     // Amber
      { name: 'Sem Acordo', value: decisions.zero || 0, color: '#EF4444' },       // Rose
      { name: 'Pendente/Outros', value: decisions.no_decision || 0, color: '#64748B' }, // Slate
    ].filter(item => item.value > 0);
  }, [selectedId, calls]);

  // Filtragem de contatos listados da campanha selecionada
  const filteredCalls = useMemo(() => {
    if (decisionFilter === 'all') return calls;
    if (decisionFilter === 'pending') return calls.filter(c => !c.decision && c.status !== 'completed');
    if (decisionFilter === 'answered') return calls.filter(c => (c.duration_seconds && c.duration_seconds > 0) || c.status === 'answered');
    if (decisionFilter === 'no_debt') return calls.filter(c => c.status === 'skipped' && c.last_error === 'no_debt');
    return calls.filter(c => c.decision === decisionFilter);
  }, [calls, decisionFilter]);

  const [exporting, setExporting] = useState(false);

  const exportToCsv = async () => {
    if (!selectedId) return;
    setExporting(true);
    try {
      const decisionParam = decisionFilter !== 'all' ? `&decision=${decisionFilter}` : '';
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
      const response = await fetch(apiUrl(`/campaigns/${selectedId}/export?${decisionParam}${searchParam}`), {
        headers: {
          'Authorization': `Bearer ${getToken()}`,
        }
      });
      if (!response.ok) throw new Error('Falha ao exportar relatório do servidor');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `relatorio_campanha_${selectedId}.csv`);
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Erro ao exportar CSV');
    } finally {
      setExporting(false);
    }
  };

  // Gráfico de Barras de desempenho das Campanhas
  const chartCampaignPerformance = useMemo(() => {
    return campaigns.slice(0, 5).map(c => ({
      name: c.name.length > 15 ? c.name.slice(0, 15) + '...' : c.name,
      'Concluídas': c.completed_calls,
      'Total': c.total_calls,
    }));
  }, [campaigns]);

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getRelativeTime = (lastDate: Date | null, currentDate: Date) => {
    if (!lastDate) return 'Aguardando sincronismo...';
    const diffSec = Math.max(0, Math.floor((currentDate.getTime() - lastDate.getTime()) / 1000));
    if (diffSec < 5) return 'Sincronizado agora mesmo';
    if (diffSec < 60) return `Sincronizado há ${diffSec}s atrás`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Sincronizado há ${diffMin} ${diffMin === 1 ? 'min' : 'mins'} atrás`;
    const diffHours = Math.floor(diffMin / 60);
    return `Sincronizado há ${diffHours}h atrás`;
  };
  const selectedCampaign = campaigns.find(c => c.id === selectedId);

  return (
    <div className="space-y-6">
      {/* Top Banner de Monitoramento */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-glass border-glass p-6 shadow-2xl">
        <div className="space-y-2">
          <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            Dashboard
            <span className="text-gradient">DDM Call Center</span>
          </h2>
          <p className="text-slate-400 text-sm">Operação automatizada de acordos e discagem via Vapi</p>
          
          <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
            <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-emerald-400 font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Tempo Real</span>
              <span className="text-slate-400 font-mono text-[11px] ml-1">[{now.toLocaleTimeString('pt-BR')}]</span>
            </div>

            {lastUpdatedAt && (
              <p className="text-slate-400 flex items-center gap-1.5 font-medium">
                <RefreshCw size={12} className="text-slate-500" />
                {getRelativeTime(lastUpdatedAt, now)}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="btn-click flex items-center gap-2 rounded-xl border border-glass bg-slate-800/40 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Sincronizando...' : 'Sincronizar'}
          </button>

          <a
            href="/modelo_importacao.csv"
            download="modelo_importacao.csv"
            className="btn-click flex items-center gap-2 rounded-xl border border-glass bg-slate-800/40 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
          >
            <Download size={16} />
            Planilha Modelo
          </a>

          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="btn-click flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-hover shadow-lg shadow-primary/20"
          >
            <Plus size={16} />
            Nova Campanha
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-450 flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Cartões de Indicadores de Performance (KPIs Principais) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Taxa de Alô (% Atendimento)',
            value: `${stats.pickupRate}%`,
            description: `${stats.answered.toLocaleString('pt-BR')} chamadas atendidas`,
            icon: PhoneCall,
            color: 'text-emerald-400',
            bg: 'from-emerald-500/10 to-emerald-500/2',
          },
          {
            label: 'Conversão (Formalizados)',
            value: `${stats.conversionRate}%`,
            description: `${stats.formalized.toLocaleString('pt-BR')} acordos fechados`,
            icon: Award,
            color: 'text-orange-400',
            bg: 'from-orange-500/10 to-orange-500/2',
          },
          {
            label: 'Duração Média (AHT)',
            value: stats.avgDurationFormatted,
            description: 'tempo médio de conversa',
            icon: Clock,
            color: 'text-cyan-400',
            bg: 'from-cyan-500/10 to-cyan-500/2',
          },
          {
            label: 'Retornos Agendados',
            value: stats.scheduled,
            description: 'pedidos de rechamada',
            icon: Calendar,
            color: 'text-amber-400',
            bg: 'from-amber-500/10 to-amber-500/2',
          },
          {
            label: 'Total de Leads (CPFs)',
            value: stats.leads,
            description: `${stats.calls.toLocaleString('pt-BR')} telefones cadastrados`,
            icon: FileText,
            color: 'text-indigo-400',
            bg: 'from-indigo-500/10 to-indigo-500/2',
          },
          {
            label: 'Chamadas Ativas',
            value: stats.active,
            description: 'em linha simultaneamente',
            icon: Activity,
            color: 'text-emerald-400',
            bg: 'from-emerald-500/10 to-emerald-500/2',
            glow: stats.active > 0 ? 'indicator-glow' : '',
            pulse: stats.active > 0,
          },
          {
            label: 'Finalizados (Fila)',
            value: stats.completed,
            description: 'processados na fila',
            icon: CheckCircle2,
            color: 'text-primary',
            bg: 'from-orange-500/10 to-orange-500/2',
          },
          {
            label: 'Não Atendidos / Erros',
            value: stats.failed,
            description: 'falhas ou indisponíveis',
            icon: XCircle,
            color: 'text-rose-400',
            bg: 'from-rose-500/10 to-rose-500/2',
          },
        ].map((item, idx) => (
          <div
            key={idx}
            className={`relative overflow-hidden rounded-2xl bg-glass border-glass p-6 bg-gradient-to-br ${item.bg} flex items-center justify-between transition-all duration-300 bg-glass-hover`}
          >
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{item.label}</p>
              <div className="flex items-center gap-2">
                <p className="text-3xl font-extrabold text-white">{item.value}</p>
                {item.pulse && (
                  <span className="flex h-3 w-3 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className={`relative inline-flex rounded-full h-3 w-3 bg-emerald-500 ${item.glow}`}></span>
                  </span>
                )}
              </div>
              {'description' in item && item.description && (
                <p className="text-[11px] text-slate-400 font-medium">{item.description}</p>
              )}
            </div>
            <div className={`p-3 rounded-xl bg-slate-900/40 border border-glass ${item.color}`}>
              <item.icon size={24} />
            </div>
          </div>
        ))}
      </div>

      {/* Seção de Gráficos Analíticos */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Gráfico 1: Status de Fila Geral ou Decisões da Campanha Selecionada */}
        <div className="rounded-2xl bg-glass border-glass p-6 flex flex-col justify-between min-h-[350px]">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Activity size={18} className="text-primary" />
              {selectedId ? `Resultados da Campanha #${selectedId}` : 'Distribuição de Status de Contatos Geral'}
            </h3>
            <p className="text-xs text-slate-400">
              {selectedId ? 'Proporção de acordos e agendamentos fechados nesta campanha' : 'Visualização geral dos contatos do banco'}
            </p>
          </div>

          <div className="h-60 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              {selectedId && selectedCampaignDecisions.length > 0 ? (
                <PieChart>
                  <Pie
                    data={selectedCampaignDecisions}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {selectedCampaignDecisions.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0B0F19', borderColor: '#334155', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              ) : !selectedId && chartStatusData.length > 0 ? (
                <PieChart>
                  <Pie
                    data={chartStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {chartStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0B0F19', borderColor: '#334155', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-2">
                  <HelpCircle size={32} />
                  <span>Sem dados suficientes para gerar gráfico de resultados.</span>
                </div>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 2: Desempenho Comparativo de Campanhas */}
        <div className="rounded-2xl bg-glass border-glass p-6 flex flex-col justify-between min-h-[350px]">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <BarChart3 size={18} className="text-indigo-400" />
              Desempenho de Campanhas Recentes
            </h3>
            <p className="text-xs text-slate-400">Contatos processados (Concluídos) em relação ao total importado</p>
          </div>

          <div className="h-60 mt-4">
            {chartCampaignPerformance.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartCampaignPerformance} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0B0F19', borderColor: '#334155', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Legend />
                  <Bar dataKey="Concluídas" fill="#22C55E" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Total" fill="rgba(255,255,255,0.15)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-2">
                <HelpCircle size={32} />
                <span>Crie e processe campanhas para visualizar dados de desempenho.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabela de Campanhas Ativas */}
      <div className="overflow-hidden rounded-2xl bg-glass border-glass shadow-2xl">
        <div className="border-b border-glass bg-slate-900/40 px-6 py-4">
          <h3 className="text-lg font-bold text-white">Lista de Campanhas</h3>
          <p className="text-xs text-slate-400">Gerenciamento de status, importação e ações das filas</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-900/60 text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-glass">
              <tr>
                {['Campanha', 'Status', 'Fila/Pendentes', 'Ativas', 'Atendidas', 'Concluídas', 'Falhas', 'Ações'].map((header) => (
                  <th key={header} className="px-6 py-4">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-glass text-sm text-slate-300">
              {campaigns.map((campaign) => {
                const deleteBlocked = campaign.status === 'running'
                  || Number(campaign.active_calls || 0) > 0;
                const isSelected = selectedId === campaign.id;

                return (
                  <tr
                    key={campaign.id}
                    className={`hover:bg-slate-900/20 transition-all ${isSelected ? 'bg-primary/5 hover:bg-primary/10' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <button
                          onClick={() => void loadCalls(campaign.id)}
                          className="flex items-center gap-1 font-bold text-white hover:text-primary transition-all text-left"
                        >
                          {campaign.name}
                          <ChevronRight size={14} className={`text-slate-500 transition-transform ${isSelected ? 'rotate-90 text-primary' : ''}`} />
                        </button>
                        <p className="text-[10px] text-slate-400 mt-0.5 ml-0.5">
                          {Number(campaign.total_leads || 0).toLocaleString('pt-BR')} CPFs • {Number(campaign.total_calls || 0).toLocaleString('pt-BR')} números
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4"><StatusBadge status={campaign.status} /></td>
                    <td className="px-6 py-4 font-medium text-indigo-300">{Number(campaign.pending_calls || 0)}</td>
                    <td className="px-6 py-4 font-medium text-emerald-400">{Number(campaign.active_calls || 0)}</td>
                    <td className="px-6 py-4 font-semibold text-emerald-300">{Number(campaign.answered_calls || 0)}</td>
                    <td className="px-6 py-4 font-medium text-primary">{Number(campaign.completed_calls || 0)}</td>
                    <td className="px-6 py-4 font-medium text-rose-400">{Number(campaign.failed_calls || 0)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {campaign.status !== 'running' ? (
                          <button
                            type="button"
                            title="Iniciar campanha"
                            onClick={() => void changeStatus(campaign.id, 'running')}
                            className="btn-click rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 p-2 text-emerald-400 border border-emerald-500/20"
                          >
                            <Play size={15} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            title="Pausar campanha"
                            onClick={() => void changeStatus(campaign.id, 'paused')}
                            className="btn-click rounded-lg bg-amber-500/10 hover:bg-amber-500/20 p-2 text-amber-400 border border-amber-500/20"
                          >
                            <Pause size={15} />
                          </button>
                        )}

                        <label
                          title="Importar contatos (CSV / Excel)"
                          className="btn-click cursor-pointer rounded-lg bg-slate-800 border border-glass hover:bg-slate-700 p-2 text-slate-200"
                        >
                          <UploadCloud size={15} />
                          <input
                            className="hidden"
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={(event) => void importFile(campaign.id, event.target.files?.[0])}
                          />
                        </label>

                        <button
                          type="button"
                          title="Editar configurações"
                          onClick={() => setEditingCampaign(campaign)}
                          className="btn-click rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 p-2 text-indigo-400 border border-indigo-500/20"
                        >
                          <SettingsIcon size={15} />
                        </button>

                        <button
                          type="button"
                          title={deleteBlocked
                            ? 'Pause a campanha e aguarde as chamadas ativas'
                            : 'Excluir campanha'}
                          disabled={deleteBlocked || deletingId === campaign.id}
                          onClick={() => void deleteCampaign(campaign)}
                          className="btn-click rounded-lg bg-rose-500/10 hover:bg-rose-500/20 p-2 text-rose-400 border border-rose-500/20 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!campaigns.length && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    {loading ? 'Carregando registros...' : 'Nenhuma campanha cadastrada.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monitor de Chamadas da Campanha Selecionada */}
      {selectedId && (
        <div className="rounded-2xl bg-glass border-glass shadow-2xl overflow-hidden animate-slide-in">
          <div className="bg-slate-900/40 px-6 py-5 border-b border-glass flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Contatos da Campanha #{selectedId}
                {selectedCampaign && (
                  <span className="text-xs font-normal px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {selectedCampaign.answered_calls || 0} Atendidas
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                {selectedCampaign ? (
                  `${selectedCampaign.completed_calls || 0} discadas de ${selectedCampaign.total_calls || 0} contatos importados`
                ) : (
                  'Total de contatos importados e status de discagem'
                )}
              </p>
            </div>

            {/* Filtros de Decisão do Acordo */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 mr-3 bg-slate-950/20 px-2 py-1 rounded-lg border border-glass">
                <input
                  type="text"
                  placeholder="Buscar CPF, Telefone ou Nome..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setCallsPage(1);
                      setSearchQuery(searchInput);
                    }
                  }}
                  className="bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none w-44 sm:w-52"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setCallsPage(1);
                      setSearchQuery('');
                    }}
                    className="text-[10px] text-slate-400 hover:text-white bg-slate-800 px-1.5 py-0.5 rounded transition-all"
                  >
                    Limpar
                  </button>
                )}
              </div>

              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Filter size={12} />
                Filtrar por:
              </span>
              {[
                { label: 'Todos', value: 'all' },
                { label: 'Formalizado', value: 'formalize' },
                { label: 'Agendado', value: 'schedule' },
                { label: 'Atendidas', value: 'answered' },
                { label: 'Sem Acordo', value: 'zero' },
                { label: 'Sem Débito', value: 'no_debt' },
                { label: 'Pendente', value: 'pending' },
              ].map(f => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => {
                    setCallsPage(1);
                    setDecisionFilter(f.value);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all ${
                    decisionFilter === f.value
                      ? 'bg-primary text-white border-primary/50 shadow-md shadow-primary/10'
                      : 'bg-slate-800/60 text-slate-300 border-glass hover:bg-slate-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}

              <button
                type="button"
                disabled={exporting}
                onClick={exportToCsv}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all flex items-center gap-1.5 ml-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={13} className={exporting ? 'animate-spin' : ''} />
                {exporting ? 'Exportando...' : 'Exportar CSV'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/60 text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-glass sticky top-0 backdrop-blur-md">
                <tr>
                  {['Telefone', 'CPF', 'Status', 'Tentativas', 'Acordo / Decisão', 'Última Atualização', 'Ações'].map((header) => (
                    <th key={header} className="px-6 py-3">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-glass text-slate-300">
                {filteredCalls.map((call) => (
                  <tr
                    key={call.id}
                    onClick={() => setSelectedCall(call)}
                    className="hover:bg-slate-900/20 cursor-pointer transition-all"
                  >
                    <td className="px-6 py-3.5 font-medium">{call.customer_number}</td>
                    <td className="px-6 py-3.5 text-slate-400 font-mono">{call.cpf || '-'}</td>
                    <td className="px-6 py-3.5"><StatusBadge status={call.status} /></td>
                    <td className="px-6 py-3.5">
                      <span className="inline-flex items-center justify-center rounded-md bg-slate-800/80 px-2 py-0.5 text-xs font-semibold text-slate-200">
                        {call.attempts} / 5
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-semibold">
                      {call.decision === 'formalize' && (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 size={14} /> Formalizado
                        </span>
                      )}
                      {call.decision === 'schedule' && (
                        <span className="text-amber-400 flex items-center gap-1">
                          <AlertCircle size={14} /> Reagendado
                        </span>
                      )}
                      {call.decision === 'zero' && (
                        <span className="text-rose-400 flex items-center gap-1">
                          <XCircle size={14} />
                          {call.ended_reason === 'voicemail' 
                            ? 'Caixa Postal' 
                            : (!call.duration_seconds || call.duration_seconds === 0
                                ? 'Não Atendido'
                                : (call.duration_seconds <= 10 
                                    ? 'Atendeu e Desligou' 
                                    : 'Recusado/Sem Acordo'))}
                        </span>
                      )}
                      {call.status === 'skipped' ? (
                        <span className="text-slate-400 font-normal flex items-center gap-1">
                          <X size={14} className="text-slate-500" />
                          {call.last_error === 'already_has_agreement' && 'Já tem acordo ativo'}
                          {call.last_error === 'no_debt' && 'Sem débito em aberto'}
                          {call.last_error === 'cpf_missing' && 'CPF ausente'}
                          {!['already_has_agreement', 'no_debt', 'cpf_missing'].includes(call.last_error || '') && 'Não discado'}
                        </span>
                      ) : (
                        !call.decision && (
                          <span className="text-slate-500 font-normal">Aguardando</span>
                        )
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-slate-400 text-xs">
                      {call.updated_at ? new Date(call.updated_at).toLocaleString('pt-BR') : '-'}
                    </td>
                    <td className="px-6 py-3.5" onClick={(e) => e.stopPropagation()}>
                      {['reserved', 'queued', 'in_progress', 'answered'].includes(call.status) && call.provider_call_id ? (
                        <button
                          type="button"
                          title="Desligar chamada"
                          disabled={!!terminatingCallId}
                          onClick={(event) => void terminateCall(call.provider_call_id!, event)}
                          className="btn-click rounded-lg bg-rose-500/10 hover:bg-rose-500/20 p-1.5 text-rose-400 border border-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <PhoneOff size={13} className={terminatingCallId === call.provider_call_id ? 'animate-pulse' : ''} />
                        </button>
                      ) : (
                        <span className="text-slate-600 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))}

                {!filteredCalls.length && (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-slate-500">
                      Nenhum contato encontrado para o filtro selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-glass bg-slate-900/40">
            <button
              type="button"
              onClick={() => setCallsPage(p => Math.max(1, p - 1))}
              disabled={callsPage === 1}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-glass disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-400 font-semibold">Página {callsPage}</span>
            <button
              type="button"
              onClick={() => setCallsPage(p => p + 1)}
              disabled={calls.length < 100}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-glass disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      {/* Modal - Criação de Campanhas Premium */}
      {showCreate && (
        <CreateCampaign onClose={() => setShowCreate(false)} onCreated={() => load()} />
      )}

      {/* Modal - Edição de Campanhas */}
      {editingCampaign && (
        <CreateCampaign
          campaign={editingCampaign}
          onClose={() => setEditingCampaign(null)}
          onCreated={() => load()}
        />
      )}

      {/* Modal - Detalhes e Transcrição da Ligação */}
      {selectedCall && (
        <CallDetailsModal call={selectedCall} onClose={() => setSelectedCall(null)} />
      )}
    </div>
  );
}

function CallDetailsModal({ call, onClose }: { call: CallRow; onClose: () => void }) {
  const [cpfPhones, setCpfPhones] = useState<any[]>([]);
  const [loadingPhones, setLoadingPhones] = useState(false);

  useEffect(() => {
    if (call.cpf && call.campaign_id) {
      setLoadingPhones(true);
      apiFetch(`/campaigns/${call.campaign_id}/calls/cpf/${call.cpf}`)
        .then((res: any) => {
          setCpfPhones(Array.isArray(res) ? res : []);
        })
        .catch((err) => console.error('Erro ao buscar telefones do CPF:', err))
        .finally(() => setLoadingPhones(false));
    }
  }, [call.cpf, call.campaign_id]);

  const bubbles = useMemo(() => {
    if (!call.transcript) return [];
    
    const lines = call.transcript.split('\n');
    const list: { speaker: string; text: string; isAssistant: boolean }[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const match = trimmed.match(/^(assistant|user|bot|customer|system|júlia|devedor|cliente):\s*(.*)$/i);
      if (match) {
        const speaker = match[1].toLowerCase();
        const text = match[2];
        const isAssistant = ['assistant', 'bot', 'júlia', 'system'].includes(speaker);
        list.push({
          speaker: isAssistant ? 'Júlia (IA)' : 'Cliente',
          text,
          isAssistant,
        });
      } else {
        list.push({
          speaker: 'Conversa',
          text: trimmed,
          isAssistant: false,
        });
      }
    }
    return list;
  }, [call.transcript]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-4xl rounded-2xl border border-glass bg-slate-900 shadow-2xl overflow-hidden animate-scale-up flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="bg-slate-950/40 px-6 py-4 border-b border-glass flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <PhoneCall size={18} className="text-primary" />
              Detalhes da Ligação #{call.id}
            </h3>
            <p className="text-xs text-slate-400">CPF: {call.cpf || '-'} | Telefone: {call.customer_number}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 min-h-0">
          
          {/* Left Column: Stats & Audio */}
          <div className="space-y-5">
            <div className="rounded-xl border border-glass bg-slate-950/40 p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Informações Gerais</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-500 block text-xs">Status da Fila</span>
                  <span className="font-semibold text-white capitalize">
                    {call.status === 'skipped' ? 'Pulado' : call.status}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">Tentativas</span>
                  <span className="font-semibold text-white">{call.attempts} / 5</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">Duração</span>
                  <span className="font-semibold text-white">
                    {call.duration_seconds ? `${call.duration_seconds} segundos` : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs">Acordo / Decisão</span>
                  <span className="font-semibold">
                    {call.decision === 'formalize' && <span className="text-emerald-400">Formalizado</span>}
                    {call.decision === 'schedule' && <span className="text-amber-400">Reagendado</span>}
                    {call.decision === 'zero' && (
                      <span className="text-rose-400">
                        {call.ended_reason === 'voicemail' 
                          ? 'Caixa Postal' 
                          : (!call.duration_seconds || call.duration_seconds === 0
                              ? 'Não Atendido'
                              : (call.duration_seconds <= 10 
                                  ? 'Atendeu e Desligou' 
                                  : 'Recusado/Sem Acordo'))}
                      </span>
                    )}
                    {call.status === 'skipped' && (
                      <span className="text-slate-400">
                        {call.last_error === 'already_has_agreement' && 'Já tem acordo ativo'}
                        {call.last_error === 'no_debt' && 'Sem débito em aberto'}
                        {call.last_error === 'cpf_missing' && 'CPF ausente'}
                        {!['already_has_agreement', 'no_debt', 'cpf_missing'].includes(call.last_error || '') && 'Não discado'}
                      </span>
                    )}
                    {!call.decision && call.status !== 'skipped' && <span className="text-slate-400">Pendente</span>}
                  </span>
                </div>
              </div>
            </div>

            {/* Telefones deste CPF */}
            <div className="rounded-xl border border-glass bg-slate-950/40 p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Telefones Cadastrados (CPF)</h4>
              {loadingPhones ? (
                <p className="text-xs text-slate-400 animate-pulse">Carregando telefones...</p>
              ) : cpfPhones.length > 0 ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {cpfPhones.map((item) => {
                    const isCurrent = item.customer_number === call.customer_number;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between text-xs p-2 rounded-lg border ${
                          isCurrent
                            ? 'bg-primary/10 border-primary/40 text-primary font-bold'
                            : 'bg-slate-900/40 border-glass text-slate-300'
                        }`}
                      >
                        <span className="font-mono">{item.customer_number}</span>
                        <div className="flex items-center gap-1.5">
                          {item.attempts > 0 && (
                            <span className="text-[10px] text-slate-400 bg-slate-950/60 px-1.5 py-0.5 rounded">
                              {item.attempts} tent.
                            </span>
                          )}
                          <span className={`capitalize px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            item.status === 'completed'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : item.status === 'failed'
                              ? 'bg-rose-500/10 text-rose-450'
                              : item.status === 'skipped'
                              ? 'bg-slate-800 text-slate-400'
                              : 'bg-indigo-500/10 text-indigo-400'
                          }`}>
                            {item.status === 'skipped'
                              ? 'Pulado'
                              : item.status === 'completed'
                              ? item.decision === 'formalize'
                                ? 'Formalizado'
                                : item.decision === 'schedule'
                                ? 'Agendado'
                                : 'S/ Acordo'
                              : item.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Nenhum outro telefone encontrado.</p>
              )}
            </div>

            {/* Audio Player Card */}
            {call.recording_url ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 font-semibold">
                  <Volume2 size={14} /> Gravação do Áudio
                </h4>
                <audio 
                  src={call.provider_call_id 
                    ? apiUrl(`/calls/${call.provider_call_id}/recording?token=${getToken()}`) 
                    : call.recording_url || undefined} 
                  controls 
                  className="w-full mt-2 rounded-lg" 
                />
              </div>
            ) : (
              <div className="rounded-xl border border-glass bg-slate-950/20 p-4 text-center text-slate-500 text-sm">
                Nenhum áudio de gravação disponível para esta chamada.
              </div>
            )}

            {/* Last Error if exists */}
            {call.last_error && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400">Erro Registrado</h4>
                <p className="text-xs text-slate-300 font-mono break-all">{call.last_error}</p>
              </div>
            )}
          </div>

          {/* Right Column: Transcript */}
          <div className="rounded-xl border border-glass bg-slate-950/30 p-4 flex flex-col h-full min-h-0">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5 border-b border-glass pb-2 mb-3 font-semibold">
              <MessageSquare size={14} /> Transcrição da Conversa
            </h4>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0 max-h-[40vh] md:max-h-none">
              {bubbles.length > 0 ? (
                bubbles.map((bubble, i) => (
                  <div
                    key={i}
                    className={`flex flex-col ${bubble.isAssistant ? 'items-end' : 'items-start'}`}
                  >
                    <span className="text-[10px] text-slate-500 mb-0.5 px-1">{bubble.speaker}</span>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm ${
                        bubble.isAssistant
                          ? 'bg-primary text-white rounded-tr-none font-medium'
                          : 'bg-slate-800 text-slate-200 rounded-tl-none border border-glass'
                      }`}
                    >
                      {bubble.text}
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-10 text-center text-slate-500 text-sm gap-2">
                  <FileText size={24} />
                  <span>Nenhuma transcrição de texto disponível.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-950/40 px-6 py-4 border-t border-glass flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-glass bg-slate-800 px-5 py-2 text-slate-300 hover:bg-slate-700 text-sm font-semibold transition-all"
          >
            Fechar Detalhes
          </button>
        </div>

      </div>
    </div>
  );
}

function CreateCampaign({
  onClose,
  onCreated,
  campaign,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
  campaign?: Campaign;
}) {
  const [saving, setSaving] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState('');
  const [vapiConfig, setVapiConfig] = useState<VapiConfig | null>(null);

  useEffect(() => {
    let active = true;

    void apiFetch('/vapi/config')
      .then((result) => {
        if (active) setVapiConfig(result as VapiConfig);
      })
      .catch((err) => {
        if (active) {
          setConfigError(err instanceof Error ? err.message : 'Erro ao carregar configuração Vapi');
        }
      })
      .finally(() => {
        if (active) setLoadingConfig(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vapiConfig) return;

    const form = new FormData(event.currentTarget);
    setSaving(true);

    try {
      if (campaign) {
        // Edit Mode
        await apiFetch(`/campaigns/${campaign.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: form.get('name'),
            maxConcurrent: Number(form.get('maxConcurrent') || 1),
            maxAttempts: Number(form.get('maxAttempts') || 5),
          }),
        });
      } else {
        // Create Mode
        await apiFetch('/campaigns', {
          method: 'POST',
          body: JSON.stringify({
            name: form.get('name'),
            assistantId: vapiConfig.assistant.id,
            phoneNumberId: vapiConfig.phoneNumber.id,
            maxConcurrent: Number(form.get('maxConcurrent') || 1),
            maxAttempts: Number(form.get('maxAttempts') || 5),
          }),
        });
      }

      await onCreated();
      onClose();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Erro ao salvar campanha');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-lg space-y-4 rounded-2xl border border-glass bg-slate-900 p-6 shadow-2xl animate-scale-up"
      >
        <h3 className="text-xl font-bold text-white border-b border-glass pb-3">
          {campaign ? 'Editar Configurações da Campanha' : 'Criar Nova Campanha'}
        </h3>

        <div className="space-y-1">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Nome da Campanha</label>
          <input
            name="name"
            required
            defaultValue={campaign?.name}
            placeholder="Ex: Cobrança UVA Vencidos Julho"
            className="mt-1 w-full rounded-xl border border-glass bg-slate-950 px-3.5 py-2.5 text-white focus:outline-none focus:border-primary/50 transition-all text-sm"
          />
        </div>

        <div className="rounded-xl border border-glass bg-slate-950/60 p-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Agente de Voz & Telefonia</p>
          {loadingConfig && <p className="text-sm text-slate-400">Verificando dados Vapi...</p>}
          {configError && <p className="text-sm text-rose-400">{configError}</p>}
          {vapiConfig && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-slate-500">Assistente Virtual</p>
                <p className="font-semibold text-white">{vapiConfig.assistant.name}</p>
              </div>
              <div>
                <p className="text-slate-500">Telefone de Saída</p>
                <p className="font-semibold text-white">{vapiConfig.phoneNumber.number}</p>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Limitar Concorrência</label>
            <input
              name="maxConcurrent"
              required
              defaultValue={campaign ? String(campaign.max_concurrent) : '10'}
              min="1"
              type="number"
              className="mt-1 w-full rounded-xl border border-glass bg-slate-950 px-3.5 py-2.5 text-white focus:outline-none focus:border-primary/50 transition-all text-sm"
            />
            <p className="text-[10px] text-slate-500 mt-1 leading-normal">
              Recomendado: <b>30</b> chamadas simultâneas para evitar limites na Vapi e bloqueio de rotas SIP.
            </p>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Máximo Tentativas</label>
            <input
              name="maxAttempts"
              required
              defaultValue={campaign ? String(campaign.max_attempts ?? 5) : '5'}
              min="1"
              type="number"
              className="mt-1 w-full rounded-xl border border-glass bg-slate-950 px-3.5 py-2.5 text-white focus:outline-none focus:border-primary/50 transition-all text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-glass">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-glass bg-slate-800 px-4 py-2.5 text-slate-300 hover:bg-slate-700 text-sm font-semibold transition-all"
          >
            Cancelar
          </button>
          <button
            disabled={saving || loadingConfig || !vapiConfig}
            className="rounded-xl bg-primary hover:bg-primary-hover px-5 py-2.5 text-white font-bold text-sm transition-all disabled:opacity-40"
          >
            {saving ? 'Salvando...' : campaign ? 'Salvar Alterações' : 'Iniciar Campanha'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Settings() {
  const [token, setToken] = useState(getToken());

  return (
    <div className="max-w-xl rounded-2xl bg-glass border-glass p-6 shadow-2xl space-y-6">
      <div className="border-b border-glass pb-4">
        <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
          <SettingsIcon size={24} className="text-primary" />
          Configurações do Painel
        </h2>
        <p className="text-xs text-slate-400">Gerencie tokens e acessos administrativos deste navegador</p>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Token Administrativo (API Bearer)</label>
        <input
          value={token}
          type="password"
          onChange={(event) => setToken(event.target.value)}
          placeholder="Cole seu token de autenticação administrativa aqui"
          className="mt-2 w-full rounded-xl border border-glass bg-slate-950 px-3.5 py-2.5 text-white focus:outline-none focus:border-primary/50 transition-all text-sm font-mono"
        />
        <p className="text-xs text-slate-500">Este token é salvo no armazenamento local do seu navegador para assinar as requisições.</p>
      </div>

      <button
        type="button"
        onClick={() => {
          localStorage.setItem('callcenter_api_token', token);
          window.alert('Token administrativo salvo com sucesso neste navegador!');
        }}
        className="btn-click rounded-xl bg-primary hover:bg-primary-hover px-6 py-3 font-bold text-sm text-white shadow-lg shadow-primary/20"
      >
        Salvar Configurações
      </button>
    </div>
  );
}

function Sidebar() {
  const location = useLocation();
  const links = [
    ['/', 'Painel Geral', BarChart3],
    ['/configuracoes', 'Configurações', SettingsIcon],
  ] as const;

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r border-glass bg-slate-950 text-slate-300 flex flex-col justify-between p-6">
      <div className="space-y-8">
        <div className="flex items-center gap-2.5 py-2">
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <PhoneCall size={20} />
          </div>
          <span className="font-extrabold text-white text-base tracking-wide flex flex-col">
            UVA Call Center
            <span className="text-[10px] text-slate-400 font-normal">Painel Grupo DDM</span>
          </span>
        </div>

        <nav className="space-y-1">
          {links.map(([path, label, Icon]) => (
            <Link
              key={path}
              to={path}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                location.pathname === path
                  ? 'bg-primary text-white shadow-lg shadow-primary/15'
                  : 'hover:bg-slate-900/50 hover:text-white text-slate-400 border border-transparent hover:border-glass'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="rounded-xl border border-glass bg-slate-900/30 p-4 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Versão da Operação</p>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-xs font-semibold text-white">v2.1 (Vapi Direct)</span>
        </div>
      </div>
    </aside>
  );
}

export default function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <BrowserRouter basename={basePath || '/'}>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex">
        <Sidebar />
        <main className="ml-64 p-8 flex-1 min-w-0 max-w-[1600px] mx-auto space-y-6">
          <Routes>
            <Route path="/" element={<Campaigns />} />
            <Route path="/configuracoes" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
