import { useState, useEffect, useCallback } from 'react';
import { Lock, Plus, Trash2, MapPin, Gift, Image, LogOut, Check, Radio, BarChart, Download, X, Edit2, Menu, Settings, Users } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '../lib/supabase';

// Standard light map tile
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';

function AdminMapCenterer({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords && coords.length > 0) {
      const bounds = L.latLngBounds(coords.map((c) => [c.latitude, c.longitude]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [coords, map]);
  return null;
}

const MENU_ITEMS = [
  { id: 'lojas',         icon: <MapPin size={18} />,    label: 'Lojas' },
  { id: 'brindes',      icon: <Gift size={18} />,       label: 'Brindes' },
  { id: 'anuncios',     icon: <Image size={18} />,      label: 'Anúncios' },
  { id: 'rotas',        icon: <Radio size={18} />,      label: 'Rotas' },
  { id: 'perfis',       icon: <Users size={18} />,      label: 'Perfis' },
  { id: 'history',      icon: <Check size={18} />,      label: 'Resgates' },
  { id: 'logs',         icon: <Check size={18} />,      label: 'Viagens' },
  { id: 'relatorios',   icon: <BarChart size={18} />,   label: 'Relatórios' },
  { id: 'configuracoes',icon: <Settings size={18} />,   label: 'Configurações' },
];

export default function Admin() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('licocarlos@gmail.com');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState('lojas');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);
  const [error, setError] = useState('');

  // Config state
  const [pontosAtivados, setPontosAtivados] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [history, setHistory] = useState([]);
  const [transmissionLogs, setTransmissionLogs] = useState([]);
  const [coordenadasCount, setCoordenadasCount] = useState(0);
  const [linhasStats, setLinhasStats] = useState({}); // { nomeLinha: count }

  // Map Visualization States
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [selectedRouteName, setSelectedRouteName] = useState('');
  const [routeCoordinates, setRouteCoordinates] = useState([]);

  // Data States
  const [lojas, setLojas] = useState([]);
  const [brindes, setBrindes] = useState([]);
  const [anuncios, setAnuncios] = useState([]);
  const [linhas, setLinhas] = useState([]);
  const [perfis, setPerfis] = useState([]);
  const [perfilSearch, setPerfilSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Form States
  const [newLoja, setNewLoja] = useState({ nome: '', latitude: '', longitude: '' });
  const [newBrinde, setNewBrinde] = useState({
    loja_id: '',
    nome_brinde: '',
    pontos_necessarios: 1000,
  });
  const [newAnuncio, setNewAnuncio] = useState({
    titulo: '',
    imagem_url: '',
    link_clique: '',
    data_inicio: '',
    data_fim: '',
    posicao: 'top',
  });
  const [newLinha, setNewLinha] = useState('');
  const [uploading, setUploading] = useState(false);

  // Edit States
  const [editingLojaId, setEditingLojaId] = useState(null);
  const [editingBrindeId, setEditingBrindeId] = useState(null);
  const [editingAnuncioId, setEditingAnuncioId] = useState(null);
  const [editingLinhaId, setEditingLinhaId] = useState(null);
  const [editLoja, setEditLoja] = useState({ nome: '', latitude: '', longitude: '' });
  const [editBrinde, setEditBrinde] = useState({ loja_id: '', nome_brinde: '', pontos_necessarios: 1000 });
  const [editAnuncio, setEditAnuncio] = useState({ titulo: '', imagem_url: '', link_clique: '', data_inicio: '', data_fim: '', posicao: 'top' });
  const [editLinha, setEditLinha] = useState('');

  // Responsive sidebar
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Load only the data needed for the active tab
  const loadTabData = useCallback(async () => {
    switch (tab) {
      case 'lojas': {
        const { data: l } = await supabase.from('lojas').select('*');
        if (l) setLojas(l);
        break;
      }
      case 'brindes': {
        // Brindes need lojas for the select dropdown
        const [{ data: l }, { data: b }] = await Promise.all([
          supabase.from('lojas').select('*'),
          supabase.from('brindes').select('*, lojas(nome)'),
        ]);
        if (l) setLojas(l);
        if (b) setBrindes(b);
        break;
      }
      case 'perfis': {
        const { data: p } = await supabase
          .from('perfis')
          .select('*')
          .order('pontos', { ascending: false })
          .limit(500);
        if (p) setPerfis(p);
        break;
      }
      case 'anuncios': {
        const { data: a } = await supabase.from('anuncios').select('*');
        if (a) setAnuncios(a);
        break;
      }
      case 'rotas': {
        const { data: routeList } = await supabase.from('linhas').select('*').order('nome');
        if (routeList) {
          setLinhas(routeList);
          // Fetch GPS point count for each line individually (exact, no new SQL needed)
          const counts = {};
          await Promise.all(
            routeList.map(async (l) => {
              const { count } = await supabase
                .from('historico_coordenadas')
                .select('*', { count: 'exact', head: true })
                .eq('linha_nome', l.nome);
              counts[l.nome] = count || 0;
            })
          );
          setLinhasStats(counts);
        }
        break;
      }
      case 'history': {
        let historyQuery = supabase.from('resgates').select('*, lojas(nome)');

        if (startDate) {
          historyQuery = historyQuery.gte('criado_em', `${startDate}T00:00:00`);
        }
        if (endDate) {
          historyQuery = historyQuery.lte('criado_em', `${endDate}T23:59:59`);
        }

        const { data: h, error: hError } = await historyQuery
          .order('criado_em', { ascending: false })
          .limit(1000);

        if (hError) {
          console.error('Erro ao buscar resgates:', hError);
          const { data: hFallback } = await supabase
            .from('resgates')
            .select('*')
            .order('criado_em', { ascending: false });
          if (hFallback) setHistory(hFallback);
        } else if (h) {
          setHistory(h);
        }
        break;
      }
      case 'logs': {
        const { data: tLogs } = await supabase
          .from('historico_transmissoes')
          .select('*')
          .order('inicio_em', { ascending: false })
          .limit(1000);
        if (tLogs) setTransmissionLogs(tLogs);
        break;
      }
      case 'relatorios': {
        const [{ data: tLogs }, { count: coordCount }] = await Promise.all([
          supabase.from('historico_transmissoes').select('*'),
          supabase.from('historico_coordenadas').select('*', { count: 'exact', head: true })
        ]);
        if (tLogs) setTransmissionLogs(tLogs);
        if (coordCount !== null) setCoordenadasCount(coordCount);
        break;
      }
      case 'configuracoes': {
        const { data: cfg } = await supabase.from('configuracoes').select('chave, valor');
        if (cfg) {
          const pontos = cfg.find((c) => c.chave === 'pontos_ativados');
          if (pontos) setPontosAtivados(pontos.valor === 'true');
        }
        break;
      }
    }
  }, [tab, startDate, endDate]);

  useEffect(() => {
    // Checar se já existe uma sessão ativa
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user?.email === 'licocarlos@gmail.com') {
        setIsLoggedIn(true);
      }
    });
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      loadTabData();
    }
  }, [isLoggedIn, tab, loadTabData]);

  const handleLogin = async () => {
    if (email !== 'licocarlos@gmail.com') {
      setError('Acesso restrito ao administrador oficial.');
      return;
    }

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (!loginError && data.user) {
      setIsLoggedIn(true);
      setError('');
    } else {
      setError('Acesso negado. Senha incorreta ou usuário não autorizado.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
  };

  const loadRouteOnMap = async (linhaNome) => {
    setSelectedRouteName(linhaNome);
    setRouteCoordinates([]);
    setShowRouteModal(true);
    const { data } = await supabase
      .from('historico_coordenadas')
      .select('latitude, longitude')
      .eq('linha_nome', linhaNome)
      .limit(5000); // Evitar estourar memória com +10k pontos
    if (data) setRouteCoordinates(data);
  };

  // Limpeza manual de cupons expirados (pg_cron não disponível no plano)
  const cleanupExpiredCoupons = async () => {
    if (!confirm('Limpar cupons expirados e devolver os pontos aos usuários?')) return;
    try {
      const { data, error } = await supabase.rpc('limpar_cupons_expirados');
      if (error) throw error;
      alert(`Limpeza concluída! ${data ?? 0} cupom(ns) expirado(s) processado(s). Pontos devolvidos.`);
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  };

  // Função para finalizar transmissões órfãs
  const cleanupStaleTransmissions = async () => {
    if (!confirm('Finalizar todas as transmissões abertas há mais de 60 minutos?')) return;

    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('historico_transmissoes')
        .update({
          fim_em: new Date().toISOString(),
          pontos_ganhos: 0
        })
        .is('fim_em', null)
        .lt('inicio_em', oneHourAgo)
        .select();

      if (error) throw error;

      // Remover posições órfãs
      await supabase
        .from('onibus_posicoes')
        .delete()
        .lt('ultima_atualizacao', oneHourAgo);

      alert(`${data?.length || 0} transmissão(ões) finalizada(s) com sucesso!`);
      loadTabData(); // Recarregar dados da aba atual
    } catch (err) {
      console.error('Erro na limpeza:', err);
      alert('Erro ao finalizar transmissões. Verifique o console.');
    }
  };

  // CRUD Lojas
  const addLoja = async () => {
    if (!newLoja.nome) return;
    await supabase.from('lojas').insert([newLoja]);
    setNewLoja({ nome: '', latitude: '', longitude: '' });
    loadTabData();
  };
  const deleteLoja = async (id) => {
    if (!confirm('Tem certeza que deseja excluir esta loja?')) return;
    await supabase.from('lojas').delete().eq('id', id);
    loadTabData();
  };

  // Edit Lojas
  const startEditLoja = (loja) => {
    setEditingLojaId(loja.id);
    setEditLoja({ nome: loja.nome, latitude: loja.latitude, longitude: loja.longitude });
  };
  const cancelEditLoja = () => {
    setEditingLojaId(null);
    setEditLoja({ nome: '', latitude: '', longitude: '' });
  };
  const saveEditLoja = async () => {
    await supabase.from('lojas').update(editLoja).eq('id', editingLojaId);
    cancelEditLoja();
    loadTabData();
  };

  // CRUD Brindes
  const addBrinde = async () => {
    if (!newBrinde.loja_id || !newBrinde.nome_brinde) return;
    await supabase.from('brindes').insert([newBrinde]);
    setNewBrinde({ loja_id: '', nome_brinde: '', pontos_necessarios: 1000 });
    loadTabData();
  };
  const deleteBrinde = async (id) => {
    if (!confirm('Tem certeza que deseja excluir este brinde?')) return;
    await supabase.from('brindes').delete().eq('id', id);
    loadTabData();
  };

  // Edit Brindes
  const startEditBrinde = (brinde) => {
    setEditingBrindeId(brinde.id);
    setEditBrinde({ loja_id: brinde.loja_id, nome_brinde: brinde.nome_brinde, pontos_necessarios: brinde.pontos_necessarios });
  };
  const cancelEditBrinde = () => {
    setEditingBrindeId(null);
    setEditBrinde({ loja_id: '', nome_brinde: '', pontos_necessarios: 1000 });
  };
  const saveEditBrinde = async () => {
    await supabase.from('brindes').update(editBrinde).eq('id', editingBrindeId);
    cancelEditBrinde();
    loadTabData();
  };

  // CRUD Anuncios
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `banners/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('banners')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('banners')
        .getPublicUrl(filePath);

      setNewAnuncio(prev => ({ ...prev, imagem_url: publicUrl }));
    } catch (err) {
      console.error('Erro no upload strength:', err);
      alert('Erro ao enviar imagem. Verifique se o bucket "banners" existe e é público.');
    } finally {
      setUploading(false);
    }
  };

  const addAnuncio = async () => {
    if (!newAnuncio.titulo || !newAnuncio.imagem_url) {
      alert('Preencha pelo menos o título e a imagem.');
      return;
    }
    await supabase.from('anuncios').insert([newAnuncio]);
    setNewAnuncio({
      titulo: '',
      imagem_url: '',
      link_clique: '',
      data_inicio: '',
      data_fim: '',
      posicao: 'top',
    });
    if (document.getElementById('banner-upload')) {
      document.getElementById('banner-upload').value = '';
    }
    loadTabData();
  };

  const deleteAnuncio = async (id, imageUrl) => {
    if (!confirm('Tem certeza que deseja excluir este anúncio?')) return;

    // Tentar apagar do storage se for um link interno
    if (imageUrl && imageUrl.includes('/storage/v1/object/public/banners/')) {
      try {
        const fileName = imageUrl.split('/').pop();
        await supabase.storage.from('banners').remove([`banners/${fileName}`]);
      } catch (err) {
        console.warn('Não foi possível remover imagem do storage:', err);
      }
    }

    await supabase.from('anuncios').delete().eq('id', id);
    loadTabData();
  };

  // Edit Anuncios
  const startEditAnuncio = (anuncio) => {
    setEditingAnuncioId(anuncio.id);
    setEditAnuncio({
      titulo: anuncio.titulo,
      imagem_url: anuncio.imagem_url,
      link_clique: anuncio.link_clique,
      data_inicio: anuncio.data_inicio,
      data_fim: anuncio.data_fim,
      posicao: anuncio.posicao || 'top'
    });
  };
  const cancelEditAnuncio = () => {
    setEditingAnuncioId(null);
    setEditAnuncio({ titulo: '', imagem_url: '', link_clique: '', data_inicio: '', data_fim: '', posicao: 'top' });
  };
  const saveEditAnuncio = async () => {
    await supabase.from('anuncios').update(editAnuncio).eq('id', editingAnuncioId);
    cancelEditAnuncio();
    loadTabData();
  };

  // CRUD Linhas (Rotas)
  const addLinha = async () => {
    if (!newLinha) return;
    await supabase.from('linhas').insert([{ nome: newLinha }]);
    setNewLinha('');
    loadTabData();
  };
  const deleteLinha = async (id) => {
    if (!confirm('Tem certeza que deseja excluir esta linha?')) return;
    await supabase.from('linhas').delete().eq('id', id);
    loadTabData();
  };

  // Edit Linhas
  const startEditLinha = (linha) => {
    setEditingLinhaId(linha.id);
    setEditLinha(linha.nome);
  };
  const cancelEditLinha = () => {
    setEditingLinhaId(null);
    setEditLinha('');
  };
  const saveEditLinha = async () => {
    await supabase.from('linhas').update({ nome: editLinha }).eq('id', editingLinhaId);
    cancelEditLinha();
    loadTabData();
  };

  const toggleValidarRota = async (linha) => {
    await supabase.from('linhas').update({ validar_rota: !linha.validar_rota }).eq('id', linha.id);
    loadTabData();
  };

  const togglePontos = async () => {
    const newVal = !pontosAtivados;
    setSavingConfig(true);
    await supabase.from('configuracoes').upsert({ chave: 'pontos_ativados', valor: String(newVal) });
    setPontosAtivados(newVal);
    setSavingConfig(false);
  };

  if (!isLoggedIn) {
    return (
      <div className="container" style={{ maxWidth: '400px' }}>
        <header>
          <h1>MeuBusApp Admin</h1>
          <p>Área restrita de gerenciamento.</p>
        </header>

        <div className="glass-panel" style={{ textAlign: 'center' }}>
          <Lock size={48} color="var(--primary)" style={{ marginBottom: '1.5rem' }} />
          <input
            type="email"
            value={email}
            disabled
            style={{ textAlign: 'center', marginBottom: '10px', background: 'rgba(255,255,255,0.05)', color: '#94a3b8' }}
          />
          <input
            type="password"
            placeholder="Senha Mestre"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyUp={(e) => e.key === 'Enter' && handleLogin()}
            style={{ textAlign: 'center' }}
            autoComplete="current-password"
          />
          {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}
          <button className="btn btn-primary" onClick={handleLogin}>
            Acessar Painel
          </button>
        </div>
      </div>
    );
  }

  const SIDEBAR_W = 220;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0f172a', position: 'relative' }}>

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside style={{
        width: SIDEBAR_W,
        background: '#1e293b',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: isMobile ? (sidebarOpen ? 0 : -SIDEBAR_W) : 0,
        transition: 'left 0.28s ease',
        zIndex: 2100,
        overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ padding: '1.4rem 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontWeight: 900, color: 'white', fontSize: '1.05rem', letterSpacing: '-0.5px' }}>MeuBusApp</div>
          <div style={{ fontSize: '0.65rem', color: '#10b981', marginTop: '2px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>Admin Dashboard</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, paddingTop: '0.5rem' }}>
          {MENU_ITEMS.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setTab(item.id); if (isMobile) setSidebarOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '0.75rem 1.2rem',
                  background: active ? 'rgba(16,185,129,0.12)' : 'transparent',
                  border: 'none',
                  borderLeft: `3px solid ${active ? '#10b981' : 'transparent'}`,
                  color: active ? '#10b981' : '#94a3b8',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.875rem',
                  fontWeight: active ? 700 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={handleLogout}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', borderRadius: '8px', padding: '0.6rem 1rem', cursor: 'pointer', width: '100%', fontSize: '0.85rem', fontWeight: 600 }}
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2099 }}
        />
      )}

      {/* ── Main content ────────────────────────────────── */}
      <div style={{
        marginLeft: isMobile ? 0 : SIDEBAR_W,
        flex: 1,
        padding: '1.5rem',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}>
        {/* Mobile top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ margin: 0, color: 'white', fontSize: '1.2rem' }}>
              {MENU_ITEMS.find((m) => m.id === tab)?.label || 'Dashboard'}
            </h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem' }}>MeuBusApp Admin</p>
          </div>
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(true)}
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', borderRadius: '8px', padding: '0.5rem 0.8rem', cursor: 'pointer' }}
            >
              <Menu size={22} />
            </button>
          )}
        </div>

      {tab === 'lojas' && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3>Cadastrar Nova Padaria/Loja</h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
              marginTop: '1rem',
            }}
          >
            <input
              placeholder="Nome da Loja"
              value={newLoja.nome}
              onChange={(e) => setNewLoja({ ...newLoja, nome: e.target.value })}
              style={{ gridColumn: 'span 2' }}
            />
            <input
              placeholder="Latitude"
              type="number"
              step="any"
              value={newLoja.latitude}
              onChange={(e) => setNewLoja({ ...newLoja, latitude: e.target.value })}
            />
            <input
              placeholder="Longitude"
              type="number"
              step="any"
              value={newLoja.longitude}
              onChange={(e) => setNewLoja({ ...newLoja, longitude: e.target.value })}
            />
          </div>
          <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={addLoja}>
            <Plus /> Salvar Loja
          </button>

          <hr style={{ margin: '2rem 0', opacity: 0.1 }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {lojas.map((l) => (
              <div
                key={l.id}
                className="glass-panel"
                style={{
                  padding: '0.8rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.05)',
                }}
              >
                {editingLojaId === l.id ? (
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '5px' }}>Editando:</div>
                    <input
                      placeholder="Nome da Loja"
                      value={editLoja.nome}
                      onChange={(e) => setEditLoja({ ...editLoja, nome: e.target.value })}
                      style={{ marginBottom: '5px' }}
                    />
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <input
                        placeholder="Latitude"
                        type="number"
                        step="any"
                        value={editLoja.latitude}
                        onChange={(e) => setEditLoja({ ...editLoja, latitude: e.target.value })}
                      />
                      <input
                        placeholder="Longitude"
                        type="number"
                        step="any"
                        value={editLoja.longitude}
                        onChange={(e) => setEditLoja({ ...editLoja, longitude: e.target.value })}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                      <button onClick={saveEditLoja} style={{ background: '#10b981', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '0.7rem' }}>✓ Salvar</button>
                      <button onClick={cancelEditLoja} style={{ background: '#64748b', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '0.7rem' }}>✕ Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <div style={{ fontWeight: 800 }}>{l.nome}</div>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                        {l.latitude}, {l.longitude}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/lojista/${l.id}`;
                          navigator.clipboard.writeText(url);
                          alert('Link copiado para o WhatsApp do Lojista!');
                        }}
                        title="Copiar Link Secreto"
                        style={{
                          background: 'var(--primary)',
                          color: 'white',
                          border: 'none',
                          padding: '5px 10px',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          fontSize: '0.7rem',
                        }}
                      >
                        Link Secreto
                      </button>
                      <button
                        onClick={() => startEditLoja(l)}
                        title="Editar loja"
                        style={{
                          padding: '5px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#60a5fa',
                        }}
                      >
                        <Edit2 size={20} />
                      </button>
                      <button
                        onClick={() => deleteLoja(l.id)}
                        aria-label={`Excluir loja ${l.nome}`}
                        style={{
                          padding: '5px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--danger)',
                        }}
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'brindes' && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3>Cadastrar Novo Brinde</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '1rem' }}>
            <select
              value={newBrinde.loja_id}
              onChange={(e) => setNewBrinde({ ...newBrinde, loja_id: e.target.value })}
            >
              <option value="">Escolha o estabelecimento...</option>
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
            <input
              placeholder="Nome do Brinde"
              value={newBrinde.nome_brinde}
              onChange={(e) => setNewBrinde({ ...newBrinde, nome_brinde: e.target.value })}
            />
            <input
              type="number"
              placeholder="Pontos Necessários"
              value={newBrinde.pontos_necessarios}
              onChange={(e) =>
                setNewBrinde({ ...newBrinde, pontos_necessarios: parseInt(e.target.value) || 0 })
              }
            />
          </div>
          <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={addBrinde}>
            <Plus /> Salvar Brinde
          </button>

          <hr style={{ margin: '2rem 0', opacity: 0.1 }} />

          {brindes.map((b) => (
            <div
              key={b.id}
              className="glass-panel"
              style={{
                padding: '1rem',
                marginBottom: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              {editingBrindeId === b.id ? (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '5px' }}>Editando:</div>
                  <select
                    value={editBrinde.loja_id}
                    onChange={(e) => setEditBrinde({ ...editBrinde, loja_id: e.target.value })}
                    style={{ marginBottom: '5px', width: '100%' }}
                  >
                    <option value="">Escolha o estabelecimento...</option>
                    {lojas.map((l) => (
                      <option key={l.id} value={l.id}>{l.nome}</option>
                    ))}
                  </select>
                  <input
                    placeholder="Nome do Brinde"
                    value={editBrinde.nome_brinde}
                    onChange={(e) => setEditBrinde({ ...editBrinde, nome_brinde: e.target.value })}
                    style={{ marginBottom: '5px' }}
                  />
                  <input
                    type="number"
                    placeholder="Pontos Necessários"
                    value={editBrinde.pontos_necessarios}
                    onChange={(e) => setEditBrinde({ ...editBrinde, pontos_necessarios: parseInt(e.target.value) || 0 })}
                    style={{ marginBottom: '5px' }}
                  />
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={saveEditBrinde} style={{ background: '#10b981', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '0.7rem' }}>✓ Salvar</button>
                    <button onClick={cancelEditBrinde} style={{ background: '#64748b', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '0.7rem' }}>✕ Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <div style={{ fontWeight: 800, color: 'var(--primary)' }}>{b.nome_brinde}</div>
                    <div style={{ fontSize: '0.8rem' }}>🏠 {b.lojas?.nome}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      🪙 {b.pontos_necessarios} MeuBusCoins
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button
                      onClick={() => startEditBrinde(b)}
                      title="Editar brinde"
                      style={{ color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', padding: '5px' }}
                    >
                      <Edit2 size={20} />
                    </button>
                    <button
                      onClick={() => deleteBrinde(b.id)}
                      aria-label={`Excluir brinde ${b.nome_brinde}`}
                      style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )
      }

      {
        tab === 'anuncios' && (
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3>Gestão de Publicidade</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '1rem' }}>
              <input
                placeholder="Título (Controle Interno)"
                value={newAnuncio.titulo}
                onChange={(e) => setNewAnuncio({ ...newAnuncio, titulo: e.target.value })}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Upload do Banner:</label>
                <input
                  id="banner-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploading}
                  style={{ marginBottom: '5px' }}
                />
                {uploading && <div style={{ fontSize: '0.7rem', color: 'var(--primary)' }}>Enviando imagem...</div>}
                {newAnuncio.imagem_url && !uploading && (
                  <div style={{ marginBottom: '10px' }}>
                    <img
                      src={newAnuncio.imagem_url}
                      alt="Preview"
                      style={{ width: '100px', height: '50px', objectFit: 'cover', borderRadius: '5px', border: '2px solid var(--primary)' }}
                    />
                    <div style={{ fontSize: '0.6rem', color: 'var(--primary)' }}>✓ Imagem pronta!</div>
                  </div>
                )}
              </div>
              <input
                placeholder="Ou cole a URL da Imagem (Mín 320x50)"
                value={newAnuncio.imagem_url}
                onChange={(e) => setNewAnuncio({ ...newAnuncio, imagem_url: e.target.value })}
              />
              <input
                placeholder="Link ao Clicar"
                value={newAnuncio.link_clique}
                onChange={(e) => setNewAnuncio({ ...newAnuncio, link_clique: e.target.value })}
              />
              <select
                value={newAnuncio.posicao}
                onChange={(e) => setNewAnuncio({ ...newAnuncio, posicao: e.target.value })}
                style={{ background: '#1e293b', color: 'white' }}
              >
                <option value="top" style={{ background: '#1e293b' }}>Topo da Tela (Header)</option>
                <option value="bottom" style={{ background: '#1e293b' }}>Rodapé da Tela</option>
                <option value="esquerda" style={{ background: '#1e293b' }}>Lateral Esquerda do Mapa</option>
                <option value="direita" style={{ background: '#1e293b' }}>Lateral Direita do Mapa</option>
              </select>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.7rem' }}>Início:</label>
                  <input
                    type="date"
                    value={newAnuncio.data_inicio}
                    onChange={(e) =>
                      setNewAnuncio({ ...newAnuncio, data_inicio: e.target.value })
                    }
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.7rem' }}>Fim:</label>
                  <input
                    type="date"
                    value={newAnuncio.data_fim}
                    onChange={(e) => setNewAnuncio({ ...newAnuncio, data_fim: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: '1rem' }}
              onClick={addAnuncio}
              disabled={uploading}
            >
              {uploading ? 'Aguarde Upload...' : <><Plus /> Agendar Anúncio</>}
            </button>

            <hr style={{ margin: '2rem 0', opacity: 0.1 }} />

            {anuncios.map((a) => {
              const clicks = a.clicks || 0;
              const views = a.visualizacoes || 0;
              const ctr = views > 0 ? ((clicks / views) * 100).toFixed(1) : 0;

              return (
                <div
                  key={a.id}
                  className="glass-panel"
                  style={{ padding: '0.8rem', marginBottom: '10px', display: 'flex', gap: '15px' }}
                >
                  <img
                    src={a.imagem_url}
                    alt={a.titulo}
                    style={{
                      width: '80px',
                      height: '40px',
                      objectFit: 'cover',
                      borderRadius: '5px',
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{a.titulo}</div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                      📅 {a.data_inicio} até {a.data_fim} | Posição: {a.posicao?.toUpperCase() || 'TOP'}
                    </div>
                    <div style={{ fontSize: '0.75rem', marginTop: '5px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                      <span style={{ color: '#60a5fa' }}>👁️ {views} views</span>
                      <span style={{ color: '#10b981' }}>🖱️ {clicks} clicks</span>
                      <span style={{ color: '#f59e0b' }}>📊 CTR: {ctr}%</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button
                      onClick={() => startEditAnuncio(a)}
                      title="Editar anúncio"
                      style={{ color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', padding: '5px' }}
                    >
                      <Edit2 size={20} />
                    </button>
                    <button
                      onClick={() => deleteAnuncio(a.id, a.imagem_url)}
                      aria-label={`Excluir anúncio ${a.titulo}`}
                      style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      }

      {/* Modal de Edição de Anúncio */}
      {editingAnuncioId && (
        <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '1rem', border: '2px solid #60a5fa' }}>
          <h3 style={{ color: '#60a5fa', marginBottom: '1rem' }}>✏️ Editando Anúncio: {editAnuncio.titulo}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              placeholder="Título (Controle Interno)"
              value={editAnuncio.titulo}
              onChange={(e) => setEditAnuncio({ ...editAnuncio, titulo: e.target.value })}
            />
            <input
              placeholder="Link ao Clicar"
              value={editAnuncio.link_clique}
              onChange={(e) => setEditAnuncio({ ...editAnuncio, link_clique: e.target.value })}
            />
            <select
              value={editAnuncio.posicao}
              onChange={(e) => setEditAnuncio({ ...editAnuncio, posicao: e.target.value })}
              style={{ background: '#1e293b', color: 'white' }}
            >
              <option value="top" style={{ background: '#1e293b' }}>Topo da Tela (Header)</option>
              <option value="bottom" style={{ background: '#1e293b' }}>Rodapé da Tela</option>
              <option value="esquerda" style={{ background: '#1e293b' }}>Lateral Esquerda do Mapa</option>
              <option value="direita" style={{ background: '#1e293b' }}>Lateral Direita do Mapa</option>
            </select>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.7rem' }}>Início:</label>
                <input
                  type="date"
                  value={editAnuncio.data_inicio}
                  onChange={(e) => setEditAnuncio({ ...editAnuncio, data_inicio: e.target.value })}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.7rem' }}>Fim:</label>
                <input
                  type="date"
                  value={editAnuncio.data_fim}
                  onChange={(e) => setEditAnuncio({ ...editAnuncio, data_fim: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveEditAnuncio}>
                ✓ Salvar Alterações
              </button>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={cancelEditAnuncio}>
                ✕ Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {
        tab === 'rotas' && (
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3>Gerenciar Linhas (Rotas)</h3>
            <div style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '0.75rem 1rem', marginTop: '0.5rem', marginBottom: '0.5rem', fontSize: '0.78rem', color: '#94a3b8' }}>
              🛡️ <strong style={{ color: '#10b981' }}>Validação de Rota:</strong> Ative por linha somente após ter 50+ pontos GPS gravados. Com ativo, apenas transmissões dentro de 200m da rota conhecida recebem MeuBusCoins.
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
              <input
                placeholder="Nome da Nova Linha (ex: Linha 05 - Itapoã)"
                value={newLinha}
                onChange={(e) => setNewLinha(e.target.value)}
              />
              <button
                className="btn btn-primary"
                style={{ width: 'auto' }}
                onClick={addLinha}
                aria-label="Adicionar linha"
              >
                <Plus />
              </button>
            </div>

            <hr style={{ margin: '2rem 0', opacity: 0.1 }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {linhas.map((l) => (
                <div
                  key={l.id}
                  className="glass-panel"
                  style={{
                    padding: '0.8rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.05)',
                  }}
                >
                  {editingLinhaId === l.id ? (
                    <div style={{ flex: 1, display: 'flex', gap: '5px', alignItems: 'center' }}>
                      <input
                        placeholder="Nome da Linha"
                        value={editLinha}
                        onChange={(e) => setEditLinha(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <button onClick={saveEditLinha} style={{ background: '#10b981', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '0.7rem' }}>✓</button>
                      <button onClick={cancelEditLinha} style={{ background: '#64748b', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '0.7rem' }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div style={{ fontWeight: 800 }}>{l.nome}</div>
                        {(() => {
                          const pts = linhasStats[l.nome] ?? null;
                          const ready = pts !== null && pts >= 50;
                          const color = pts === null ? '#475569'
                            : pts >= 200 ? '#10b981'
                            : pts >= 50  ? '#eab308'
                            : '#ef4444';
                          const label = pts === null ? '...'
                            : pts >= 200 ? `✅ ${pts} pts GPS`
                            : pts >= 50  ? `⚠️ ${pts} pts GPS`
                            : `❌ ${pts} pts GPS`;
                          return (
                            <div style={{ fontSize: '0.65rem', color, marginTop: '3px', fontWeight: 600 }}>
                              {label}
                              {pts !== null && pts < 50 && (
                                <span style={{ color: '#64748b', fontWeight: 400 }}> — precisa de {50 - pts} mais para validar</span>
                              )}
                              {ready && !l.validar_rota && (
                                <span style={{ color: '#eab308', fontWeight: 400 }}> — pronta para ativar!</span>
                              )}
                              {l.validar_rota && (
                                <span style={{ color: '#10b981' }}> — validação ON</span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <button
                          onClick={() => toggleValidarRota(l)}
                          title={l.validar_rota ? 'Desativar validação de rota' : 'Ativar validação de rota (requer dados suficientes)'}
                          style={{
                            background: l.validar_rota ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.07)',
                            border: `1px solid ${l.validar_rota ? '#10b981' : '#475569'}`,
                            color: l.validar_rota ? '#10b981' : '#94a3b8',
                            borderRadius: '6px',
                            padding: '3px 8px',
                            cursor: 'pointer',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                          }}
                        >
                          {l.validar_rota ? '🛡️ Rota ON' : '🔓 Rota OFF'}
                        </button>
                        <button
                          onClick={() => startEditLinha(l)}
                          title="Editar linha"
                          style={{
                            color: '#60a5fa',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '5px',
                          }}
                        >
                          <Edit2 size={20} />
                        </button>
                        <button
                          onClick={() => deleteLinha(l.id)}
                          aria-label={`Excluir linha ${l.nome}`}
                          style={{
                            color: 'var(--danger)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      }

      {
        tab === 'history' && (
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3>Histórico de Resgates (Auditoria)</h3>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '1rem' }}>
              Acompanhe o que está acontecendo nas padarias parceiras.
            </p>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '2rem',
                alignItems: 'flex-end',
                background: 'rgba(255,255,255,0.02)',
                padding: '1rem',
                borderRadius: '10px',
              }}
            >
              <div style={{ flex: 1 }}>
                <label
                  style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '5px' }}
                >
                  Data Inicial:
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label
                  style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: '5px' }}
                >
                  Data Final:
                </label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <button
                className="btn btn-primary"
                onClick={loadTabData}
                style={{ width: 'auto', padding: '0.5rem 1rem', height: '42px' }}
              >
                Filtrar
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {history.map((h) => (
                <div
                  key={h.id}
                  className="glass-panel"
                  style={{
                    padding: '0.8rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background:
                      h.status === 'usado'
                        ? 'rgba(16, 185, 129, 0.05)'
                        : 'rgba(255,255,255,0.05)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.85rem' }}>
                      {h.codigo} -{' '}
                      <span
                        style={{
                          color: h.status === 'usado' ? 'var(--primary)' : 'var(--warning, #eab308)',
                        }}
                      >
                        {h.status.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      {h.status === 'usado'
                        ? `Validado na ${h.lojas?.nome || h.loja_nome}`
                        : `Gerado em ${new Date(h.criado_em).toLocaleString()}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: 'var(--secondary)' }}>
                      {h.valor_pontos} MeuBusCoins
                    </div>
                    {h.validado_em && (
                      <div style={{ fontSize: '0.6rem' }}>
                        {new Date(h.validado_em).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      }

      {
        tab === 'logs' && (
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3>Log de Transmissões (Auditoria)</h3>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '1rem' }}>
              Histórico de transmissões de viagens.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {transmissionLogs.map((log) => {
                const isStale = !log.fim_em && (Date.now() - new Date(log.inicio_em).getTime()) > 60 * 60 * 1000;
                const isActive = !log.fim_em && !isStale;

                return (
                  <div
                    key={log.id}
                    className="glass-panel"
                    style={{
                      padding: '0.8rem',
                      background: isStale ? 'rgba(239, 68, 68, 0.1)' : isActive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.05)',
                      border: isStale ? '1px solid #ef4444' : isActive ? '1px solid #22c55e' : 'none'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '5px',
                      }}
                    >
                      <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.9rem' }}>
                        {log.linha_nome}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: isStale ? '#ef4444' : isActive ? '#22c55e' : '#64748b',
                          color: 'white'
                        }}>
                          {isStale ? '⚠️ ABERTA (60m+)' : isActive ? '🟢 EM ANDAMENTO' : '✅ FECHADA'}
                        </span>
                        <div style={{ fontWeight: 'bold', color: 'var(--secondary)' }}>
                          +{log.pontos_ganhos} MeuBusCoins
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      📅 {new Date(log.inicio_em).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '5px' }}>
                      Duração:{' '}
                      {log.fim_em
                        ? `${Math.round((new Date(log.fim_em) - new Date(log.inicio_em)) / 60000)} min`
                        : `${Math.round((Date.now() - new Date(log.inicio_em)) / 60000)} min (em andamento)`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      }

      {
        tab === 'relatorios' && (
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3>Estatísticas e Relatórios (Município)</h3>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '1.5rem' }}>
              Visão geral inteligente do comportamento dos ônibus e passageiros.
            </p>

            {/* Manutenção */}
            <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f87171', marginBottom: '0.8rem' }}>🔧 Manutenção</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-outline"
                  onClick={cleanupExpiredCoupons}
                  style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.8rem', borderColor: '#f87171', color: '#f87171' }}
                  title="Expirar cupons vencidos e devolver pontos"
                >
                  🎟️ Limpar Cupons Expirados
                </button>
                <button
                  className="btn btn-outline"
                  onClick={cleanupStaleTransmissions}
                  style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.8rem', borderColor: '#f87171', color: '#f87171' }}
                  title="Finalizar transmissões abertas há mais de 60 minutos"
                >
                  🧹 Limpar Transmissões Órfãs
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '2rem' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '1.5rem 1rem', borderRadius: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--primary)' }}>{transmissionLogs.length}</div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Viagens Rastreadas</div>
              </div>
              <div style={{ background: 'rgba(234, 179, 8, 0.1)', padding: '1.5rem 1rem', borderRadius: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#eab308' }}>
                  {transmissionLogs.reduce((acc, log) => acc + (log.pontos_ganhos || 0), 0)}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Pontos Distribuídos</div>
              </div>
            </div>

            <h4>Linhas Mais Engajadas</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '1rem', marginBottom: '2rem' }}>
              {Object.entries(
                transmissionLogs.reduce((acc, log) => {
                  acc[log.linha_nome] = (acc[log.linha_nome] || 0) + 1;
                  return acc;
                }, {})
              )
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([linha, count], index) => (
                  <div key={linha} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '0.8rem', borderRadius: '8px' }}>
                    <div style={{ flex: 1 }}><strong style={{ color: index === 0 ? 'var(--secondary)' : 'white' }}>#{index + 1}</strong> {linha}</div>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold' }}>{count} logs</span>
                      <button
                        className="btn btn-primary"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', width: 'auto', gap: '5px' }}
                        onClick={() => loadRouteOnMap(linha)}
                      >
                        <MapPin size={14} /> Ver Rota
                      </button>
                    </div>
                  </div>
                ))}
              {transmissionLogs.length === 0 && <div style={{ color: '#94a3b8' }}>Nenhum dado ainda.</div>}
            </div>

            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', padding: '1.5rem', borderRadius: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981', marginBottom: '0.5rem' }}>
                {coordenadasCount}
              </div>
              <div style={{ fontSize: '0.9rem', color: '#e2e8f0', marginBottom: '1rem' }}>Pontos GPS de Trilha Gravados no Banco (Tracklogs)</div>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '1rem' }}>
                Estes pontos formam a base de dados de rotas do município, úteis para traçar os desenhos oficiais e realizar cruzamento anti-fraude. Com o tempo, essa base de dados valerá ouro.
              </p>
              <button
                className="btn btn-secondary"
                onClick={() => alert('Em breve: Os logs salvos (migalhas de pão) poderão ser baixados em formato CSV ou GeoJSON para serem importados no Google Earth Pro ou QGIS.')}
              >
                <Download size={18} /> Exportar Base de Trajetos (CSV)
              </button>
            </div>
          </div>
        )
      }

      {/* ── Configurações ─────────────────────────────── */}
      {tab === 'perfis' && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3>Perfis de Usuários</h3>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '1rem' }}>
            Saldo de MeuBusCoins, sequência e indicações por dispositivo. ({perfis.length} perfis)
          </p>

          <input
            placeholder="🔎 Buscar por código de recuperação (device id) ou código de indicação..."
            value={perfilSearch}
            onChange={(e) => setPerfilSearch(e.target.value)}
            style={{ width: '100%', marginBottom: '1rem' }}
          />

          {/* Totais */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <div style={{ background: 'rgba(234,179,8,0.1)', borderRadius: '10px', padding: '0.8rem 1.2rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#eab308' }}>
                {perfis.reduce((acc, p) => acc + (p.pontos || 0), 0)}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Total de pontos em circulação</div>
            </div>
            <div style={{ background: 'rgba(59,130,246,0.1)', borderRadius: '10px', padding: '0.8rem 1.2rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#60a5fa' }}>{perfis.length}</div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Usuários cadastrados</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {perfis
              .filter((p) => {
                const q = perfilSearch.trim().toLowerCase();
                if (!q) return true;
                return (
                  (p.id || '').toLowerCase().includes(q) ||
                  (p.referral_code || '').toLowerCase().includes(q)
                );
              })
              .map((p) => (
                <div
                  key={p.id}
                  className="glass-panel"
                  style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}
                >
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div
                      style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#94a3b8', cursor: 'pointer', wordBreak: 'break-all' }}
                      title="Clique para copiar o código de recuperação"
                      onClick={() => navigator.clipboard.writeText(p.id)}
                    >
                      🔑 {p.id}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '3px' }}>
                      Indicação: <strong style={{ color: '#94a3b8' }}>{p.referral_code}</strong>
                      {p.referral_processado && <span style={{ color: '#10b981' }}> · indicado ✓</span>}
                      {p.ultimo_dia_transmissao && <span> · últ. viagem: {p.ultimo_dia_transmissao}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    {p.streak_atual > 0 && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 800, color: '#eab308' }}>🔥 {p.streak_atual}</div>
                        <div style={{ fontSize: '0.6rem', color: '#64748b' }}>dias</div>
                      </div>
                    )}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--secondary, #eab308)' }}>{p.pontos || 0}</div>
                      <div style={{ fontSize: '0.6rem', color: '#64748b' }}>MeuBusCoins</div>
                    </div>
                  </div>
                </div>
              ))}
            {perfis.length === 0 && (
              <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>Nenhum perfil ainda.</div>
            )}
          </div>
        </div>
      )}

      {tab === 'configuracoes' && (
        <div className="glass-panel" style={{ padding: '1.5rem', maxWidth: '600px' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Configurações do Sistema</h3>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '2rem' }}>
            Ajuste o comportamento global do app para todos os usuários.
          </p>

          {/* Toggle: Sistema de Pontos */}
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            padding: '1.2rem 1.4rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: '4px' }}>
                Sistema de Pontos (MeuBusCoins)
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
                Quando desativado, os usuários transmitem normalmente mas <strong style={{ color: '#94a3b8' }}>não ganham pontos</strong> e toda a interface de recompensas fica oculta.
              </div>
              <div style={{ marginTop: '8px', fontSize: '0.72rem', fontWeight: 600, color: pontosAtivados ? '#10b981' : '#f59e0b' }}>
                {pontosAtivados ? '✅ Ativado — usuários ganham MeuBusCoins' : '⏸️ Desativado — sem pontos para os usuários'}
              </div>
            </div>

            {/* Toggle switch */}
            <button
              onClick={togglePontos}
              disabled={savingConfig}
              title={pontosAtivados ? 'Clique para desativar pontos' : 'Clique para ativar pontos'}
              style={{
                background: pontosAtivados ? '#10b981' : '#475569',
                border: 'none',
                borderRadius: '24px',
                width: '52px',
                height: '30px',
                cursor: savingConfig ? 'wait' : 'pointer',
                position: 'relative',
                flexShrink: 0,
                transition: 'background 0.3s',
                opacity: savingConfig ? 0.6 : 1,
              }}
            >
              <div style={{
                position: 'absolute',
                top: '4px',
                left: pontosAtivados ? '26px' : '4px',
                width: '22px',
                height: '22px',
                background: 'white',
                borderRadius: '50%',
                transition: 'left 0.3s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }} />
            </button>
          </div>

          <div style={{ marginTop: '1.5rem', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', padding: '0.8rem 1rem', fontSize: '0.78rem', color: '#94a3b8' }}>
            💡 <strong style={{ color: '#60a5fa' }}>Dica:</strong> Use esta opção enquanto ainda não tem parceiros locais cadastrados. Assim o sistema de rastreamento funciona normalmente e você pode ativar os pontos quando estiver pronto.
          </div>
        </div>
      )}

      {/* Map Route Visualization Modal */}
      {
        showRouteModal && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(5px)',
            zIndex: 3000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '800px', height: '80vh', display: 'flex', flexDirection: 'column', background: '#0f172a', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, color: 'white' }}>Rota: {selectedRouteName}</h3>
                <button
                  onClick={() => setShowRouteModal(false)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <X size={24} />
                </button>
              </div>

              <div style={{ flex: 1, borderRadius: '12px', overflow: 'hidden', position: 'relative' }}>
                {routeCoordinates.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
                    {routeCoordinates.length === 0 ? 'Carregando pontos da rota...' : 'Nenhum trajeto gravado ainda.'}
                  </div>
                ) : (
                  <MapContainer center={[-19.467389, -44.246473]} zoom={13} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url={TILE_URL} attribution={TILE_ATTR} />
                    <AdminMapCenterer coords={routeCoordinates} />
                    {routeCoordinates.map((coord, i) => (
                      <CircleMarker
                        key={i}
                        center={[coord.latitude, coord.longitude]}
                        radius={3}
                        pathOptions={{ color: 'var(--primary)', fillColor: 'var(--primary)', fillOpacity: 0.8, weight: 1 }}
                      />
                    ))}
                  </MapContainer>
                )}
              </div>
              <div style={{ marginTop: '1rem', color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center' }}>
                Exibindo até 5000 pontos de captura para formar o "Heatmap" da rota.
              </div>
            </div>
          </div>
        )
      }
      </div>
    </div>
  );
}
