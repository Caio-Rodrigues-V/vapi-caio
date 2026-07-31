import { useEffect, useState } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { BarChart3, Download, FileText, Phone, PhoneCall, Play, UploadCloud, Users } from 'lucide-react';
import './index.css';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const apiUrl = (path: string) => `${basePath}/api${path}`;

type CallRow = {
  id: number;
  telefone: string;
  status: string;
  decisao?: string | null;
  data?: string | null;
};

function Dashboard() {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">KPIs de Acordos</h2>
          <p className="text-slate-400 text-sm">Visão geral e performance de conversão</p>
        </div>
        <button className="bg-primary text-white px-4 py-2 rounded-md flex items-center gap-2">
          <Download size={16} /> Exportar KPIs
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          ['Tentativas', '—', PhoneCall],
          ['Taxa de Atendimento', '—', Phone],
          ['Conversão', '—', BarChart3],
        ].map(([label, value, Icon]) => (
          <div key={String(label)} className="bg-dark-surface p-6 rounded-xl border border-dark-border">
            <div className="flex justify-between mb-4">
              <span className="text-slate-400 text-sm uppercase">{String(label)}</span>
              <Icon size={20} className="text-primary" />
            </div>
            <p className="text-3xl font-bold text-white">{String(value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CallsList() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(apiUrl('/calls'))
      .then(async (response) => {
        if (!response.ok) throw new Error('Falha ao consultar chamadas');
        return response.json();
      })
      .then((data) => setCalls(Array.isArray(data) ? data : []))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Ligações Realizadas</h2>
      {error && <p className="text-red-400 mb-4">{error}</p>}
      <div className="bg-dark-surface rounded-xl border border-dark-border overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-800">
            <tr>{['Telefone', 'Status', 'Decisão LLM', 'Data'].map((item) => <th key={item} className="px-6 py-4 text-xs text-slate-400 uppercase">{item}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-dark-border">
            {calls.map((call) => (
              <tr key={call.id}>
                <td className="px-6 py-4 text-slate-300">{call.telefone}</td>
                <td className="px-6 py-4 text-slate-300">{call.status}</td>
                <td className="px-6 py-4 text-slate-300">{call.decisao || '-'}</td>
                <td className="px-6 py-4 text-slate-400">{call.data ? new Date(call.data).toLocaleString('pt-BR') : '-'}</td>
              </tr>
            ))}
            {!calls.length && <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">Nenhuma chamada encontrada.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImportBase() {
  const [uploading, setUploading] = useState(false);

  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(apiUrl('/upload'), { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro no upload');
      alert(`Contatos válidos inseridos: ${data.contatosValidos}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao enviar arquivo');
    } finally {
      setUploading(false);
    }
  }

  async function startWorker() {
    const token = window.prompt('Informe o token do disparo manual:');
    if (!token) return;
    const response = await fetch(apiUrl('/worker/start'), {
      method: 'POST',
      headers: { 'x-worker-token': token },
    });
    const data = await response.json();
    alert(response.ok ? data.message : data.error || 'Erro ao iniciar worker');
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-white mb-2">Importar Base</h2>
      <p className="text-slate-400 mb-8">Envie um arquivo CSV com telefone e CPF.</p>
      <div className="bg-dark-surface p-10 rounded-xl border-2 border-dashed border-dark-border text-center mb-8">
        <UploadCloud className="text-primary mx-auto mb-4" size={40} />
        <label className="bg-primary text-white px-6 py-3 rounded-md cursor-pointer inline-block">
          {uploading ? 'Processando...' : 'Selecionar CSV'}
          <input type="file" accept=".csv,text/csv" className="hidden" disabled={uploading} onChange={(event) => upload(event.target.files?.[0])} />
        </label>
      </div>
      <button onClick={startWorker} className="bg-dark-surface border border-dark-border text-white px-4 py-2 rounded-md flex items-center gap-2">
        <Play size={16} className="text-primary" /> Executar worker agora
      </button>
    </div>
  );
}

function Sidebar() {
  const location = useLocation();
  const links = [
    ['/', 'KPIs', BarChart3],
    ['/ligacoes', 'Ligações', FileText],
    ['/importar', 'Importar Base', Users],
  ] as const;

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 h-screen fixed left-0 top-0 text-slate-300">
      <div className="p-6 flex items-center gap-3"><PhoneCall className="text-primary" /><span className="font-bold text-white">Callcenter IA</span></div>
      <nav className="px-4 space-y-1">
        {links.map(([path, label, Icon]) => (
          <Link key={path} to={path} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${location.pathname === path ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
            <Icon size={20} /> {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export default function App() {
  useEffect(() => document.documentElement.classList.add('dark'), []);
  return (
    <BrowserRouter basename={basePath || '/'}>
      <div className="min-h-screen bg-dark-bg">
        <Sidebar />
        <main className="ml-64 p-8"><Routes><Route path="/" element={<Dashboard />} /><Route path="/ligacoes" element={<CallsList />} /><Route path="/importar" element={<ImportBase />} /></Routes></main>
      </div>
    </BrowserRouter>
  );
}
