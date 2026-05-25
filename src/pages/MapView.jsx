import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ArrowLeft, RefreshCw, Navigation, Radio, BusFront, Users, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { calcDistanceKm } from '../lib/geo';
import AdBanner from '../components/AdBanner';
import Footer from '../components/Footer';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

// CartoDB Voyager — visual premium mas legível (cinza neutro, bom contraste)
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'agora mesmo';
  if (diff < 120) return 'há 1 min';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  return `há ${Math.floor(diff / 3600)}h`;
}

function freshness(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return { color: '#10b981', label: 'Ao vivo' };
  if (diff < 180) return { color: '#3b82f6', label: `${Math.floor(diff / 60)} min` };
  return { color: '#eab308', label: `${Math.floor(diff / 60)} min` };
}

const STREET_ZOOM = 17; // nível de rua

function MapCenterer({ buses }) {
  const map = useMap();
  const hasCentered = useRef(false);
  useEffect(() => {
    if (hasCentered.current) return;
    const ids = Object.keys(buses);
    if (ids.length === 1) {
      // Um único ônibus → centraliza nele já no nível de rua
      const b = buses[ids[0]];
      map.setView([b.latitude, b.longitude], STREET_ZOOM);
      hasCentered.current = true;
    } else if (ids.length > 1) {
      // Vários ônibus → enquadra todos, mas aproxima até o nível de rua
      const coords = ids.map((id) => [buses[id].latitude, buses[id].longitude]);
      map.fitBounds(L.latLngBounds(coords), { padding: [60, 60], maxZoom: STREET_ZOOM });
      hasCentered.current = true;
    }
  }, [buses, map]);
  return null;
}

function LocateButton() {
  const map = useMap();
  const [locating, setLocating] = useState(false);
  const handleLocate = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 1.2 });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  return (
    <button
      onClick={handleLocate}
      aria-label="Minha localização"
      style={{
        position: 'absolute',
        bottom: '180px',
        right: '1rem',
        zIndex: 1000,
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.15)',
        background: 'rgba(15, 23, 42, 0.9)',
        backdropFilter: 'blur(12px)',
        color: locating ? '#10b981' : '#e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        transition: 'all 0.2s ease',
      }}
    >
      <Navigation size={20} className={locating ? 'pulsing-btn' : ''} />
    </button>
  );
}

export default function MapView() {
  const navigate = useNavigate();
  const [buses, setBuses] = useState({});
  const [selectedLinha, setSelectedLinha] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const l = params.get('linha');
    return l && l !== 'Todas' ? l : '';
  });
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [linhasDb, setLinhasDb] = useState([]);
  const [now, setNow] = useState(Date.now());

  const START_CENTER = [-19.467389, -44.246473];

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [now]);

  const fetchExistingBuses = async (silent = false) => {
    if (!silent) setLoading(true);
    setDbError(null);
    const { data, error } = await supabase.from('onibus_posicoes').select('*');
    if (error) {
      setDbError(error.message);
    } else if (data) {
      const currentTime = new Date();
      const activeBuses = {};
      data.forEach((bus) => {
        if (currentTime - new Date(bus.ultima_atualizacao) < FIVE_MINUTES_MS) {
          activeBuses[bus.id] = bus;
        }
      });
      setBuses(activeBuses);
    }
    setLoading(false);
  };

  useEffect(() => {
    const fetchLinhas = async () => {
      const { data } = await supabase.from('linhas').select('*').order('nome');
      if (data) setLinhasDb(data);
    };
    fetchExistingBuses();
    fetchLinhas();

    // Sem realtime no PostgreSQL próprio → polling: rebusca as posições a cada 12s.
    // O fetch já filtra ônibus ativos (< 5 min), removendo os que pararam de transmitir.
    const poll = setInterval(() => fetchExistingBuses(true), 12000);

    return () => {
      clearInterval(poll);
    };
  }, []);

  const filteredBuses = (() => {
    const raw = Object.values(buses).filter(
      (b) => !selectedLinha || b.linha_nome === selectedLinha
    );
    const final = [];
    const sorted = [...raw].sort((a, b) => new Date(b.ultima_atualizacao) - new Date(a.ultima_atualizacao));
    sorted.forEach((bus) => {
      const dup = final.find(
        (f) => f.linha_nome === bus.linha_nome &&
          calcDistanceKm(bus.latitude, bus.longitude, f.latitude, f.longitude) < 0.2
      );
      if (!dup) final.push({ ...bus, contributors: 1 });
      else dup.contributors++;
    });
    return final;
  })();

  const uniqueLines = [...new Set(filteredBuses.map((b) => b.linha_nome))];
  const totalContributors = filteredBuses.reduce((sum, b) => sum + b.contributors, 0);

  const createIcon = (nome, contributors, dateStr) => {
    const { color } = freshness(dateStr);
    const shortName = nome.split(' - ')[0];
    return L.divIcon({
      className: 'bus-marker-container',
      html: `
        <div class="bus-icon-wrapper">
          <div class="bus-glow-ring" style="--glow-color:${color}"></div>
          <svg viewBox="0 0 24 24" class="bus-svg" style="border-color:${color};box-shadow:0 0 14px ${color}44">
            <path fill="${color}" d="M18,11H6V6h12M16.5,17a1.5,1.5,0,1,1-1.5-1.5A1.5,1.5,0,0,1,16.5,17m-9,0a1.5,1.5,0,1,1-1.5-1.5A1.5,1.5,0,0,1,7.5,17M4,16c0,.88,.39,1.67,1,2.22V20a1,1,0,0,0,1,1H7a1,1,0,0,0,1-1v-1h8v1a1,1,0,0,0,1,1h1a1,1,0,0,0,1-1v-1.78c.61-.55,1-1.34,1-2.22V6a3,3,0,0,0-3-3H6A3,3,0,0,0,3,6V16Z" />
          </svg>
          <div class="bus-label" style="background:${color}">${shortName}</div>
          ${contributors > 1 ? `<div class="bus-badge">${contributors}</div>` : ''}
        </div>
      `,
      iconSize: [54, 60],
      iconAnchor: [27, 30],
    });
  };

  // Tela de seleção obrigatória de linha
  if (!selectedLinha) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#0f172a', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <BusFront size={56} color="#10b981" style={{ marginBottom: '1rem' }} />
        <h2 style={{ background: 'linear-gradient(to right, #10b981, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: '0.5rem', fontSize: '1.6rem', fontWeight: 800 }}>
          Qual linha você quer ver?
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem', textAlign: 'center' }}>
          Selecione uma linha para ver somente os ônibus dela no mapa.
        </p>
        <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '60vh', overflowY: 'auto' }}>
          {linhasDb.map(l => (
            <button
              key={l.id}
              className="btn btn-outline"
              onClick={() => setSelectedLinha(l.nome)}
              style={{ padding: '1rem', textAlign: 'left', borderColor: 'rgba(255,255,255,0.12)', color: '#e2e8f0', fontSize: '1rem' }}
            >
              🚌 {l.nome}
            </button>
          ))}
          {linhasDb.length === 0 && (
            <div style={{ textAlign: 'center', color: '#64748b' }}>Carregando linhas...</div>
          )}
        </div>
        <button
          className="btn btn-outline"
          onClick={() => navigate('/')}
          style={{ marginTop: '1.5rem', width: '100%', maxWidth: 400, color: '#94a3b8', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <ArrowLeft size={18} /> Voltar
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#0f172a' }}>
      <AdBanner />

      <div style={{ flex: 1, position: 'relative' }}>

        {/* ── Header ── */}
        <div className="map-header">
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="map-control-btn" onClick={() => navigate('/')}>
              <ArrowLeft size={18} /> Voltar
            </button>
            <button
              className="map-control-btn"
              onClick={fetchExistingBuses}
              title="Atualizar"
            >
              <RefreshCw size={18} className={loading ? 'pulsing-btn' : ''} />
            </button>
          </div>

          {/* Chip da linha selecionada — clique para trocar */}
          <button
            className="map-control-btn"
            onClick={() => setSelectedLinha('')}
            title="Trocar linha"
            style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', gap: '6px' }}
          >
            🚌 {selectedLinha} <RefreshCw size={13} />
          </button>
        </div>

        {/* ── Error ── */}
        {dbError && (
          <div className="map-error-banner">❌ Erro ao carregar: {dbError}</div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="map-loading">
            <div className="map-loading-inner">
              <RefreshCw className="pulsing-btn" size={28} />
              <span>Carregando mapa...</span>
            </div>
          </div>
        )}

        {/* ── Map ── */}
        <MapContainer
          center={START_CENTER}
          zoom={14}
          style={{ width: '100%', height: '100%', zIndex: 10 }}
          zoomControl={false}
        >
          <MapCenterer buses={filteredBuses} />
          <LocateButton />
          <TileLayer url={TILE_URL} attribution={TILE_ATTR} />

          {filteredBuses.map((bus) => (
            <Marker
              key={bus.id}
              position={[bus.latitude, bus.longitude]}
              icon={createIcon(bus.linha_nome, bus.contributors, bus.ultima_atualizacao)}
            >
              <Popup className="premium-popup">
                <div style={{ minWidth: '180px', fontFamily: 'Outfit, sans-serif' }}>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <BusFront size={16} color="#10b981" />
                    {bus.linha_nome}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Clock size={13} />
                      Atualizado {timeAgo(bus.ultima_atualizacao)}
                    </div>
                    {bus.contributors > 1 && (
                      <div style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Users size={13} />
                        {bus.contributors} passageiros confirmando
                      </div>
                    )}
                    <div style={{ marginTop: '6px', padding: '5px 8px', background: (() => { const { color } = freshness(bus.ultima_atualizacao); return color + '18'; })(), borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, color: freshness(bus.ultima_atualizacao).color, textAlign: 'center' }}>
                      ● {freshness(bus.ultima_atualizacao).label}
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* ── Anúncios laterais ── */}
        <AdBanner position="esquerda" />
        <AdBanner position="direita" />

        {/* ── FAB: Transmitir ── */}
        <button
          onClick={() => navigate('/transmitir')}
          style={{
            position: 'absolute',
            bottom: '160px',
            left: '1rem',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0.75rem 1.1rem',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            border: 'none',
            borderRadius: '2rem',
            color: 'white',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(16,185,129,0.45)',
            fontFamily: 'Outfit, sans-serif',
            transition: 'all 0.2s ease',
          }}
        >
          <Radio size={18} />
          Estou no Ônibus
        </button>

        {/* ── Bottom overlay ── */}
        <div className="map-overlay">
          {!loading && filteredBuses.length === 0 ? (
            <div className="map-bottom-panel map-empty-state">
              <BusFront size={26} color="#475569" />
              <div>
                <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.95rem' }}>Nenhum ônibus no momento</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Seja o primeiro a transmitir!</div>
              </div>
            </div>
          ) : (
            <div className="map-bottom-panel map-stats-bar">
              {/* Live dot + bus count */}
              <div className="map-stats-left">
                <span className="map-live-dot">
                  <span className="map-live-dot-ping"></span>
                  <span className="map-live-dot-core"></span>
                </span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#e2e8f0', lineHeight: 1 }}>
                    {filteredBuses.length}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    ônibus ao vivo
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div style={{ width: '1px', height: '32px', background: 'rgba(255,255,255,0.08)' }} />

              {/* Lines count */}
              {uniqueLines.length > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#3b82f6', lineHeight: 1 }}>
                    {uniqueLines.length}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {uniqueLines.length === 1 ? 'linha' : 'linhas'}
                  </div>
                </div>
              )}

              {/* Divider */}
              {totalContributors > 0 && <div style={{ width: '1px', height: '32px', background: 'rgba(255,255,255,0.08)' }} />}

              {/* Contributors */}
              {totalContributors > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#10b981', lineHeight: 1 }}>
                    {totalContributors}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    colaboradores
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: '6px', width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
            <AdBanner position="bottom" />
            <a
              href="https://wa.me/5531983315536?text=Ol%C3%A1%2C%20estou%20tendo%20um%20problema%20com%20o%20MeuBusApp."
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#475569', textDecoration: 'none', fontSize: '0.72rem' }}
            >
              Reportar problema
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
