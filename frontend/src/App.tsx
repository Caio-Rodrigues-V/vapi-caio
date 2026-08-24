import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
  Settings as SettingsIcon,
  Filter,
  Download,
  X,
  Volume2,
  MessageSquare,
  PhoneOff,
  Clock,
  Award,
  Calendar,
  Menu,
  Eye,
  Zap,
  ShieldCheck,
  Layers,
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
import { ThreeBackground } from './components/ThreeBackground';
import { MetricCard } from './components/ui/MetricCard';
import { FilterBar } from './components/ui/FilterBar';
import { EmptyState } from './components/ui/EmptyState';
import { ErrorState } from './components/ui/ErrorState';
import { LiveClock } from './components/ui/LiveClock';
import { gsap } from 'gsap';
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
  metadata?: Record<string, any> | null;
};

type AssistantItem = { id: string; name: string; institution?: string };

type VapiConfig = {
  operation: string;
  assistant: { id: string; name: string };
  assistants?: AssistantItem[];
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
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 border border-emerald-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
        Ativa
      </span>
    );
  }
  
  if (normalized === 'paused') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-400 border border-amber-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
        Pausada
      </span>
    );
  }

  if (normalized === 'completed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-400 border border-blue-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
        Concluída
      </span>
    );
  }

  if (normalized === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-400 border border-rose-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-400"></span>
        Falhou
      </span>
    );
  }

  if (normalized === 'queued' || normalized === 'in_progress' || normalized === 'answered') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-400 border border-violet-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-400"></span>
        Em Linha
      </span>
    );
  }

  if (normalized === 'skipped') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-400 border border-slate-700">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
        Pulado
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300 border border-slate-700">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
      {status}
    </span>
  );
}

function Campaigns() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isCampaignRoute = location.pathname.startsWith('/campanhas');

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
  const [period, setPeriod] = useState<string>('all');

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

  // Sincroniza a campanha selecionada via URL (/campanhas?id=X)
  useEffect(() => {
    const urlId = searchParams.get('id');
    if (urlId) {
      const parsedId = Number(urlId);
      if (!isNaN(parsedId) && parsedId !== selectedId) {
        setSelectedId(parsedId);
      }
    } else if (isCampaignRoute && !selectedId && campaigns.length > 0) {
      setSelectedId(campaigns[0].id);
    } else if (!isCampaignRoute && selectedId !== null) {
      setSelectedId(null);
    }
  }, [searchParams, isCampaignRoute, campaigns, selectedId]);

  const selectedCampaign = campaigns.find(c => c.id === selectedId);

  // Helper para formatar segundos em mm:ss
  const formatDuration = (totalSec: number) => {
    if (!totalSec || isNaN(totalSec) || totalSec <= 0) return '00:00';
    const mins = Math.floor(totalSec / 60);
    const secs = Math.round(totalSec % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Estatísticas gerais das campanhas
  const stats = useMemo(() => {
    const raw = selectedId && selectedCampaign
      ? {
          campaigns: 1,
          leads: Number(selectedCampaign.total_leads || 0),
          calls: Number(selectedCampaign.total_calls || 0),
          active: Number(selectedCampaign.active_calls || 0),
          completed: Number(selectedCampaign.completed_calls || 0),
          pending: Number(selectedCampaign.pending_calls || 0),
          failed: Number(selectedCampaign.failed_calls || 0),
          answered: Number(selectedCampaign.answered_calls || 0),
          formalized: Number(selectedCampaign.formalized_calls || 0),
          scheduled: Number(selectedCampaign.scheduled_calls || 0),
          totalDuration: Number(selectedCampaign.total_duration_seconds || 0),
        }
      : campaigns.reduce(
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
  }, [campaigns, selectedId, selectedCampaign]);

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
    if (decisionFilter === 'active') return calls.filter(c => ['reserved', 'queued', 'in_progress', 'answered'].includes(c.status));
    if (decisionFilter === 'pending') return calls.filter(c => !c.decision && c.status !== 'completed' && !['reserved', 'queued', 'in_progress', 'answered'].includes(c.status));
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

  // Funil de Conversão Operacional do Planejamento
  const funnelData = useMemo(() => {
    return [
      { etapa: 'Base Importada', valor: stats.leads, fill: '#64748B' },
      { etapa: 'Discados', valor: stats.calls, fill: '#38BDF8' },
      { etapa: 'Atendidos (Alô)', valor: stats.answered, fill: '#10B981' },
      { etapa: 'Formalizados', valor: stats.formalized, fill: '#FF5A0A' },
    ];
  }, [stats]);

  useEffect(() => {
    gsap.fromTo(
      '.gsap-card',
      { opacity: 0, y: 20, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.06, ease: 'power2.out' }
    );
  }, [selectedId, campaigns.length]);

  const getRelativeTime = (lastDate: Date | null) => {
    if (!lastDate) return 'Aguardando sincronismo...';
    const diffSec = Math.max(0, Math.floor((Date.now() - lastDate.getTime()) / 1000));
    if (diffSec < 5) return 'Sincronizado agora mesmo';
    if (diffSec < 60) return `Sincronizado há ${diffSec}s atrás`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Sincronizado há ${diffMin} ${diffMin === 1 ? 'min' : 'mins'} atrás`;
    const diffHours = Math.floor(diffMin / 60);
    return `Sincronizado há ${diffHours}h atrás`;
  };

  // Rota /campanhas -> Renderiza a aba operacional "Campanhas & Disparador"
  if (isCampaignRoute) {
    return (
      <div className="space-y-5">
        {/* Header da Aba Campanhas & Disparador */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-[#111827] p-4 border border-[#1E293B]">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Play size={20} className="text-[#FF5A0A]" />
              Campanhas & Disparador
            </h2>
            <p className="text-xs text-slate-400">Gestão de lotes de cobrança, disparador automático Vapi e fila de contatos</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {campaigns.length > 0 && (
              <div className="flex items-center gap-2 bg-[#0B0F19] px-3 py-1.5 rounded-lg border border-[#1E293B]">
                <span className="text-xs text-slate-400 font-medium hidden sm:inline">Campanha:</span>
                <select
                  value={selectedId || ''}
                  onChange={(e) => setSelectedId(Number(e.target.value))}
                  className="bg-transparent text-slate-100 text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#0B0F19] text-slate-200">
                      #{c.id} - {c.name} ({Number(c.total_leads || 0).toLocaleString('pt-BR')} CPFs)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="btn-click inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#FF5A0A] hover:bg-[#EA580C] text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <Plus size={15} />
              Nova Campanha
            </button>
          </div>
        </div>

        {/* Tabela de Controle Operacional de Campanhas */}
        <div className="rounded-lg bg-[#111827] overflow-hidden border border-[#1E293B]">
          <div className="border-b border-[#1E293B] bg-[#0B0F19] px-5 py-3.5 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100">Lotes de Disparo</h3>
            <span className="text-xs text-slate-400 font-medium">{campaigns.length} campanhas cadastradas</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#0B0F19] text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#1E293B]">
                <tr>
                  {['Campanha', 'Status', 'Fila/Pendentes', 'Ativas', 'Atendidas', 'Concluídas', 'Falhas', 'Ações Operacionais'].map((header) => (
                    <th key={header} className="px-5 py-3">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B] text-xs text-slate-200">
                {campaigns.map((campaign) => {
                  const deleteBlocked = campaign.status === 'running' || Number(campaign.active_calls || 0) > 0;
                  const isSelected = selectedId === campaign.id;

                  return (
                    <tr
                      key={campaign.id}
                      className={`hover:bg-[#1F2937] transition-colors ${isSelected ? 'bg-[#FF5A0A]/5 border-l-2 border-[#FF5A0A]' : ''}`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg border transition-colors ${isSelected ? 'bg-[#FF5A0A]/10 text-[#FF5A0A] border-[#FF5A0A]/30' : 'bg-[#0B0F19] text-slate-400 border-[#1E293B]'}`}>
                            <Layers size={15} />
                          </div>
                          <div>
                            <button
                              onClick={() => setSelectedId(campaign.id)}
                              className="font-bold text-slate-100 hover:text-[#FF5A0A] transition-colors text-left block text-xs"
                            >
                              {campaign.name}
                            </button>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {Number(campaign.total_leads || 0).toLocaleString('pt-BR')} CPFs • {Number(campaign.total_calls || 0).toLocaleString('pt-BR')} números
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5"><StatusBadge status={campaign.status} /></td>
                      <td className="px-5 py-3.5 font-medium text-sky-400">{Number(campaign.pending_calls || 0)}</td>
                      <td className="px-5 py-3.5 font-medium text-emerald-400">{Number(campaign.active_calls || 0)}</td>
                      <td className="px-5 py-3.5 font-semibold text-emerald-400">{Number(campaign.answered_calls || 0)}</td>
                      <td className="px-5 py-3.5 font-medium text-[#FF5A0A]">{Number(campaign.completed_calls || 0)}</td>
                      <td className="px-5 py-3.5 font-medium text-rose-400">{Number(campaign.failed_calls || 0)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          {campaign.status !== 'running' ? (
                            <button
                              type="button"
                              title="Iniciar campanha"
                              aria-label={`Iniciar campanha ${campaign.name}`}
                              onClick={() => void changeStatus(campaign.id, 'running')}
                              className="btn-click rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 p-1.5 text-emerald-400 border border-emerald-500/20"
                            >
                              <Play size={14} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              title="Pausar campanha"
                              aria-label={`Pausar campanha ${campaign.name}`}
                              onClick={() => void changeStatus(campaign.id, 'paused')}
                              className="btn-click rounded-lg bg-amber-500/10 hover:bg-amber-500/20 p-1.5 text-amber-400 border border-amber-500/20"
                            >
                              <Pause size={14} />
                            </button>
                          )}

                          <label
                            title="Importar contatos (CSV / Excel)"
                            aria-label={`Importar contatos para ${campaign.name}`}
                            className="btn-click cursor-pointer rounded-lg bg-[#0B0F19] border border-[#1E293B] hover:bg-[#1E293B] p-1.5 text-slate-300"
                          >
                            <UploadCloud size={14} />
                            <input
                              className="hidden"
                              type="file"
                              accept=".csv,.xlsx,.xls"
                              onChange={(event) => void importFile(campaign.id, event.target.files?.[0])}
                            />
                          </label>

                          <button
                            type="button"
                            title="Ver Fila de Contatos"
                            onClick={() => setSelectedId(campaign.id)}
                            className={`btn-click rounded-lg px-2.5 py-1 border text-xs font-semibold flex items-center gap-1 transition-colors ${
                              isSelected
                                ? 'bg-[#FF5A0A] text-white border-[#FF5A0A]'
                                : 'bg-[#FF5A0A]/10 text-[#FF5A0A] border-[#FF5A0A]/20 hover:bg-[#FF5A0A]/20'
                            }`}
                          >
                            <Eye size={13} />
                            <span className="hidden sm:inline">Ver Fila</span>
                          </button>

                          <button
                            type="button"
                            title="Editar configurações"
                            onClick={() => setEditingCampaign(campaign)}
                            className="btn-click rounded-lg bg-sky-500/10 hover:bg-sky-500/20 p-1.5 text-sky-400 border border-sky-500/20"
                          >
                            <SettingsIcon size={14} />
                          </button>

                          <button
                            type="button"
                            title={deleteBlocked ? 'Pause a campanha para excluir' : 'Excluir campanha'}
                            disabled={deleteBlocked || deletingId === campaign.id}
                            onClick={() => void deleteCampaign(campaign)}
                            className="btn-click rounded-lg bg-rose-500/10 hover:bg-rose-500/20 p-1.5 text-rose-400 border border-rose-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!campaigns.length && (
                  <tr>
                    <td colSpan={8} className="p-4">
                      <EmptyState
                        title="Nenhuma campanha cadastrada"
                        description="Crie uma nova campanha para iniciar o disparo automatizado."
                        actionLabel="Nova Campanha"
                        onAction={() => setShowCreate(true)}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Visão de Contatos da Campanha Selecionada */}
        {selectedCampaign && (
          <div className="rounded-lg bg-[#111827] p-5 border border-[#1E293B] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E293B] pb-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Fila da Campanha Selecionada</span>
                  <div className="flex items-center gap-2 bg-[#0B0F19] px-3 py-1.5 rounded-lg border border-[#1E293B]">
                    <Layers size={15} className="text-[#FF5A0A]" />
                    <select
                      value={selectedId || ''}
                      onChange={(e) => setSelectedId(Number(e.target.value))}
                      className="bg-transparent text-slate-100 text-xs font-semibold focus:outline-none cursor-pointer pr-2"
                    >
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id} className="bg-[#0B0F19] text-slate-200 font-normal">
                          Campanha #{c.id}: {c.name} ({Number(c.total_leads || 0).toLocaleString('pt-BR')} CPFs)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <StatusBadge status={selectedCampaign.status} />
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void loadCalls(selectedCampaign.id, callsPage)}
                  className="btn-click flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#0B0F19] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-[#1E293B]"
                >
                  <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                  Atualizar Fila
                </button>
              </div>
            </div>

            {/* 6 Metric Cards da Campanha */}
            <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="rounded-lg bg-[#0B0F19] p-3 border border-[#1E293B]">
                <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Base / Importados</span>
                <p className="text-base font-bold text-slate-100 mt-0.5">{Number(selectedCampaign.total_calls || 0).toLocaleString('pt-BR')}</p>
              </div>
              <div className="rounded-lg bg-[#0B0F19] p-3 border border-[#1E293B]">
                <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Discados</span>
                <p className="text-base font-bold text-sky-400 mt-0.5">{Number(selectedCampaign.completed_calls || 0).toLocaleString('pt-BR')}</p>
              </div>
              <div className="rounded-lg bg-[#0B0F19] p-3 border border-[#1E293B]">
                <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Atendidos</span>
                <p className="text-base font-bold text-emerald-400 mt-0.5">{Number(selectedCampaign.answered_calls || 0).toLocaleString('pt-BR')}</p>
              </div>
              <div className="rounded-lg bg-[#0B0F19] p-3 border border-[#1E293B]">
                <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Formalizados</span>
                <p className="text-base font-bold text-[#FF5A0A] mt-0.5">{Number(selectedCampaign.formalized_calls || 0).toLocaleString('pt-BR')}</p>
              </div>
              <div className="rounded-lg bg-[#0B0F19] p-3 border border-[#1E293B]">
                <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Inválidos / Ignorados</span>
                <p className="text-base font-bold text-amber-400 mt-0.5">{Number(selectedCampaign.skipped_calls || 0).toLocaleString('pt-BR')}</p>
              </div>
              <div className="rounded-lg bg-[#0B0F19] p-3 border border-[#1E293B]">
                <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Falhas</span>
                <p className="text-base font-bold text-rose-400 mt-0.5">{Number(selectedCampaign.failed_calls || 0).toLocaleString('pt-BR')}</p>
              </div>
            </div>

            {/* Gráfico de Decisões da Campanha Selecionada */}
            {selectedCampaignDecisions.length > 0 && (
              <div className="w-full rounded-lg bg-[#0B0F19] p-4 border border-[#1E293B] flex flex-col md:flex-row items-center justify-between gap-4 my-2">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                    <Activity size={14} className="text-[#FF5A0A]" />
                    Classificação de Decisões do Acordo (IA)
                  </h4>
                  <p className="text-xs text-slate-400">Distribuição em tempo real das intenções dos contatos desta campanha</p>
                </div>
                <div className="h-40 w-full md:w-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={selectedCampaignDecisions}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={60}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {selectedCampaignDecisions.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0B0F19', borderColor: '#1E293B', borderRadius: '8px' }}
                        itemStyle={{ color: '#F8FAFC' }}
                      />
                      <Legend verticalAlign="bottom" height={28} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Filtros e Tabela de Contatos */}
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 bg-[#0B0F19] px-3 py-1.5 rounded-lg border border-[#1E293B]">
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
                    className="bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none w-48 sm:w-60"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput('');
                        setCallsPage(1);
                        setSearchQuery('');
                      }}
                      className="text-[10px] text-slate-400 hover:text-white bg-slate-800 px-1.5 py-0.5 rounded"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Filter size={12} />
                    Filtrar:
                  </span>
                  {[
                    { label: 'Todos', value: 'all' },
                    { label: 'Em Linha', value: 'active' },
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
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors ${
                        decisionFilter === f.value
                          ? 'bg-[#FF5A0A] text-white border-[#FF5A0A]'
                          : 'bg-[#0B0F19] text-slate-300 border-[#1E293B] hover:bg-[#1E293B]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}

                  <button
                    type="button"
                    disabled={exporting}
                    onClick={exportToCsv}
                    className="rounded-lg px-2.5 py-1 text-xs font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center gap-1.5 ml-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download size={12} className={exporting ? 'animate-spin' : ''} />
                    {exporting ? 'Exportando...' : 'Exportar CSV'}
                  </button>
                </div>
              </div>

              {/* Tabela de Contatos */}
              <div className="overflow-x-auto rounded-lg border border-[#1E293B]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#0B0F19] text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#1E293B]">
                    <tr>
                      {['Telefone', 'CPF', 'Status', 'Tentativas', 'Acordo / Decisão', 'Última Atualização', 'Ações'].map((header) => (
                        <th key={header} className="px-5 py-3">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B] text-xs text-slate-200">
                    {filteredCalls.map((call) => (
                      <tr
                        key={call.id}
                        onClick={() => setSelectedCall(call)}
                        className="hover:bg-[#1F2937] cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3 font-semibold text-slate-100">{call.customer_number}</td>
                        <td className="px-5 py-3 text-slate-400 font-mono">{call.cpf || '-'}</td>
                        <td className="px-5 py-3"><StatusBadge status={call.status} /></td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center justify-center rounded bg-[#0B0F19] px-2 py-0.5 text-xs font-semibold text-slate-300 border border-[#1E293B]">
                            {call.attempts} / 5
                          </span>
                        </td>
                        <td className="px-5 py-3 font-semibold">
                          {call.decision === 'formalize' && (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 size={13} /> Formalizado
                            </span>
                          )}
                          {call.decision === 'schedule' && (
                            <span className="text-amber-400 flex items-center gap-1">
                              <AlertCircle size={13} /> Reagendado
                            </span>
                          )}
                          {call.decision === 'zero' && (
                            <span className="text-rose-400 flex items-center gap-1">
                              <XCircle size={13} />
                              {call.ended_reason === 'voicemail' 
                                ? 'Caixa Postal' 
                                : (!call.duration_seconds || call.duration_seconds === 0
                                    ? 'Não Atendido'
                                    : (call.duration_seconds <= 30 
                                        ? 'Atendeu e Desligou' 
                                        : 'Recusado/Sem Acordo'))}
                            </span>
                          )}
                          {call.status === 'skipped' ? (
                            <span className="text-slate-400 font-normal flex items-center gap-1">
                              <X size={13} className="text-slate-500" />
                              {call.last_error === 'already_has_agreement' && `Já possui acordo formalizado`}
                              {call.last_error === 'no_online_agreement' && `Acordo online não permitido`}
                              {call.last_error === 'no_debt' && 'Sem débito em aberto'}
                              {call.last_error === 'cpf_missing' && 'CPF ausente'}
                              {!['already_has_agreement', 'no_online_agreement', 'no_debt', 'cpf_missing'].includes(call.last_error || '') && 'Não discado'}
                            </span>
                          ) : (
                            !call.decision && (
                              <span className="text-slate-500 font-normal">Aguardando</span>
                            )
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-400 text-xs">
                          {call.updated_at ? new Date(call.updated_at).toLocaleString('pt-BR') : '-'}
                        </td>
                        <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                          {['reserved', 'queued', 'in_progress', 'answered'].includes(call.status) && call.provider_call_id ? (
                            <button
                              type="button"
                              title="Desligar chamada"
                              disabled={!!terminatingCallId}
                              onClick={(event) => void terminateCall(call.provider_call_id!, event)}
                              className="btn-click rounded bg-rose-500/10 hover:bg-rose-500/20 p-1 text-rose-400 border border-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
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
                        <td colSpan={7} className="p-4">
                          <EmptyState
                            title="Nenhum contato encontrado"
                            description="Tente alterar os filtros de busca para encontrar o contato desejado."
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Criar/Editar e Detalhes */}
        {showCreate && (
          <CreateCampaign onClose={() => setShowCreate(false)} onCreated={() => load()} />
        )}

        {editingCampaign && (
          <CreateCampaign campaign={editingCampaign} onClose={() => setEditingCampaign(null)} onCreated={() => load()} />
        )}

        {selectedCall && (
          <CallDetailsModal call={selectedCall} onClose={() => setSelectedCall(null)} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header Compacto da Operação */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-[#111827] p-4 border border-[#1E293B]">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            Painel Geral — <span className="text-[#FF5A0A]">Grupo DDM</span>
          </h2>
          <p className="text-slate-400 text-xs font-normal">Métricas analíticas consolidadas da operação e disparador Vapi</p>

          <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
            <div className="flex items-center gap-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-emerald-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
              <span>Tempo Real:</span>
              <LiveClock />
            </div>

            {lastUpdatedAt && (
              <p className="text-slate-400 flex items-center gap-1.5 font-medium text-xs">
                <RefreshCw size={12} className="text-slate-500" />
                {getRelativeTime(lastUpdatedAt)}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="btn-click flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#0B0F19] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-[#1E293B] disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Sincronizando...' : 'Sincronizar'}
          </button>

          <a
            href="/modelo_importacao.csv"
            download="modelo_importacao.csv"
            className="btn-click flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#0B0F19] px-3 py-2 text-xs font-medium text-slate-300 hover:bg-[#1E293B] hover:text-white"
          >
            <Download size={13} />
            Planilha Modelo
          </a>

          <button
            type="button"
            onClick={() => navigate('/campanhas')}
            className="btn-click flex items-center gap-1.5 rounded-lg bg-[#FF5A0A] hover:bg-[#EA580C] px-3.5 py-2 text-xs font-semibold text-white transition-colors"
          >
            <Play size={14} />
            Acessar Disparador
          </button>
        </div>
      </div>

      {/* Tratamento de Erro */}
      {error && (
        <ErrorState
          title="Erro de Conexão com o Servidor"
          message={error}
          onRetry={() => void load()}
        />
      )}

      {/* Barra de Filtros Dedicada (Etapa 2) */}
      <FilterBar
        selectedCampaignId={selectedId}
        campaigns={campaigns}
        onSelectCampaign={(id) => setSelectedId(id)}
        period={period}
        onSelectPeriod={(p) => setPeriod(p)}
        statusFilter={decisionFilter}
        onSelectStatusFilter={(s) => setDecisionFilter(s)}
        searchInput={searchInput}
        onSearchChange={(val) => setSearchInput(val)}
        onClearFilters={() => {
          setSelectedId(null);
          setPeriod('all');
          setDecisionFilter('all');
          setSearchInput('');
          setSearchQuery('');
        }}
        activeFiltersCount={
          (selectedId ? 1 : 0) +
          (period !== 'all' ? 1 : 0) +
          (decisionFilter !== 'all' ? 1 : 0) +
          (searchInput ? 1 : 0)
        }
      />

      {/* Cartões de Indicadores de Performance (KPIs Principais & Secundários) */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Prioridade 1 */}
        <MetricCard
          title="Taxa de Alô (% Atendimento)"
          value={`${stats.pickupRate}%`}
          description={`${stats.answered.toLocaleString('pt-BR')} chamadas atendidas`}
          icon={PhoneCall}
          semanticColor="success"
          priority={1}
          loading={loading}
        />
        <MetricCard
          title="Conversão (Formalizados)"
          value={`${stats.conversionRate}%`}
          description={`${stats.formalized.toLocaleString('pt-BR')} acordos fechados`}
          icon={Award}
          semanticColor="primary"
          priority={1}
          loading={loading}
        />
        <MetricCard
          title="Chamadas Ativas"
          value={stats.active}
          description="em linha simultaneamente"
          icon={Activity}
          semanticColor="info"
          priority={1}
          pulse={stats.active > 0}
          loading={loading}
        />
        <MetricCard
          title="Finalizados (Fila)"
          value={stats.completed}
          description="processados na fila"
          icon={CheckCircle2}
          semanticColor="success"
          priority={1}
          loading={loading}
        />

        {/* Prioridade 2 */}
        <MetricCard
          title="Duração Média (AHT)"
          value={stats.avgDurationFormatted}
          description="tempo médio de conversa"
          icon={Clock}
          semanticColor="neutral"
          priority={2}
          loading={loading}
        />
        <MetricCard
          title="Retornos Agendados"
          value={stats.scheduled}
          description="pedidos de rechamada"
          icon={Calendar}
          semanticColor="warning"
          priority={2}
          loading={loading}
        />
        <MetricCard
          title="Não Atendidos / Erros"
          value={stats.failed}
          description="falhas ou indisponíveis"
          icon={XCircle}
          semanticColor="danger"
          priority={2}
          loading={loading}
        />
        <MetricCard
          title="Total de Leads (CPFs)"
          value={stats.leads}
          description={`${stats.calls.toLocaleString('pt-BR')} telefones cadastrados`}
          icon={FileText}
          semanticColor="neutral"
          priority={2}
          loading={loading}
        />
      </div>

      {/* Seção do Painel do Planejamento & Operações (4 Cards em Grid 2x2) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Card 1: Funil de Conversão Operacional */}
        <div className="rounded-lg bg-[#111827] p-5 border border-[#1E293B] flex flex-col justify-between min-h-[350px]">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Layers size={16} className="text-[#FF5A0A]" />
              Funil de Conversão do Disparo
            </h3>
            <p className="text-xs text-slate-400">Evolução do volume da base até a formalização do acordo</p>
          </div>

          <div className="h-60 mt-4 flex items-center justify-center">
            {stats.leads > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData} layout="vertical" margin={{ top: 10, right: 20, left: 30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis type="number" stroke="#64748B" fontSize={11} />
                  <YAxis type="category" dataKey="etapa" stroke="#94A3B8" fontSize={11} width={110} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0B0F19', borderColor: '#1E293B', borderRadius: '8px' }}
                    itemStyle={{ color: '#F8FAFC' }}
                  />
                  <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                    {funnelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                compact
                title="Sem dados no funil"
                description="Importe contatos para visualizar o funil de conversão da operação."
              />
            )}
          </div>
        </div>

        {/* Card 2: Desempenho Comparativo por Campanha */}
        <div className="rounded-lg bg-[#111827] p-5 border border-[#1E293B] flex flex-col justify-between min-h-[350px]">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <BarChart3 size={16} className="text-sky-400" />
              Desempenho Comparativo por Campanha
            </h3>
            <p className="text-xs text-slate-400">Contatos processados (Concluídos) em relação ao total importado por lote</p>
          </div>

          <div className="h-60 mt-4 flex items-center justify-center">
            {chartCampaignPerformance.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartCampaignPerformance} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis dataKey="name" stroke="#94A3B8" fontSize={11} />
                  <YAxis stroke="#64748B" fontSize={11} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0B0F19', borderColor: '#1E293B', borderRadius: '8px' }}
                    itemStyle={{ color: '#F8FAFC' }}
                  />
                  <Legend />
                  <Bar dataKey="Concluídas" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Total" fill="#334155" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                compact
                title="Sem campanhas ativas"
                description="Crie uma nova campanha para visualizar o histórico comparativo."
                actionLabel="Nova Campanha"
                onAction={() => setShowCreate(true)}
              />
            )}
          </div>
        </div>

        {/* Card 3: Distribuição de Decisões de Atendimento */}
        <div className="rounded-lg bg-[#111827] p-5 border border-[#1E293B] flex flex-col justify-between min-h-[350px]">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Activity size={16} className="text-emerald-400" />
              Status de Resultados da Fila
            </h3>
            <p className="text-xs text-slate-400">Proporção de acordos, rechamadas e falhas no banco de contatos</p>
          </div>

          <div className="h-60 mt-4 flex items-center justify-center">
            {chartStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {chartStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0B0F19', borderColor: '#1E293B', borderRadius: '8px' }}
                    itemStyle={{ color: '#F8FAFC' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                compact
                title="Sem dados analíticos"
                description="Inicie a discagem para gerar relatórios de classificação."
              />
            )}
          </div>
        </div>

        {/* Card 4: Indicadores de Infraestrutura & Capacidade do Planejamento */}
        <div className="rounded-lg bg-[#111827] p-5 border border-[#1E293B] flex flex-col justify-between min-h-[350px] space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <ShieldCheck size={16} className="text-sky-400" />
              Saúde da Operação & Pacing
            </h3>
            <p className="text-xs text-slate-400">Métricas operacionais de chamadas e controle do dialer</p>
          </div>

          <div className="space-y-2.5 flex-1 justify-center flex flex-col">
            <div className="rounded-lg bg-[#0B0F19] p-3 border border-[#1E293B] flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                  <Zap size={13} className="text-[#FF5A0A]" />
                  Pacing Delay
                </span>
                <p className="text-xs text-slate-400">Intervalo de segurança entre disparos</p>
              </div>
              <span className="px-2.5 py-1 rounded bg-[#FF5A0A]/10 text-[#FF5A0A] text-xs font-semibold border border-[#FF5A0A]/20">
                500 ms
              </span>
            </div>

            <div className="rounded-lg bg-[#0B0F19] p-3 border border-[#1E293B] flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                  <RefreshCw size={13} className="text-emerald-400" />
                  Auto-Retry SIP 408
                </span>
                <p className="text-xs text-slate-400">Reagendamento automático de timeout</p>
              </div>
              <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                15 mins
              </span>
            </div>

            <div className="rounded-lg bg-[#0B0F19] p-3 border border-[#1E293B] flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                  <MessageSquare size={13} className="text-sky-400" />
                  Fallback de Notificações
                </span>
                <p className="text-xs text-slate-400">Smart RCS / N8N Webhook</p>
              </div>
              <span className="px-2.5 py-1 rounded bg-sky-500/10 text-sky-400 text-xs font-semibold border border-sky-500/20">
                Ativo
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Resumo Executivo de Campanhas (Métricas Apenas) */}
      <div className="rounded-lg bg-[#111827] overflow-hidden border border-[#1E293B]">
        <div className="border-b border-[#1E293B] bg-[#0B0F19] px-5 py-3.5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100">Relatório de Campanhas</h3>
            <p className="text-xs text-slate-400">Resumo de volume e desempenho dos lotes de disparo</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/campanhas')}
            className="btn-click inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FF5A0A] hover:bg-[#EA580C] text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Play size={13} />
            Ir para Campanhas & Disparador
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#0B0F19] text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#1E293B]">
              <tr>
                {['Campanha', 'Status', 'CPFs', 'Fila/Pendentes', 'Ativas', 'Atendidas', 'Concluídas', 'Falhas', 'Ação'].map((header) => (
                  <th key={header} className="px-5 py-3">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] text-xs text-slate-200">
              {campaigns.map((campaign) => (
                <tr
                  key={campaign.id}
                  className="hover:bg-[#1F2937] transition-colors"
                >
                  <td className="px-5 py-3.5 font-semibold text-slate-100">
                    {campaign.name}
                  </td>
                  <td className="px-5 py-3.5"><StatusBadge status={campaign.status} /></td>
                  <td className="px-5 py-3.5 text-slate-300 font-medium">{Number(campaign.total_leads || 0).toLocaleString('pt-BR')}</td>
                  <td className="px-5 py-3.5 font-medium text-sky-400">{Number(campaign.pending_calls || 0)}</td>
                  <td className="px-5 py-3.5 font-medium text-emerald-400">{Number(campaign.active_calls || 0)}</td>
                  <td className="px-5 py-3.5 font-semibold text-emerald-400">{Number(campaign.answered_calls || 0)}</td>
                  <td className="px-5 py-3.5 font-medium text-[#FF5A0A]">{Number(campaign.completed_calls || 0)}</td>
                  <td className="px-5 py-3.5 font-medium text-rose-400">{Number(campaign.failed_calls || 0)}</td>
                  <td className="px-5 py-3.5">
                    <button
                      type="button"
                      title="Ver Fila de Contatos no Disparador"
                      onClick={() => navigate(`/campanhas?id=${campaign.id}`)}
                      className="btn-click rounded-lg bg-[#FF5A0A]/10 hover:bg-[#FF5A0A]/20 px-2.5 py-1 text-[#FF5A0A] border border-[#FF5A0A]/20 text-xs font-semibold flex items-center gap-1 transition-colors"
                    >
                      <Eye size={13} />
                      Ver Fila
                    </button>
                  </td>
                </tr>
              ))}

              {!campaigns.length && (
                <tr>
                  <td colSpan={9} className="p-4">
                    <EmptyState
                      title="Nenhuma campanha cadastrada"
                      description="Acesse a aba Campanhas & Disparador para criar sua primeira campanha."
                      actionLabel="Ir para Campanhas"
                      onAction={() => navigate('/campanhas')}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal - Criar e Editar Campanhas */}
      {showCreate && (
        <CreateCampaign onClose={() => setShowCreate(false)} onCreated={() => load()} />
      )}

      {editingCampaign && (
        <CreateCampaign campaign={editingCampaign} onClose={() => setEditingCampaign(null)} onCreated={() => load()} />
      )}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-4xl rounded-lg border border-[#1E293B] bg-[#111827] overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="bg-[#0B0F19] px-5 py-3.5 border-b border-[#1E293B] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <PhoneCall size={16} className="text-[#FF5A0A]" />
              Detalhes da Ligação #{call.id}
            </h3>
            <p className="text-xs text-slate-400">CPF: {call.cpf || '-'} | Telefone: {call.customer_number}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg bg-[#1E293B] hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-5 min-h-0">
          
          {/* Left Column: Stats & Audio */}
          <div className="space-y-4">
            <div className="rounded-lg border border-[#1E293B] bg-[#0B0F19] p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#FF5A0A]">Informações Gerais</h4>
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
                              : (call.duration_seconds <= 30 
                                  ? 'Atendeu e Desligou' 
                                  : 'Recusado/Sem Acordo'))}
                      </span>
                    )}
                    {call.status === 'skipped' && (
                      <span className="text-slate-400">
                        {call.last_error === 'already_has_agreement' && `Já possui acordo formalizado${call.metadata?.calculationId || call.metadata?.debtorId ? ` (Cadastro DDM #${call.metadata.calculationId || call.metadata.debtorId})` : ''}`}
                        {call.last_error === 'no_online_agreement' && `Acordo online não permitido${call.metadata?.calculationId || call.metadata?.debtorId ? ` (Cadastro DDM #${call.metadata.calculationId || call.metadata.debtorId})` : ''}`}
                        {call.last_error === 'no_debt' && 'Sem débito em aberto'}
                        {call.last_error === 'cpf_missing' && 'CPF ausente'}
                        {!['already_has_agreement', 'no_online_agreement', 'no_debt', 'cpf_missing'].includes(call.last_error || '') && 'Não discado'}
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
  const [selectedAssistantId, setSelectedAssistantId] = useState<string>('');
  const [customAssistantId, setCustomAssistantId] = useState<string>('');

  useEffect(() => {
    let active = true;

    void apiFetch('/vapi/config')
      .then((result) => {
        if (active) {
          const cfg = result as VapiConfig;
          setVapiConfig(cfg);
          if (campaign?.assistant_id) {
            setSelectedAssistantId(campaign.assistant_id);
          } else if (cfg.assistants && cfg.assistants.length > 0) {
            setSelectedAssistantId(cfg.assistants[0].id);
          } else {
            setSelectedAssistantId(cfg.assistant.id);
          }
        }
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
  }, [campaign?.assistant_id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vapiConfig) return;

    const form = new FormData(event.currentTarget);
    setSaving(true);

    const finalAssistantId = selectedAssistantId === 'custom'
      ? customAssistantId.trim()
      : (selectedAssistantId || vapiConfig.assistant.id);

    if (!finalAssistantId) {
      window.alert('Selecione ou informe um Assistente Vapi válido.');
      setSaving(false);
      return;
    }

    try {
      if (campaign) {
        // Edit Mode
        await apiFetch(`/campaigns/${campaign.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: form.get('name'),
            assistantId: finalAssistantId,
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
            assistantId: finalAssistantId,
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

  const assistantOptions = vapiConfig?.assistants || (vapiConfig ? [vapiConfig.assistant] : []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-lg space-y-4 rounded-lg border border-[#1E293B] bg-[#111827] p-5"
      >
        <h3 className="text-base font-bold text-slate-100 border-b border-[#1E293B] pb-3">
          {campaign ? 'Editar Configurações da Campanha' : 'Criar Nova Campanha'}
        </h3>

        <div className="space-y-1">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Nome da Campanha</label>
          <input
            name="name"
            required
            defaultValue={campaign?.name}
            placeholder="Ex: Cobrança UVA Vencidos Julho"
            className="mt-1 w-full rounded-lg border border-[#1E293B] bg-[#0B0F19] px-3 py-2 text-slate-100 focus:outline-none focus:border-[#FF5A0A] text-xs font-medium"
          />
        </div>

        <div className="rounded-lg border border-[#1E293B] bg-[#0B0F19] p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-[#FF5A0A]">Agente de Voz & Carteira</p>
          {loadingConfig && <p className="text-xs text-slate-400">Verificando dados Vapi...</p>}
          {configError && <p className="text-xs text-rose-400">{configError}</p>}
          {vapiConfig && (
            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-300">Selecionar Assistente Virtual (Carteira)</label>
                <select
                  value={selectedAssistantId}
                  onChange={(e) => setSelectedAssistantId(e.target.value)}
                  className="w-full rounded-lg border border-[#1E293B] bg-[#111827] px-3 py-2 text-slate-100 focus:outline-none focus:border-[#FF5A0A] text-xs font-semibold"
                >
                  {assistantOptions.map((ast) => (
                    <option key={ast.id} value={ast.id}>
                      🎓 {ast.name}
                    </option>
                  ))}
                  <option value="custom">⚙️ Outro Assistente (Informar ID Vapi)</option>
                </select>
              </div>

              {selectedAssistantId === 'custom' && (
                <div className="space-y-1 pt-1">
                  <label className="block text-xs font-semibold text-slate-300">ID do Assistente Vapi</label>
                  <input
                    value={customAssistantId}
                    onChange={(e) => setCustomAssistantId(e.target.value)}
                    required={selectedAssistantId === 'custom'}
                    placeholder="Cole o ID da Vapi (ex: 15190261-096d-47fe-bbbe-cbfe8dceb2ae)"
                    className="w-full rounded-lg border border-[#1E293B] bg-[#0B0F19] px-3 py-2 text-slate-100 focus:outline-none focus:border-[#FF5A0A] text-xs font-mono"
                  />
                </div>
              )}

              <div className="pt-2 border-t border-[#1E293B] flex justify-between items-center text-[11px] text-slate-400">
                <span>Telefone de Saída Vapi:</span>
                <strong className="font-semibold text-slate-200">{vapiConfig.phoneNumber.number}</strong>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Limitar Concorrência</label>
            <input
              name="maxConcurrent"
              required
              defaultValue={campaign ? String(campaign.max_concurrent) : '10'}
              min="1"
              type="number"
              className="mt-1 w-full rounded-lg border border-[#1E293B] bg-[#0B0F19] px-3 py-2 text-slate-100 focus:outline-none focus:border-[#FF5A0A] text-xs"
            />
            <p className="text-[10px] text-slate-500 mt-1 leading-normal">
              Recomendado: <b>30</b> chamadas simultâneas.
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
              className="mt-1 w-full rounded-lg border border-[#1E293B] bg-[#0B0F19] px-3 py-2 text-slate-100 focus:outline-none focus:border-[#FF5A0A] text-xs"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-[#1E293B]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#1E293B] bg-[#0B0F19] px-3.5 py-2 text-slate-300 hover:bg-[#1E293B] text-xs font-semibold transition-colors"
          >
            Cancelar
          </button>
          <button
            disabled={saving || loadingConfig || !vapiConfig}
            className="rounded-lg bg-[#FF5A0A] hover:bg-[#EA580C] px-4 py-2 text-white font-semibold text-xs transition-colors disabled:opacity-40"
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
    <div className="max-w-xl rounded-lg bg-[#111827] border border-[#1E293B] p-5 space-y-5">
      <div className="border-b border-[#1E293B] pb-3.5">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <SettingsIcon size={20} className="text-[#FF5A0A]" />
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
          className="mt-1 w-full rounded-lg border border-[#1E293B] bg-[#0B0F19] px-3 py-2 text-slate-100 focus:outline-none focus:border-[#FF5A0A] text-xs font-mono"
        />
        <p className="text-[11px] text-slate-500">Este token é salvo no armazenamento local do seu navegador para assinar as requisições.</p>
      </div>

      <button
        type="button"
        onClick={() => {
          localStorage.setItem('callcenter_api_token', token);
          window.alert('Token administrativo salvo com sucesso neste navegador!');
        }}
        className="btn-click rounded-lg bg-[#FF5A0A] hover:bg-[#EA580C] px-4 py-2 font-semibold text-xs text-white transition-colors"
      >
        Salvar Configurações
      </button>
    </div>
  );
}

function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const location = useLocation();
  const links = [
    ['/', 'Painel Geral', BarChart3],
    ['/campanhas', 'Campanhas & Disparador', Play],
    ['/configuracoes', 'Configurações', SettingsIcon],
  ] as const;

  return (
    <>
      {/* Backdrop para mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-screen w-60 border-r border-[#1E293B] bg-[#0B0F19] text-slate-300 flex flex-col justify-between p-5 z-50 transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-3">
              <div className="bg-white px-2.5 py-1.5 rounded-lg border border-slate-700 flex items-center justify-center">
                <img
                  src={`${basePath}/logo_ddm.jpg`}
                  alt="Grupo DDM Logo"
                  className="h-6 w-auto object-contain"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar menu"
              className="lg:hidden text-slate-400 hover:text-white p-1"
            >
              <X size={18} />
            </button>
          </div>

          <nav className="space-y-1">
            {links.map(([path, label, Icon]) => {
              const isActive = location.pathname === path || (path === '/campanhas' && location.pathname.startsWith('/campanhas'));
              return (
                <Link
                  key={path}
                  to={path}
                  onClick={onClose}
                  className={`flex items-center gap-3 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-[#FF5A0A]/10 text-[#FF5A0A] border-l-2 border-[#FF5A0A]'
                      : 'hover:bg-[#1E293B] hover:text-slate-100 text-slate-400'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="rounded-lg border border-[#1E293B] bg-[#111827] p-3 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ambiente de Operação</p>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            <span className="text-xs font-semibold text-slate-200">v2.4 (Vapi + DDM Pay)</span>
          </div>
        </div>
      </aside>
    </>
  );
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <BrowserRouter basename={basePath || '/'}>
      <div className="min-h-screen bg-[#090D16] text-slate-100 flex relative overflow-hidden">
        <ThreeBackground />
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 min-w-0 flex flex-col lg:ml-60 transition-all">
          {/* Header Mobile com Toggle */}
          <header className="lg:hidden bg-[#0B0F19] border-b border-[#1E293B] px-4 py-3 flex items-center justify-between sticky top-0 z-30">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Abrir menu lateral"
                className="p-2 rounded-lg bg-[#111827] text-slate-200 border border-[#1E293B] hover:bg-[#1E293B]"
              >
                <Menu size={18} />
              </button>
              <div className="bg-white px-2 py-1 rounded-lg flex items-center">
                <img src={`${basePath}/logo_ddm.jpg`} alt="Grupo DDM Logo" className="h-5 w-auto object-contain" />
              </div>
            </div>
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
          </header>

          <main className="p-4 sm:p-6 lg:p-8 flex-1 min-w-0 max-w-[1600px] w-full mx-auto space-y-6 z-10 relative">
            <Routes>
              <Route path="/" element={<Campaigns />} />
              <Route path="/campanhas" element={<Campaigns />} />
              <Route path="/configuracoes" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
