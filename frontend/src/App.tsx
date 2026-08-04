import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { BarChart3, FileText, Pause, PhoneCall, Play, Plus, RefreshCw, UploadCloud } from 'lucide-react';
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
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(apiUrl(path), { ...init, headers });
  if (response.status === 401) localStorage.removeItem('callcenter_api_token');
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Erro ao consultar a API');
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
};

type CallRow = {
  id: number;
  customer_number: string;
  cpf?: string | null;
  status: string;
  decision?: string | null;
  attempts: number;
  updated_at?: string | null;
};

type VapiConfig = {
  operation: string;
  assistant: { id: string; name: string };
  phoneNumber: { id: string; number: string };
};

function StatusBadge({ status }: { status: string }) {
  return <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-200">{status}</span>;
}

function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch('/campaigns?limit=100');
      setCampaigns(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar campanhas');
    } finally {
      setLoading(false);
    }
  }

  async function loadCalls(id: number) {
    setSelectedId(id);
    const result = await apiFetch(`/campaigns/${id}/calls?limit=100`);
    setCalls(Array.isArray(result.data) ? result.data : []);
  }

  async function changeStatus(id: number, status: string) {
    await apiFetch(`/campaigns/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load();
  }

  async function importFile(id: number, file?: File) {
    if (!file) return;
    try {
      const preparedFile = await prepareImportFile(file);
      const form = new FormData();
      form.append('file', preparedFile);
      const result = await apiFetch(`/campaigns/${id}/import`, { method: 'POST', body: form });
      window.alert(`Inseridos: ${result.inserted} | Ignorados: ${result.ignored}`);
      await load();
      if (selectedId === id) await loadCalls(id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Erro ao importar arquivo');
    }
  }

  useEffect(() => { void load(); }, []);

  const totals = useMemo(() => campaigns.reduce((acc, item) => ({
    campaigns: acc.campaigns + 1,
    calls: acc.calls + Number(item.total_calls || 0),
    active: acc.active + Number(item.active_calls || 0),
    completed: acc.completed + Number(item.completed_calls || 0),
  }), { campaigns: 0, calls: 0, active: 0, completed: 0 }), [campaigns]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-2xl font-bold text-white">Campanhas</h2><p className="text-sm text-slate-400">Operação de chamadas telefônicas via Vapi</p></div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="rounded-md border border-dark-border bg-dark-surface px-4 py-2 text-white"><RefreshCw size={16} className="inline mr-2" />Atualizar</button>
          <button onClick={() => setShowCreate(true)} className="rounded-md bg-primary px-4 py-2 text-white"><Plus size={16} className="inline mr-2" />Nova campanha</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[['Campanhas', totals.campaigns], ['Contatos', totals.calls], ['Ativas', totals.active], ['Concluídas', totals.completed]].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-dark-border bg-dark-surface p-5"><p className="text-xs uppercase text-slate-400">{label}</p><p className="mt-2 text-3xl font-bold text-white">{value}</p></div>
        ))}
      </div>

      {error && <p className="text-red-400">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-dark-border bg-dark-surface">
        <table className="w-full text-left">
          <thead className="bg-slate-800 text-xs uppercase text-slate-400"><tr>{['Campanha', 'Status', 'Fila', 'Ativas', 'Concluídas', 'Falhas', 'Ações'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-dark-border">
            {campaigns.map((campaign) => (
              <tr key={campaign.id} className="text-sm text-slate-300">
                <td className="px-4 py-4"><button className="font-medium text-white hover:text-primary" onClick={() => void loadCalls(campaign.id)}>{campaign.name}</button></td>
                <td className="px-4 py-4"><StatusBadge status={campaign.status} /></td>
                <td className="px-4 py-4">{Number(campaign.pending_calls || 0)}</td>
                <td className="px-4 py-4">{Number(campaign.active_calls || 0)}</td>
                <td className="px-4 py-4">{Number(campaign.completed_calls || 0)}</td>
                <td className="px-4 py-4">{Number(campaign.failed_calls || 0)}</td>
                <td className="px-4 py-4"><div className="flex flex-wrap gap-2">
                  {campaign.status !== 'running' && <button title="Iniciar" onClick={() => void changeStatus(campaign.id, 'running')} className="rounded bg-emerald-950 p-2 text-emerald-300"><Play size={15} /></button>}
                  {campaign.status === 'running' && <button title="Pausar" onClick={() => void changeStatus(campaign.id, 'paused')} className="rounded bg-amber-950 p-2 text-amber-300"><Pause size={15} /></button>}
                  <label title="Importar CSV/XLSX" className="cursor-pointer rounded bg-slate-800 p-2 text-slate-200"><UploadCloud size={15} /><input className="hidden" type="file" accept=".csv,.xlsx,.xls" onChange={(e) => void importFile(campaign.id, e.target.files?.[0])} /></label>
                </div></td>
              </tr>
            ))}
            {!campaigns.length && <tr><td colSpan={7} className="px-6 py-10 text-center text-slate-400">{loading ? 'Carregando...' : 'Nenhuma campanha criada.'}</td></tr>}
          </tbody>
        </table>
      </div>

      {selectedId && <div className="rounded-xl border border-dark-border bg-dark-surface p-5"><h3 className="mb-4 text-lg font-semibold text-white">Chamadas da campanha #{selectedId}</h3><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-slate-400"><tr>{['Telefone', 'CPF', 'Status', 'Tentativas', 'Decisão', 'Atualização'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead><tbody className="divide-y divide-dark-border">{calls.map((call) => <tr key={call.id} className="text-slate-300"><td className="px-3 py-3">{call.customer_number}</td><td className="px-3 py-3">{call.cpf || '-'}</td><td className="px-3 py-3"><StatusBadge status={call.status} /></td><td className="px-3 py-3">{call.attempts}</td><td className="px-3 py-3">{call.decision || '-'}</td><td className="px-3 py-3">{call.updated_at ? new Date(call.updated_at).toLocaleString('pt-BR') : '-'}</td></tr>)}</tbody></table></div></div>}
      {showCreate && <CreateCampaign onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  );
}

function CreateCampaign({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
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
      .catch((error) => {
        if (active) setConfigError(error instanceof Error ? error.message : 'Erro ao carregar configuração Vapi');
      })
      .finally(() => {
        if (active) setLoadingConfig(false);
      });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vapiConfig) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await apiFetch('/campaigns', { method: 'POST', body: JSON.stringify({
        name: form.get('name'),
        assistantId: vapiConfig.assistant.id,
        phoneNumberId: vapiConfig.phoneNumber.id,
        maxConcurrent: Number(form.get('maxConcurrent') || 1),
        maxAttempts: Number(form.get('maxAttempts') || 5),
      }) });
      await onCreated(); onClose();
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Erro ao criar campanha'); }
    finally { setSaving(false); }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={submit} className="w-full max-w-lg space-y-4 rounded-xl border border-dark-border bg-dark-surface p-6">
    <h3 className="text-xl font-bold text-white">Nova campanha</h3>
    <label className="block text-sm text-slate-300">Nome<input name="name" required className="mt-1 w-full rounded-md border border-dark-border bg-slate-900 px-3 py-2 text-white" /></label>
    <div className="rounded-lg border border-dark-border bg-slate-900/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Operação Vapi</p>
      {loadingConfig && <p className="mt-2 text-sm text-slate-300">Carregando configuração UVA...</p>}
      {configError && <p className="mt-2 text-sm text-red-400">{configError}</p>}
      {vapiConfig && <div className="mt-3 space-y-3">
        <div><p className="text-xs text-slate-400">Assistant</p><p className="font-medium text-white">{vapiConfig.assistant.name}</p></div>
        <div><p className="text-xs text-slate-400">Número de saída</p><p className="font-medium text-white">{vapiConfig.phoneNumber.number}</p></div>
      </div>}
    </div>
    <label className="block text-sm text-slate-300">Concorrência<input name="maxConcurrent" required defaultValue="1" min="1" type="number" className="mt-1 w-full rounded-md border border-dark-border bg-slate-900 px-3 py-2 text-white" /></label>
    <label className="block text-sm text-slate-300">Máximo de tentativas<input name="maxAttempts" required defaultValue="5" min="1" type="number" className="mt-1 w-full rounded-md border border-dark-border bg-slate-900 px-3 py-2 text-white" /></label>
    <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-md border border-dark-border px-4 py-2 text-slate-300">Cancelar</button><button disabled={saving || loadingConfig || !vapiConfig} className="rounded-md bg-primary px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Salvando...' : 'Criar'}</button></div>
  </form></div>;
}

function Settings() {
  const [token, setToken] = useState(getToken());
  return <div className="max-w-xl"><h2 className="mb-6 text-2xl font-bold text-white">Configuração local</h2><label className="block text-sm text-slate-300">Token administrativo<input value={token} onChange={(e) => setToken(e.target.value)} className="mt-2 w-full rounded-md border border-dark-border bg-dark-surface px-3 py-2 text-white" /></label><button onClick={() => { localStorage.setItem('callcenter_api_token', token); window.alert('Token salvo neste navegador.'); }} className="mt-4 rounded-md bg-primary px-4 py-2 text-white">Salvar</button></div>;
}

function Sidebar() {
  const location = useLocation();
  const links = [['/', 'Campanhas', BarChart3], ['/configuracoes', 'Configurações', FileText]] as const;
  return <aside className="fixed left-0 top-0 h-screen w-64 border-r border-slate-800 bg-slate-900 text-slate-300"><div className="flex items-center gap-3 p-6"><PhoneCall className="text-primary" /><span className="font-bold text-white">Vapi Call Center</span></div><nav className="space-y-1 px-4">{links.map(([path,label,Icon]) => <Link key={path} to={path} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${location.pathname === path ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}><Icon size={20} />{label}</Link>)}</nav></aside>;
}

export default function App() {
  useEffect(() => document.documentElement.classList.add('dark'), []);
  return <BrowserRouter basename={basePath || '/'}><div className="min-h-screen bg-dark-bg"><Sidebar /><main className="ml-64 p-8"><Routes><Route path="/" element={<Campaigns />} /><Route path="/configuracoes" element={<Settings />} /></Routes></main></div></BrowserRouter>;
}
