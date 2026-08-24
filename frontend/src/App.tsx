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
import { Drawer } from './components/ui/Drawer';
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
      <span className="inline-flex items-center gap-1.5 rounded-md bg-[#ECFDF3] px-2.5 py-1 text-[11px] font-bold text-[#15803D] border border-[#DCFCE7]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#15803D]"></span>
        Ativa
      </span>
    );
  }
  
  if (normalized === 'paused') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-[#FFF7ED] px-2.5 py-1 text-[11px] font-bold text-[#B45309] border border-[#FED7AA]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#B45309]"></span>
        Pausada
      </span>
    );
  }

  if (normalized === 'completed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-[#F0F9FF] px-2.5 py-1 text-[11px] font-bold text-[#0369A1] border border-[#BAE6FD]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#0369A1]"></span>
        Concluída
      </span>
    );
  }

  if (normalized === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-[#FEF2F2] px-2.5 py-1 text-[11px] font-bold text-[#B91C1C] border border-[#FCA5A5]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#B91C1C]"></span>
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
      { name: 'Pendente', value: stats.pending, color: '#8B92A0' },     // Gray
      { name: 'Em Linha', value: stats.active, color: '#D9480F' },      // Orange DDM
      { name: 'Concluído', value: stats.completed, color: '#15803D' },   // Green
      { name: 'Falhado', value: stats.failed, color: '#B91C1C' },       // Red
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
      { name: 'Formalizado', value: decisions.formalize || 0, color: '#15803D' }, // Green
      { name: 'Agendado', value: decisions.schedule || 0, color: '#B45309' },     // Amber/Yellow
      { name: 'Sem Acordo', value: decisions.zero || 0, color: '#5F6570' },       // Gray
      { name: 'Pendente/Outros', value: decisions.no_decision || 0, color: '#8B92A0' }, // Gray
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
      { etapa: 'Base Importada', valor: stats.leads, fill: '#8B92A0' },
      { etapa: 'Discados', valor: stats.calls, fill: '#0369A1' },
      { etapa: 'Atendidos (Alô)', valor: stats.answered, fill: '#15803D' },
      { etapa: 'Formalizados', valor: stats.formalized, fill: '#D9480F' },
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
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-4.5 border border-[#E5E7EB] shadow-[0_1px_3px_0_rgba(0,0,0,0.03)]">
          <div>
            <h2 className="text-xl font-extrabold text-[#18181B] flex items-center gap-2">
              <Play size={20} className="text-[#D9480F]" />
              Campanhas & Disparador
            </h2>
            <p className="text-xs text-[#5F6570]">Gestão de lotes de cobrança, disparador automático Vapi e fila de contatos</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {campaigns.length > 0 && (
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-[#E5E7EB] shadow-xs">
                <span className="text-xs text-[#5F6570] font-medium hidden sm:inline">Campanha:</span>
                <select
                  value={selectedId || ''}
                  onChange={(e) => setSelectedId(Number(e.target.value))}
                  className="bg-transparent text-[#18181B] text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id} className="bg-white text-[#18181B]">
                      #{c.id} - {c.name} ({Number(c.total_leads || 0).toLocaleString('pt-BR')} CPFs)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="btn-click inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#D9480F] hover:bg-[#B9380B] text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
            >
              <Plus size={15} />
              Nova Campanha
            </button>
          </div>
        </div>

        {/* Tabela de Controle Operacional de Campanhas */}
        <div className="rounded-xl bg-white overflow-hidden border border-[#E5E7EB] shadow-[0_1px_3px_0_rgba(0,0,0,0.03)]">
          <div className="border-b border-[#E5E7EB] bg-[#FAFAFA] px-5 py-3.5 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#18181B]">Lotes de Disparo</h3>
            <span className="text-xs text-[#5F6570] font-medium">{campaigns.length} campanhas cadastradas</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#FAFAFA] text-[11px] font-bold uppercase tracking-wider text-[#5F6570] border-b border-[#E5E7EB]">
                <tr>
                  {['Campanha', 'Status', 'Fila/Pendentes', 'Ativas', 'Atendidas', 'Concluídas', 'Falhas', 'Ações Operacionais'].map((header) => (
                    <th key={header} className="px-5 py-3">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-xs text-[#18181B]">
                {campaigns.map((campaign) => {
                  const deleteBlocked = campaign.status === 'running' || Number(campaign.active_calls || 0) > 0;
                  const isSelected = selectedId === campaign.id;

                  return (
                    <tr
                      key={campaign.id}
                      className={`hover:bg-[#FFF7F2] transition-colors ${isSelected ? 'bg-[#FFF1E8]/60 border-l-[3px] border-[#D9480F]' : ''}`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg border transition-colors ${isSelected ? 'bg-[#FFF1E8] text-[#B9380B] border-[#FFD1B8]' : 'bg-[#FAFAFA] text-[#5F6570] border-[#E5E7EB]'}`}>
                            <Layers size={15} />
                          </div>
                          <div>
                            <button
                              onClick={() => setSelectedId(campaign.id)}
                              className="font-bold text-[#18181B] hover:text-[#D9480F] transition-colors text-left block text-xs"
                            >
                              {campaign.name}
                            </button>
                            <p className="text-[11px] text-[#5F6570] mt-0.5">
                              {Number(campaign.total_leads || 0).toLocaleString('pt-BR')} CPFs • {Number(campaign.total_calls || 0).toLocaleString('pt-BR')} números
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5"><StatusBadge status={campaign.status} /></td>
                      <td className="px-5 py-3.5 font-medium text-[#0369A1]">{Number(campaign.pending_calls || 0)}</td>
                      <td className="px-5 py-3.5 font-medium text-[#15803D]">{Number(campaign.active_calls || 0)}</td>
                      <td className="px-5 py-3.5 font-semibold text-[#15803D]">{Number(campaign.answered_calls || 0)}</td>
                      <td className="px-5 py-3.5 font-medium text-[#D9480F]">{Number(campaign.completed_calls || 0)}</td>
                      <td className="px-5 py-3.5 font-medium text-[#B91C1C]">{Number(campaign.failed_calls || 0)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          {campaign.status !== 'running' ? (
                            <button
                              type="button"
                              title="Iniciar campanha"
                              aria-label={`Iniciar campanha ${campaign.name}`}
                              onClick={() => void changeStatus(campaign.id, 'running')}
                              className="btn-click rounded-lg bg-[#ECFDF3] hover:bg-[#DCFCE7] p-1.5 text-[#15803D] border border-[#DCFCE7]"
                            >
                              <Play size={14} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              title="Pausar campanha"
                              aria-label={`Pausar campanha ${campaign.name}`}
                              onClick={() => void changeStatus(campaign.id, 'paused')}
                              className="btn-click rounded-lg bg-[#FFF7ED] hover:bg-[#FED7AA] p-1.5 text-[#B45309] border border-[#FED7AA]"
                            >
                              <Pause size={14} />
                            </button>
                          )}

                          <label
                            title="Importar contatos (CSV / Excel)"
                            aria-label={`Importar contatos para ${campaign.name}`}
                            className="btn-click cursor-pointer rounded-lg bg-[#FAFAFA] border border-[#E5E7EB] hover:bg-[#E5E7EB] p-1.5 text-[#5F6570]"
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
                                ? 'bg-[#D9480F] text-white border-[#D9480F]'
                                : 'bg-[#FFF1E8] text-[#B9380B] border-[#FFD1B8] hover:bg-[#FFD1B8]'
                            }`}
                          >
                            <Eye size={13} />
                            <span className="hidden sm:inline">Ver Fila</span>
                          </button>

                          <button
                            type="button"
                            title="Editar configurações"
                            onClick={() => setEditingCampaign(campaign)}
                            className="btn-click rounded-lg bg-[#F0F9FF] hover:bg-[#BAE6FD] p-1.5 text-[#0369A1] border border-[#BAE6FD]"
                          >
                            <SettingsIcon size={14} />
                          </button>

                          <button
                            type="button"
                            title={deleteBlocked ? 'Pause a campanha para excluir' : 'Excluir campanha'}
                            disabled={deleteBlocked || deletingId === campaign.id}
                            onClick={() => void deleteCampaign(campaign)}
                            className="btn-click rounded-lg bg-[#FEF2F2] hover:bg-[#FCA5A5]/30 p-1.5 text-[#B91C1C] border border-[#FCA5A5] disabled:opacity-30 disabled:cursor-not-allowed"
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
          <div className="rounded-xl bg-white p-5 border border-[#E5E7EB] shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E5E7EB] pb-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="space-y-1">
                  <span className="text-[11px] text-[#5F6570] font-bold uppercase tracking-wider block">Fila da Campanha Selecionada</span>
                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-[#E5E7EB]">
                    <Layers size={15} className="text-[#D9480F]" />
                    <select
                      value={selectedId || ''}
                      onChange={(e) => setSelectedId(Number(e.target.value))}
                      className="bg-transparent text-[#18181B] text-xs font-semibold focus:outline-none cursor-pointer pr-2"
                    >
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id} className="bg-white text-[#18181B] font-normal">
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
                  className="btn-click flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#5F6570] hover:bg-[#FAFAFA] hover:text-[#18181B] shadow-xs"
                >
                  <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                  Atualizar Fila
                </button>
              </div>
            </div>

            {/* 6 Metric Cards da Campanha */}
            <div className="w-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="rounded-lg bg-[#FAFAFA] p-3 border border-[#E5E7EB]">
                <span className="text-[11px] text-[#5F6570] font-semibold uppercase tracking-wider block">Base / Importados</span>
                <p className="text-base font-bold text-[#18181B] mt-0.5">{Number(selectedCampaign.total_calls || 0).toLocaleString('pt-BR')}</p>
              </div>
              <div className="rounded-lg bg-[#FAFAFA] p-3 border border-[#E5E7EB]">
                <span className="text-[11px] text-[#5F6570] font-semibold uppercase tracking-wider block">Discados</span>
                <p className="text-base font-bold text-[#0369A1] mt-0.5">{Number(selectedCampaign.completed_calls || 0).toLocaleString('pt-BR')}</p>
              </div>
              <div className="rounded-lg bg-[#FAFAFA] p-3 border border-[#E5E7EB]">
                <span className="text-[11px] text-[#5F6570] font-semibold uppercase tracking-wider block">Atendidos</span>
                <p className="text-base font-bold text-[#15803D] mt-0.5">{Number(selectedCampaign.answered_calls || 0).toLocaleString('pt-BR')}</p>
              </div>
              <div className="rounded-lg bg-[#FAFAFA] p-3 border border-[#E5E7EB]">
                <span className="text-[11px] text-[#5F6570] font-semibold uppercase tracking-wider block">Formalizados</span>
                <p className="text-base font-bold text-[#D9480F] mt-0.5">{Number(selectedCampaign.formalized_calls || 0).toLocaleString('pt-BR')}</p>
              </div>
              <div className="rounded-lg bg-[#FAFAFA] p-3 border border-[#E5E7EB]">
                <span className="text-[11px] text-[#5F6570] font-semibold uppercase tracking-wider block">Inválidos / Ignorados</span>
                <p className="text-base font-bold text-[#B45309] mt-0.5">{Number(selectedCampaign.skipped_calls || 0).toLocaleString('pt-BR')}</p>
              </div>
              <div className="rounded-lg bg-[#FAFAFA] p-3 border border-[#E5E7EB]">
                <span className="text-[11px] text-[#5F6570] font-semibold uppercase tracking-wider block">Falhas</span>
                <p className="text-base font-bold text-[#B91C1C] mt-0.5">{Number(selectedCampaign.failed_calls || 0).toLocaleString('pt-BR')}</p>
              </div>
            </div>

            {/* Gráfico de Decisões da Campanha Selecionada */}
            {selectedCampaignDecisions.length > 0 && (
              <div className="w-full rounded-lg bg-[#FAFAFA] p-4 border border-[#E5E7EB] flex flex-col md:flex-row items-center justify-between gap-4 my-2">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#18181B] flex items-center gap-2">
                    <Activity size={14} className="text-[#D9480F]" />
                    Classificação de Decisões do Acordo (IA)
                  </h4>
                  <p className="text-xs text-[#5F6570]">Distribuição em tempo real das intenções dos contatos desta campanha</p>
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
                        contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E5E7EB', borderRadius: '8px', color: '#18181B', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.06)' }}
                        itemStyle={{ color: '#18181B' }}
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
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-[#E5E7EB] shadow-xs">
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
                    className="bg-transparent text-xs text-[#18181B] placeholder-[#8B92A0] focus:outline-none w-48 sm:w-60"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput('');
                        setCallsPage(1);
                        setSearchQuery('');
                      }}
                      className="text-[10px] text-[#5F6570] hover:text-[#18181B] bg-[#FAFAFA] border border-[#E5E7EB] px-1.5 py-0.5 rounded"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-[#5F6570] font-semibold flex items-center gap-1">
                    <Filter size={12} className="text-[#D9480F]" />
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
                          ? 'bg-[#FFF1E8] text-[#B9380B] border-[#FFD1B8] font-bold'
                          : 'bg-white text-[#5F6570] border-[#E5E7EB] hover:bg-[#F8F9FB] hover:text-[#18181B]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}

                  <button
                    type="button"
                    disabled={exporting}
                    onClick={exportToCsv}
                    className="rounded-lg px-2.5 py-1 text-xs font-semibold border border-[#DCFCE7] bg-[#ECFDF3] text-[#15803D] hover:bg-[#DCFCE7] transition-colors flex items-center gap-1.5 ml-1 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                  >
                    <Download size={12} className={exporting ? 'animate-spin' : ''} />
                    {exporting ? 'Exportando...' : 'Exportar CSV'}
                  </button>
                </div>
              </div>

              {/* Tabela de Contatos */}
              <div className="overflow-x-auto rounded-xl border border-[#E5E7EB]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#FAFAFA] text-[11px] font-bold uppercase tracking-wider text-[#5F6570] border-b border-[#E5E7EB]">
                    <tr>
                      {['Telefone', 'CPF', 'Status', 'Tentativas', 'Acordo / Decisão', 'Última Atualização', 'Ações'].map((header) => (
                        <th key={header} className="px-5 py-3">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB] text-xs text-[#18181B]">
                    {filteredCalls.map((call) => (
                      <tr
                        key={call.id}
                        onClick={() => setSelectedCall(call)}
                        className="hover:bg-[#FFF7F2] cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3 font-bold text-[#18181B]">{call.customer_number}</td>
                        <td className="px-5 py-3 text-[#5F6570] font-mono">{call.cpf || '-'}</td>
                        <td className="px-5 py-3"><StatusBadge status={call.status} /></td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center justify-center rounded bg-[#FAFAFA] px-2 py-0.5 text-xs font-semibold text-[#5F6570] border border-[#E5E7EB]">
                            {call.attempts} / 5
                          </span>
                        </td>
                        <td className="px-5 py-3 font-semibold">
                          {call.decision === 'formalize' && (
                            <span className="text-[#15803D] flex items-center gap-1 font-bold">
                              <CheckCircle2 size={13} /> Formalizado
                            </span>
                          )}
                          {call.decision === 'schedule' && (
                            <span className="text-[#B45309] flex items-center gap-1 font-bold">
                              <AlertCircle size={13} /> Reagendado
                            </span>
                          )}
                          {call.decision === 'zero' && (
                            <span className="text-[#B91C1C] flex items-center gap-1 font-bold">
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
                            <span className="text-[#5F6570] font-normal flex items-center gap-1">
                              <X size={13} className="text-[#8B92A0]" />
                              {call.last_error === 'already_has_agreement' && `Já possui acordo formalizado`}
                              {call.last_error === 'no_online_agreement' && `Acordo online não permitido`}
                              {call.last_error === 'no_debt' && 'Sem débito em aberto'}
                              {call.last_error === 'cpf_missing' && 'CPF ausente'}
                              {!['already_has_agreement', 'no_online_agreement', 'no_debt', 'cpf_missing'].includes(call.last_error || '') && 'Não discado'}
                            </span>
                          ) : (
                            !call.decision && (
                              <span className="text-[#8B92A0] font-normal">Aguardando</span>
                            )
                          )}
                        </td>
                        <td className="px-5 py-3 text-[#5F6570] text-xs">
                          {call.updated_at ? new Date(call.updated_at).toLocaleString('pt-BR') : '-'}
                        </td>
                        <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                          {['reserved', 'queued', 'in_progress', 'answered'].includes(call.status) && call.provider_call_id ? (
                            <button
                              type="button"
                              title="Desligar chamada"
                              disabled={!!terminatingCallId}
                              onClick={(event) => void terminateCall(call.provider_call_id!, event)}
                              className="btn-click rounded bg-[#FEF2F2] hover:bg-[#FCA5A5]/30 p-1 text-[#B91C1C] border border-[#FCA5A5] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <PhoneOff size={13} className={terminatingCallId === call.provider_call_id ? 'animate-pulse' : ''} />
                            </button>
                          ) : (
                            <span className="text-[#8B92A0] text-xs">-</span>
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
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-4.5 border border-[#E5E7EB] shadow-[0_1px_3px_0_rgba(0,0,0,0.03)]">
        <div className="space-y-1">
          <h2 className="text-xl font-extrabold text-[#18181B] flex items-center gap-2">
            Painel Geral — <span className="text-[#FF5A0A]">Grupo DDM</span>
          </h2>
          <p className="text-[#5F6570] text-xs font-normal">Métricas analíticas consolidadas da operação e disparador Vapi</p>

          <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
            <div className="flex items-center gap-1.5 rounded-full bg-[#ECFDF3] border border-[#DCFCE7] px-2.5 py-0.5 text-[#15803D] font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-[#15803D]"></span>
              <span>Tempo Real:</span>
              <LiveClock />
            </div>

            {lastUpdatedAt && (
              <p className="text-[#5F6570] flex items-center gap-1.5 font-medium text-xs">
                <RefreshCw size={12} className="text-[#8B92A0]" />
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
            className="btn-click flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold text-[#5F6570] hover:bg-[#FAFAFA] hover:text-[#18181B] disabled:opacity-50 shadow-xs"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Sincronizando...' : 'Sincronizar'}
          </button>

          <a
            href="/modelo_importacao.csv"
            download="modelo_importacao.csv"
            className="btn-click flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold text-[#5F6570] hover:bg-[#FAFAFA] hover:text-[#18181B] shadow-xs"
          >
            <Download size={13} />
            Planilha Modelo
          </a>

          <button
            type="button"
            onClick={() => navigate('/campanhas')}
            className="btn-click flex items-center gap-1.5 rounded-lg bg-[#D9480F] hover:bg-[#B9380B] px-3.5 py-2 text-xs font-semibold text-white transition-colors shadow-xs"
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Prioridade 1 */}
        <MetricCard
          title="Taxa de Alô (% Atendimento)"
          value={`${stats.pickupRate}%`}
          description={`${stats.answered.toLocaleString('pt-BR')} chamadas atendidas`}
          trend={`${stats.answered.toLocaleString('pt-BR')} atendidas hoje`}
          trendType="positive"
          icon={PhoneCall}
          priority={1}
          loading={loading}
        />
        <MetricCard
          title="Conversão (Formalizados)"
          value={`${stats.conversionRate}%`}
          description={`${stats.formalized.toLocaleString('pt-BR')} acordos fechados`}
          trend={`${stats.formalized.toLocaleString('pt-BR')} acordos fechados`}
          trendType="positive"
          icon={Award}
          priority={1}
          loading={loading}
        />
        <MetricCard
          title="Chamadas Ativas"
          value={stats.active}
          description="em linha simultaneamente"
          trend="Operação em tempo real"
          trendType="neutral"
          icon={Activity}
          pulse={stats.active > 0}
          loading={loading}
        />
        <MetricCard
          title="Finalizados (Fila)"
          value={stats.completed}
          description="processados na fila"
          trend={`${stats.completed.toLocaleString('pt-BR')} processados`}
          trendType="positive"
          icon={CheckCircle2}
          priority={1}
          loading={loading}
        />

        {/* Prioridade 2 */}
        <MetricCard
          title="Duração Média (AHT)"
          value={stats.avgDurationFormatted}
          description="tempo médio de conversa"
          trend="02m 14s média ideal"
          trendType="neutral"
          icon={Clock}
          priority={2}
          loading={loading}
        />
        <MetricCard
          title="Retornos Agendados"
          value={stats.scheduled}
          description="pedidos de rechamada"
          trend={`${stats.scheduled} agendamentos`}
          trendType="neutral"
          icon={Calendar}
          priority={2}
          loading={loading}
        />
        <MetricCard
          title="Não Atendidos / Erros"
          value={stats.failed}
          description="falhas ou indisponíveis"
          trend={`${stats.failed} falhas registradas`}
          trendType={stats.failed > 0 ? 'negative' : 'neutral'}
          icon={XCircle}
          priority={2}
          loading={loading}
        />
        <MetricCard
          title="Total de Leads (CPFs)"
          value={stats.leads}
          description={`${stats.calls.toLocaleString('pt-BR')} telefones cadastrados`}
          trend={`${stats.calls.toLocaleString('pt-BR')} fones na base`}
          trendType="neutral"
          icon={FileText}
          priority={2}
          loading={loading}
        />
      </div>

      {/* Seção do Painel do Planejamento & Operações (4 Cards em Grid 2x2) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Card 1: Funil de Conversão Operacional */}
        <div className="rounded-xl bg-white p-4.5 border border-[#E5E7EB] shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#18181B] flex items-center gap-2">
              <Layers size={15} className="text-[#D9480F]" />
              Funil de Conversão do Disparo
            </h3>
            <p className="text-[11px] text-[#5F6570] mt-0.5">Evolução do volume da base até a formalização do acordo</p>
          </div>

          <div className="h-44 mt-3 flex items-center justify-center">
            {stats.leads > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData} layout="vertical" margin={{ top: 5, right: 15, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis type="number" stroke="#8B92A0" fontSize={10} />
                  <YAxis type="category" dataKey="etapa" stroke="#5F6570" fontSize={10} width={100} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E5E7EB', borderRadius: '8px', color: '#18181B', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.06)' }}
                    itemStyle={{ color: '#18181B' }}
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
        <div className="rounded-xl bg-white p-4.5 border border-[#E5E7EB] shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#18181B] flex items-center gap-2">
              <BarChart3 size={15} className="text-[#0369A1]" />
              Desempenho Comparativo por Campanha
            </h3>
            <p className="text-[11px] text-[#5F6570] mt-0.5">Contatos processados (Concluídos) em relação ao total importado por lote</p>
          </div>

          <div className="h-44 mt-3 flex items-center justify-center">
            {chartCampaignPerformance.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartCampaignPerformance} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="name" stroke="#5F6570" fontSize={10} />
                  <YAxis stroke="#8B92A0" fontSize={10} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E5E7EB', borderRadius: '8px', color: '#18181B', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.06)' }}
                    itemStyle={{ color: '#18181B' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="Concluídas" fill="#15803D" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Total" fill="#E5E7EB" radius={[4, 4, 0, 0]} />
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
        <div className="rounded-xl bg-white p-4.5 border border-[#E5E7EB] shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#18181B] flex items-center gap-2">
              <Activity size={15} className="text-[#15803D]" />
              Status de Resultados da Fila
            </h3>
            <p className="text-[11px] text-[#5F6570] mt-0.5">Proporção de acordos, rechamadas e falhas no banco de contatos</p>
          </div>

          <div className="h-44 mt-3 flex items-center justify-center">
            {chartStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartStatusData}
                    cx="50%"
                    cy="45%"
                    innerRadius={40}
                    outerRadius={62}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {chartStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E5E7EB', borderRadius: '8px', color: '#18181B', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.06)' }}
                    itemStyle={{ color: '#18181B' }}
                  />
                  <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
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
        <div className="rounded-xl bg-white p-4.5 border border-[#E5E7EB] shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] flex flex-col justify-between space-y-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#18181B] flex items-center gap-2">
              <ShieldCheck size={15} className="text-[#0369A1]" />
              Saúde da Operação & Pacing
            </h3>
            <p className="text-[11px] text-[#5F6570] mt-0.5">Métricas operacionais de chamadas e controle do dialer</p>
          </div>

          <div className="space-y-2 flex-1 justify-center flex flex-col">
            <div className="rounded-lg bg-[#FAFAFA] p-2.5 border border-[#E5E7EB] flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs text-[#18181B] font-semibold flex items-center gap-1.5">
                  <Zap size={13} className="text-[#D9480F]" />
                  Pacing Delay
                </span>
                <p className="text-[11px] text-[#5F6570]">Intervalo de segurança entre disparos</p>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-[#FFF1E8] text-[#B9380B] text-xs font-bold border border-[#FFD1B8]">
                500 ms
              </span>
            </div>

            <div className="rounded-lg bg-[#FAFAFA] p-2.5 border border-[#E5E7EB] flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs text-[#18181B] font-semibold flex items-center gap-1.5">
                  <RefreshCw size={13} className="text-[#15803D]" />
                  Auto-Retry SIP 408
                </span>
                <p className="text-[11px] text-[#5F6570]">Reagendamento automático de timeout</p>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-[#ECFDF3] text-[#15803D] text-xs font-bold border border-[#DCFCE7]">
                15 mins
              </span>
            </div>

            <div className="rounded-lg bg-[#FAFAFA] p-2.5 border border-[#E5E7EB] flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs text-[#18181B] font-semibold flex items-center gap-1.5">
                  <MessageSquare size={13} className="text-[#0369A1]" />
                  Fallback de Notificações
                </span>
                <p className="text-[11px] text-[#5F6570]">Smart RCS / N8N Webhook</p>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-[#F0F9FF] text-[#0369A1] text-xs font-bold border border-[#BAE6FD]">
                Ativo
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Resumo Executivo de Campanhas (Métricas Apenas) */}
      <div className="rounded-xl bg-white overflow-hidden border border-[#E5E7EB] shadow-[0_1px_3px_0_rgba(0,0,0,0.03)]">
        <div className="border-b border-[#E5E7EB] bg-[#FAFAFA] px-5 py-3.5 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#18181B]">Relatório de Campanhas</h3>
            <p className="text-[11px] text-[#5F6570] mt-0.5">Resumo de volume e desempenho dos lotes de disparo</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/campanhas')}
            className="btn-click inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#D9480F] hover:bg-[#B9380B] text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
          >
            <Play size={13} />
            Ir para Campanhas & Disparador
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#FAFAFA] text-[11px] font-bold uppercase tracking-wider text-[#5F6570] border-b border-[#E5E7EB]">
              <tr>
                {['Campanha', 'Status', 'CPFs', 'Fila/Pendentes', 'Ativas', 'Atendidas', 'Concluídas', 'Falhas', 'Ação'].map((header) => (
                  <th key={header} className="px-5 py-2.5">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB] text-xs text-[#18181B]">
              {campaigns.map((campaign) => (
                <tr
                  key={campaign.id}
                  className="hover:bg-[#FFF7F2] transition-colors"
                >
                  <td className="px-5 py-3.5 font-bold text-[#18181B]">
                    {campaign.name}
                  </td>
                  <td className="px-5 py-3.5"><StatusBadge status={campaign.status} /></td>
                  <td className="px-5 py-3.5 text-[#5F6570] font-medium">{Number(campaign.total_leads || 0).toLocaleString('pt-BR')}</td>
                  <td className="px-5 py-3.5 font-medium text-[#0369A1]">{Number(campaign.pending_calls || 0)}</td>
                  <td className="px-5 py-3.5 font-medium text-[#15803D]">{Number(campaign.active_calls || 0)}</td>
                  <td className="px-5 py-3.5 font-semibold text-[#15803D]">{Number(campaign.answered_calls || 0)}</td>
                  <td className="px-5 py-3.5 font-medium text-[#D9480F]">{Number(campaign.completed_calls || 0)}</td>
                  <td className="px-5 py-3.5 font-medium text-[#B91C1C]">{Number(campaign.failed_calls || 0)}</td>
                  <td className="px-5 py-3.5">
                    <button
                      type="button"
                      title="Ver Fila de Contatos no Disparador"
                      onClick={() => navigate(`/campanhas?id=${campaign.id}`)}
                      className="btn-click rounded-lg bg-[#FFF1E8] hover:bg-[#FFD1B8] px-2.5 py-1 text-[#B9380B] border border-[#FFD1B8] text-xs font-semibold flex items-center gap-1 transition-colors"
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
    <Drawer
      isOpen={!!call}
      onClose={onClose}
      title={`Detalhes da Ligação #${call.id}`}
      subtitle={`CPF: ${call.cpf || '-'} | Telefone: ${call.customer_number}`}
    >
      <div className="space-y-5">
        {/* Informações Gerais */}
        <div className="rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] p-4 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#D9480F]">Informações Gerais</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[#5F6570] block text-[11px]">Status da Fila</span>
              <span className="font-bold text-[#18181B] capitalize">
                {call.status === 'skipped' ? 'Pulado' : call.status}
              </span>
            </div>
            <div>
              <span className="text-[#5F6570] block text-[11px]">Tentativas</span>
              <span className="font-bold text-[#18181B]">{call.attempts} / 5</span>
            </div>
            <div>
              <span className="text-[#5F6570] block text-[11px]">Duração</span>
              <span className="font-bold text-[#18181B]">
                {call.duration_seconds ? `${call.duration_seconds} segundos` : '-'}
              </span>
            </div>
            <div>
              <span className="text-[#5F6570] block text-[11px]">Acordo / Decisão</span>
              <span className="font-bold">
                {call.decision === 'formalize' && <span className="text-[#15803D]">Formalizado</span>}
                {call.decision === 'schedule' && <span className="text-[#B45309]">Reagendado</span>}
                {call.decision === 'zero' && (
                  <span className="text-[#B91C1C]">
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
                  <span className="text-[#5F6570]">
                    {call.last_error === 'already_has_agreement' && `Já possui acordo formalizado${call.metadata?.calculationId || call.metadata?.debtorId ? ` (Cadastro DDM #${call.metadata.calculationId || call.metadata.debtorId})` : ''}`}
                    {call.last_error === 'no_online_agreement' && `Acordo online não permitido${call.metadata?.calculationId || call.metadata?.debtorId ? ` (Cadastro DDM #${call.metadata.calculationId || call.metadata.debtorId})` : ''}`}
                    {call.last_error === 'no_debt' && 'Sem débito em aberto'}
                    {call.last_error === 'cpf_missing' && 'CPF ausente'}
                    {!['already_has_agreement', 'no_online_agreement', 'no_debt', 'cpf_missing'].includes(call.last_error || '') && 'Não discado'}
                  </span>
                )}
                {!call.decision && call.status !== 'skipped' && <span className="text-[#8B92A0]">Pendente</span>}
              </span>
            </div>
          </div>
        </div>

        {/* Telefones deste CPF */}
        <div className="rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] p-4 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#D9480F]">Telefones Cadastrados (CPF)</h4>
          {loadingPhones ? (
            <p className="text-xs text-[#5F6570] animate-pulse">Carregando telefones...</p>
          ) : cpfPhones.length > 0 ? (
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {cpfPhones.map((item) => {
                const isCurrent = item.customer_number === call.customer_number;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between text-xs p-2.5 rounded-lg border ${
                      isCurrent
                        ? 'bg-[#FFF1E8] border-[#FFD1B8] text-[#B9380B] font-bold'
                        : 'bg-white border-[#E5E7EB] text-[#18181B]'
                    }`}
                  >
                    <span className="font-mono">{item.customer_number}</span>
                    <div className="flex items-center gap-1.5">
                      {item.attempts > 0 && (
                        <span className="text-[10px] text-[#5F6570] bg-[#FAFAFA] border border-[#E5E7EB] px-1.5 py-0.5 rounded">
                          {item.attempts} tent.
                        </span>
                      )}
                      <span className={`capitalize px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        item.status === 'completed'
                          ? 'bg-[#ECFDF3] text-[#15803D]'
                          : item.status === 'failed'
                          ? 'bg-[#FEF2F2] text-[#B91C1C]'
                          : item.status === 'skipped'
                          ? 'bg-[#FAFAFA] text-[#5F6570]'
                          : 'bg-[#F0F9FF] text-[#0369A1]'
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
            <p className="text-xs text-[#8B92A0]">Nenhum outro telefone encontrado.</p>
          )}
        </div>

        {/* Audio Player Card */}
        {call.recording_url ? (
          <div className="rounded-xl border border-[#DCFCE7] bg-[#ECFDF3] p-4 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#15803D] flex items-center gap-1.5 font-bold">
              <Volume2 size={14} /> Gravação do Áudio
            </h4>
            <audio 
              src={call.provider_call_id 
                ? apiUrl(`/calls/${call.provider_call_id}/recording?token=${getToken()}`) 
                : call.recording_url || undefined} 
              controls 
              className="w-full mt-1 rounded-lg" 
            />
          </div>
        ) : (
          <div className="rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] p-3 text-center text-[#8B92A0] text-xs">
            Nenhum áudio de gravação disponível para esta chamada.
          </div>
        )}

        {/* Last Error if exists */}
        {call.last_error && (
          <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-3 space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#B91C1C]">Erro Registrado</h4>
            <p className="text-xs text-[#18181B] font-mono break-all">{call.last_error}</p>
          </div>
        )}

        {/* Transcrição da Conversa */}
        <div className="rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] p-4 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#0369A1] flex items-center gap-1.5 border-b border-[#E5E7EB] pb-2 font-bold">
            <MessageSquare size={14} /> Transcrição da Conversa (Júlia IA)
          </h4>
          
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {bubbles.length > 0 ? (
              bubbles.map((bubble, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${bubble.isAssistant ? 'items-end' : 'items-start'}`}
                >
                  <span className="text-[10px] text-[#5F6570] mb-0.5 px-1">{bubble.speaker}</span>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      bubble.isAssistant
                        ? 'bg-[#FFF1E8] text-[#B9380B] border border-[#FFD1B8] rounded-tr-none font-semibold'
                        : 'bg-white text-[#18181B] rounded-tl-none border border-[#E5E7EB]'
                    }`}
                  >
                    {bubble.text}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center text-[#8B92A0] text-xs gap-1.5">
                <FileText size={20} />
                <span>Nenhuma transcrição de texto disponível.</span>
              </div>
            )}
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-[#5F6570] hover:bg-[#FAFAFA] hover:text-[#18181B] text-xs font-semibold transition-colors shadow-xs"
          >
            Fechar Detalhes
          </button>
        </div>
      </div>
    </Drawer>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-lg space-y-4 rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-2xl text-[#18181B]"
      >
        <h3 className="text-base font-bold text-[#18181B] border-b border-[#E5E7EB] pb-3">
          {campaign ? 'Editar Configurações da Campanha' : 'Criar Nova Campanha'}
        </h3>

        <div className="space-y-1">
          <label className="block text-xs font-bold uppercase tracking-wider text-[#5F6570]">Nome da Campanha</label>
          <input
            name="name"
            required
            defaultValue={campaign?.name}
            placeholder="Ex: Cobrança UVA Vencidos Julho"
            className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[#18181B] focus:outline-none focus:border-[#D9480F] focus:ring-2 focus:ring-[#D9480F]/14 text-xs font-medium transition-all"
          />
        </div>

        <div className="rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-[#D9480F]">Agente de Voz & Carteira</p>
          {loadingConfig && <p className="text-xs text-[#5F6570]">Verificando dados Vapi...</p>}
          {configError && <p className="text-xs text-[#B91C1C]">{configError}</p>}
          {vapiConfig && (
            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#18181B]">Selecionar Assistente Virtual (Carteira)</label>
                <select
                  value={selectedAssistantId}
                  onChange={(e) => setSelectedAssistantId(e.target.value)}
                  className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[#18181B] focus:outline-none focus:border-[#D9480F] focus:ring-2 focus:ring-[#D9480F]/14 text-xs font-semibold cursor-pointer transition-all"
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
                  <label className="block text-xs font-semibold text-[#18181B]">ID do Assistente Vapi</label>
                  <input
                    value={customAssistantId}
                    onChange={(e) => setCustomAssistantId(e.target.value)}
                    required={selectedAssistantId === 'custom'}
                    placeholder="Cole o ID da Vapi (ex: 15190261-096d-47fe-bbbe-cbfe8dceb2ae)"
                    className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[#18181B] focus:outline-none focus:border-[#D9480F] focus:ring-2 focus:ring-[#D9480F]/14 text-xs font-mono transition-all"
                  />
                </div>
              )}

              <div className="pt-2 border-t border-[#E5E7EB] flex justify-between items-center text-[11px] text-[#5F6570]">
                <span>Telefone de Saída Vapi:</span>
                <strong className="font-semibold text-[#18181B]">{vapiConfig.phoneNumber.number}</strong>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#5F6570]">Limitar Concorrência</label>
            <input
              name="maxConcurrent"
              required
              defaultValue={campaign ? String(campaign.max_concurrent) : '10'}
              min="1"
              type="number"
              className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[#18181B] focus:outline-none focus:border-[#D9480F] focus:ring-2 focus:ring-[#D9480F]/14 text-xs transition-all"
            />
            <p className="text-[10px] text-[#8B92A0] mt-1 leading-normal">
              Recomendado: <b>30</b> chamadas simultâneas.
            </p>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#5F6570]">Máximo Tentativas</label>
            <input
              name="maxAttempts"
              required
              defaultValue={campaign ? String(campaign.max_attempts ?? 5) : '5'}
              min="1"
              type="number"
              className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[#18181B] focus:outline-none focus:border-[#D9480F] focus:ring-2 focus:ring-[#D9480F]/14 text-xs transition-all"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-2 text-[#5F6570] hover:bg-[#FAFAFA] hover:text-[#18181B] text-xs font-semibold transition-colors shadow-xs"
          >
            Cancelar
          </button>
          <button
            disabled={saving || loadingConfig || !vapiConfig}
            className="rounded-lg bg-[#D9480F] hover:bg-[#B9380B] px-4 py-2 text-white font-semibold text-xs transition-colors disabled:opacity-40 shadow-xs"
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
    <div className="max-w-xl rounded-xl bg-white border border-[#E5E7EB] shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] p-6 space-y-5 text-[#18181B]">
      <div className="border-b border-[#E5E7EB] pb-3.5">
        <h2 className="text-lg font-extrabold text-[#18181B] flex items-center gap-2">
          <SettingsIcon size={20} className="text-[#D9480F]" />
          Configurações do Painel
        </h2>
        <p className="text-xs text-[#5F6570]">Gerencie tokens e acessos administrativos deste navegador</p>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-[#5F6570]">Token Administrativo (API Bearer)</label>
        <input
          value={token}
          type="password"
          onChange={(event) => setToken(event.target.value)}
          placeholder="Cole seu token de autenticação administrativa aqui"
          className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[#18181B] focus:outline-none focus:border-[#D9480F] focus:ring-2 focus:ring-[#D9480F]/14 text-xs font-mono transition-all"
        />
        <p className="text-[11px] text-[#8B92A0]">Este token é salvo no armazenamento local do seu navegador para assinar as requisições.</p>
      </div>

      <button
        type="button"
        onClick={() => {
          localStorage.setItem('callcenter_api_token', token);
          window.alert('Token administrativo salvo com sucesso neste navegador!');
        }}
        className="btn-click rounded-lg bg-[#D9480F] hover:bg-[#B9380B] px-4 py-2 font-semibold text-xs text-white transition-colors shadow-xs"
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
        className={`fixed left-0 top-0 h-screen w-60 border-r border-[#E5E7EB] bg-white text-[#18181B] flex flex-col justify-between p-5 z-50 shadow-[1px_0_4px_0_rgba(0,0,0,0.02)] transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-3">
              <div className="bg-white px-2.5 py-1.5 rounded-lg border border-[#E5E7EB] shadow-xs flex items-center justify-center">
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
              className="lg:hidden text-[#5F6570] hover:text-[#18181B] p-1"
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
                  className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-xs transition-colors ${
                    isActive
                      ? 'bg-[#FFF1E8] text-[#B9380B] font-bold border-l-[3px] border-[#D9480F]'
                      : 'text-[#5F6570] hover:bg-[#F8F9FB] hover:text-[#18181B] font-medium'
                  }`}
                >
                  <Icon size={16} className={isActive ? 'text-[#D9480F]' : 'text-[#5F6570]'} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] p-3 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8B92A0]">Ambiente de Operação</p>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#15803D]"></span>
            <span className="text-xs font-semibold text-[#18181B]">v2.4 (Vapi + DDM Pay)</span>
          </div>
        </div>
      </aside>
    </>
  );
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  return (
    <BrowserRouter basename={basePath || '/'}>
      <div className="min-h-screen bg-[#F6F7F9] text-[#18181B] flex relative overflow-x-hidden">
        <ThreeBackground />
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 min-w-0 flex flex-col lg:ml-60 transition-all">
          {/* Header Mobile com Toggle */}
          <header className="lg:hidden bg-white border-b border-[#E5E7EB] px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-xs">
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
