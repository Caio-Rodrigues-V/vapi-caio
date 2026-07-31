import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { UploadCloud, Download, PhoneCall, CheckCircle, Clock, Play, FileText, BarChart3, Users, Phone } from 'lucide-react';
import './index.css';

function Dashboard() {
  const [agentFilter, setAgentFilter] = useState('all');

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">KPIs de Acordos</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Visão geral e performance de conversão</p>
        </div>
        <div className="flex gap-4">
          <select 
            className="bg-white dark:bg-dark-surface border border-slate-300 dark:border-dark-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
          >
            <option value="all">Todos os Agentes</option>
            <option value="agent_1">Agente Cobrança 1</option>
            <option value="agent_2">Agente Cobrança 2</option>
          </select>
          <button className="btn-click bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2">
            <Download size={16} />
            Exportar KPIs
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-dark-surface p-6 rounded-xl border border-slate-200 dark:border-dark-border shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-slate-500 dark:text-slate-400 text-sm font-semibold uppercase tracking-wider">Tentativas</h3>
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-primary"><PhoneCall size={20} /></div>
          </div>
          <p className="text-3xl font-bold text-slate-800 dark:text-white">1,240</p>
        </div>
        <div className="bg-white dark:bg-dark-surface p-6 rounded-xl border border-slate-200 dark:border-dark-border shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-slate-500 dark:text-slate-400 text-sm font-semibold uppercase tracking-wider">Taxa de Atendimento</h3>
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-secondary"><Phone size={20} /></div>
          </div>
          <p className="text-3xl font-bold text-slate-800 dark:text-white">42.5%</p>
          <p className="text-xs text-slate-500 mt-2">* Em cima da tentativa</p>
        </div>
        <div className="bg-white dark:bg-dark-surface p-6 rounded-xl border border-slate-200 dark:border-dark-border shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-slate-500 dark:text-slate-400 text-sm font-semibold uppercase tracking-wider">Conversão (Acordos)</h3>
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-success"><CheckCircle size={20} /></div>
          </div>
          <p className="text-3xl font-bold text-slate-800 dark:text-white">15.2%</p>
          <p className="text-xs text-slate-500 mt-2">* Em cima da atendida</p>
        </div>
      </div>
    </div>
  );
}

function CallsList() {
  const [calls, setCalls] = useState<any[]>([]);

  const fetchCalls = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/calls');
      const data = await res.json();
      if (Array.isArray(data)) setCalls(data);
    } catch (e) {
      console.log('API não conectada (esperado sem DB local)');
    }
  };

  useEffect(() => {
    fetchCalls();
  }, []);

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Ligações Realizadas</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Histórico e tabulações</p>
        </div>
        <div className="flex gap-4">
          <button className="btn-click bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white border border-slate-300 dark:border-dark-border px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2">
            <Download size={16} />
            Exportar Transcrições
          </button>
          <button className="btn-click bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2">
            <Download size={16} />
            Exportar Ligações
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-dark-border">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Telefone</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Decisão LLM</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Data</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-dark-border">
              {calls.length > 0 ? calls.map(call => (
                <tr key={call.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-slate-800 dark:text-slate-300 font-medium">{call.telefone}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${call.status === 'Concluído' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                      {call.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {call.decisao || '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{call.data}</td>
                  <td className="px-6 py-4 text-sm">
                    <button className="text-primary hover:text-primary-hover font-medium mr-4">Transcr.</button>
                    <button className="text-secondary hover:text-slate-800 dark:hover:text-white font-medium">Modelo DDM</button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">
                    Nenhuma chamada na fila.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ImportBase() {
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      alert(`Upload concluído! Contatos válidos inseridos na fila: ${data.contatosValidos}`);
    } catch (error) {
      alert('Erro ao enviar arquivo. Verifique se a API e o MySQL estão rodando.');
    } finally {
      setUploading(false);
    }
  };

  const startWorker = async () => {
    try {
      await fetch('http://localhost:3000/api/worker/start', { method: 'POST' });
      alert('Comando enviado! O Worker começou a disparar a fila em background.');
    } catch (error) {
      alert('Erro ao acionar o worker.');
    }
  };

  return (
    <div className="animate-fade-in max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Importar Base de Telefones</h2>
      <p className="text-slate-500 dark:text-slate-400 mb-8">Suba sua planilha para a fila de disparo. O layout atual permite bases mais abrangentes.</p>

      <div className="bg-white dark:bg-dark-surface p-10 rounded-xl border-2 border-dashed border-slate-300 dark:border-dark-border text-center mb-8 hover:border-primary transition-colors group">
        <div className="bg-orange-100 dark:bg-orange-900/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
          <UploadCloud className="text-primary" size={32} />
        </div>
        <h3 className="text-lg font-medium text-slate-800 dark:text-white mb-2">Arraste sua planilha aqui</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
          Suporte para CSV ou Excel (.xlsx). A coluna "telefone" será extraída e normalizada.
        </p>
        <label className="btn-click bg-primary hover:bg-primary-hover text-white px-6 py-3 rounded-md font-medium cursor-pointer inline-block">
          {uploading ? 'Enviando e processando...' : 'Procurar Arquivo Local'}
          <input type="file" accept=".csv, .xlsx" className="hidden" onChange={handleFileUpload} />
        </label>
      </div>

      <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-200 dark:border-dark-border flex items-center justify-between">
        <div>
          <h3 className="text-slate-800 dark:text-white font-medium mb-1">Worker de Disparo</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Dispare manualmente a fila agora mesmo (para testes).</p>
        </div>
        <button onClick={startWorker} className="btn-click bg-white dark:bg-dark-surface border border-slate-300 dark:border-dark-border hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-white px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2">
          <Play size={16} className="text-primary" />
          Executar Agora
        </button>
      </div>
    </div>
  );
}

function Sidebar() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 h-screen fixed left-0 top-0 flex flex-col text-slate-300">
      <div className="p-6 flex items-center gap-3">
        <div className="bg-primary w-8 h-8 rounded-lg flex items-center justify-center">
          <PhoneCall size={18} className="text-white" />
        </div>
        <span className="font-bold text-white text-lg tracking-tight">Callcenter IA</span>
      </div>
      
      <nav className="flex-1 px-4 py-4 space-y-1">
        <Link to="/" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/') ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-slate-800 hover:text-white'}`}>
          <BarChart3 size={20} />
          <span>KPIs de Acordos</span>
        </Link>
        <Link to="/ligacoes" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/ligacoes') ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-slate-800 hover:text-white'}`}>
          <FileText size={20} />
          <span>Ligações</span>
        </Link>
        <Link to="/importar" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive('/importar') ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-slate-800 hover:text-white'}`}>
          <Users size={20} />
          <span>Importar Base</span>
        </Link>
      </nav>
    </aside>
  );
}

function App() {
  // Configurando dark mode forçado pelo HTML do Vercel
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-slate-50 dark:bg-dark-bg transition-colors duration-200">
        <Sidebar />
        <main className="flex-1 ml-64 p-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/ligacoes" element={<CallsList />} />
            <Route path="/importar" element={<ImportBase />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
