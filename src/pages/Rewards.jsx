import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Gift, Ticket, CheckCircle, XCircle, MapPin } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { supabase } from '../lib/supabase';
import { usePoints } from '../hooks/usePoints';
import { calcDistanceKm } from '../lib/geo';
import Footer from '../components/Footer';

const MAX_DISTANCE_KM = 1.5;

/**
 * Generate a cryptographically strong coupon code (8 chars).
 */
function generateSecureCode() {
  try {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(36).padStart(2, '0'))
      .join('')
      .substring(0, 8)
      .toUpperCase();
  } catch {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }
}

export default function Rewards() {
  const navigate = useNavigate();
  const { totalPoints, addPoints, deviceId, refreshPoints } = usePoints();
  const [loading, setLoading] = useState(true);
  const [coupon, setCoupon] = useState(null);
  const [activeResgateId, setActiveResgateId] = useState(null);
  const [error, setError] = useState(null);
  const [nearbyBrindes, setNearbyBrindes] = useState([]);
  const [farCount, setFarCount] = useState(0);
  const [gpsAvailable, setGpsAvailable] = useState(true);

  useEffect(() => {
    fetchActiveCoupon();
    fetchRewardsAndLocation();
  }, [deviceId]);

  const fetchActiveCoupon = async () => {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from('resgates')
      .select('*')
      .eq('perfil_id', deviceId)
      .eq('status', 'pendente')
      .or(`expira_em.is.null,expira_em.gt.${now}`)
      .order('criado_em', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setCoupon(data.codigo);
      setActiveResgateId(data.id);
    }
  };

  const fetchRewardsAndLocation = () => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        const { data, error: fetchError } = await supabase
          .from('brindes')
          .select('*, lojas(*)')
          .eq('ativo', true);

        if (!fetchError && data) {
          const withDistance = data.map((b) => {
            const dist = calcDistanceKm(latitude, longitude, b.lojas.latitude, b.lojas.longitude);
            return { ...b, distance: dist };
          });

          // Split into nearby (≤1.5km) and far (>1.5km)
          const nearby = withDistance
            .filter((b) => b.distance <= MAX_DISTANCE_KM)
            .sort((a, b) => a.distance - b.distance);
          const far = withDistance.filter((b) => b.distance > MAX_DISTANCE_KM);

          setNearbyBrindes(nearby);
          setFarCount(far.length);
        }
        setLoading(false);
      },
      (err) => {
        console.warn('GPS failed for rewards', err);
        setGpsAvailable(false);
        setLoading(false);
      }
    );
  };

  const [resgatando, setResgatando] = useState(false);

  const generateCoupon = async (brinde) => {
    if (resgatando) return; // debounce: impede duplo clique
    if (totalPoints < brinde.pontos_necessarios) {
      setError(`Você precisa de pelo menos ${brinde.pontos_necessarios} MeuBusCoins.`);
      return;
    }

    setResgatando(true);
    setError(null);
    const code = generateSecureCode();

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('resgatar_brinde', {
        p_device_id: deviceId,
        p_pontos: brinde.pontos_necessarios,
        p_loja_nome: brinde.lojas.nome,
        p_codigo: code,
      });

      if (!rpcError && rpcData && rpcData.length > 0) {
        setCoupon(code);
        setActiveResgateId(rpcData[0].id);
        await refreshPoints();
        return;
      }

      // RPC falhou — não usar fallback não-atômico
      setError(
        rpcError?.message?.includes('saldo')
          ? 'Saldo insuficiente para este resgate.'
          : 'Erro ao gerar cupom. Tente novamente em instantes.'
      );
    } catch (e) {
      setError('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setResgatando(false);
    }
  };

  const cancelCoupon = async () => {
    if (!activeResgateId) return;
    if (!confirm('Deseja cancelar este brinde e recuperar seus pontos?')) return;

    try {
      const { data: ok, error } = await supabase.rpc('cancelar_resgate', {
        p_resgate_id: activeResgateId,
        p_device_id: deviceId,
      });

      if (error || !ok) {
        alert('Não foi possível cancelar. O cupom pode já ter sido utilizado.');
        return;
      }

      setCoupon(null);
      setActiveResgateId(null);
      await refreshPoints();
      alert('MeuBusCoins estornados com sucesso! 💎');
    } catch (e) {
      alert('Erro de conexão ao cancelar. Tente novamente.');
    }
  };

  return (
    <div className="container">
      <header>
        <button
          className="btn btn-outline"
          aria-label="Voltar"
          style={{
            border: 'none',
            padding: '0.5rem',
            width: 'auto',
            marginBottom: '1rem',
            color: '#94a3b8',
          }}
          onClick={() => navigate('/')}
        >
          <ArrowLeft size={24} /> Voltar
        </button>
        <h1>Minha Carteira</h1>
        <p>Troque sua colaboração por benefícios.</p>
      </header>

      <div className="glass-panel" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
          Saldo Atual
        </div>
        <div
          style={{ fontSize: '3rem', fontWeight: '800', color: 'var(--primary)', lineHeight: 1 }}
        >
          {totalPoints}
        </div>
        <div style={{ fontSize: '1rem', color: '#94a3b8' }}>MeuBusCoins</div>
      </div>

      {!coupon ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* GPS unavailable warning */}
          {!gpsAvailable && (
            <div
              style={{
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid #eab308',
                borderRadius: '1rem',
                padding: '1rem',
                textAlign: 'center',
                color: '#eab308',
                fontSize: '0.85rem',
              }}
            >
              <MapPin size={20} style={{ marginBottom: '0.3rem' }} />
              <div style={{ fontWeight: 700 }}>GPS não disponível</div>
              <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '4px' }}>
                Ative a localização para ver brindes próximos a você.
              </div>
            </div>
          )}

          {/* Nearby brindes */}
          {nearbyBrindes.map((b) => (
            <div
              key={b.id}
              className="glass-panel"
              style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid var(--secondary)',
                transition: 'all 0.3s ease',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  marginBottom: '1.2rem',
                }}
              >
                <Gift size={32} color="var(--secondary)" />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 800 }}>{b.nome_brinde}</div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>🏠 {b.lojas?.nome}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600 }}>
                    📍 A {b.distance.toFixed(1)} km de você
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, color: 'var(--secondary)', fontSize: '1.2rem' }}>
                    {b.pontos_necessarios}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: '#94a3b8', textTransform: 'uppercase' }}>
                    MeuBusCoins
                  </div>
                </div>
              </div>

              {totalPoints < b.pontos_necessarios ? (
                <div
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    padding: '0.8rem',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    fontSize: '0.9rem',
                    color: '#94a3b8',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Progresso</span>
                  <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>
                    Faltam {b.pontos_necessarios - totalPoints} MeuBusCoins
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    padding: '0.8rem',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    fontSize: '0.9rem',
                    color: 'var(--primary)',
                    fontWeight: 'bold',
                    textAlign: 'center',
                  }}
                >
                  ✅ Brinde Liberado!
                </div>
              )}

              <button
                className="btn btn-secondary"
                onClick={() => generateCoupon(b)}
                disabled={totalPoints < b.pontos_necessarios}
                style={{
                  padding: '0.8rem',
                  fontSize: '0.9rem',
                  opacity: totalPoints < b.pontos_necessarios ? 0.4 : 1,
                }}
              >
                <Ticket size={18} />
                Resgatar Brinde
              </button>
            </div>
          ))}

          {/* No nearby brindes — show info about far ones */}
          {!loading && nearbyBrindes.length === 0 && gpsAvailable && (
            <div
              style={{
                textAlign: 'center',
                padding: '2rem 1rem',
                color: '#94a3b8',
              }}
            >
              <MapPin size={40} color="#475569" style={{ marginBottom: '1rem' }} />
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#e2e8f0', marginBottom: '0.5rem' }}>
                Nenhum brinde por perto
              </div>
              <div style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
                Os brindes só aparecem quando você está a menos de <strong style={{ color: 'var(--secondary)' }}>1,5 km</strong> da loja parceira.
              </div>
              {farCount > 0 && (
                <div
                  style={{
                    background: 'rgba(59, 130, 246, 0.08)',
                    padding: '0.8rem',
                    borderRadius: '10px',
                    fontSize: '0.8rem',
                    color: 'var(--secondary)',
                  }}
                >
                  🏪 {farCount} {farCount === 1 ? 'brinde disponível' : 'brindes disponíveis'} em lojas mais distantes. Passe perto de uma loja parceira para resgatar!
                </div>
              )}
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', color: '#94a3b8' }}>
              Buscando parceiros próximos...
            </div>
          )}

          {error && (
            <div
              style={{
                color: 'var(--danger)',
                fontSize: '0.9rem',
                textAlign: 'center',
                marginTop: '1rem',
              }}
            >
              {error}
            </div>
          )}
        </div>
      ) : (
        <div
          className="glass-panel"
          style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px dashed var(--primary)',
            padding: '2rem 1.5rem',
          }}
        >
          <CheckCircle size={48} color="var(--primary)" style={{ marginBottom: '1rem' }} />
          <h2 style={{ marginBottom: '0.5rem', fontSize: '1.2rem' }}>Cupom Gerado!</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
            Mostre o QR ao lojista ou informe o código:
          </p>

          <div
            style={{
              background: 'white',
              padding: '15px',
              borderRadius: '15px',
              display: 'inline-block',
              marginBottom: '1.5rem',
              boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
            }}
          >
            <QRCodeCanvas value={coupon} size={180} level={'H'} includeMargin={true} />
          </div>

          <div
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: 'white',
              padding: '1rem',
              borderRadius: '10px',
              fontSize: '2rem',
              fontWeight: '900',
              letterSpacing: '5px',
              marginBottom: '1.5rem',
            }}
          >
            {coupon}
          </div>

          <button
            className="btn btn-outline"
            onClick={cancelCoupon}
            style={{
              width: '100%',
              borderColor: 'var(--danger)',
              color: 'var(--danger)',
              display: 'flex',
              gap: '8px',
            }}
          >
            <XCircle size={20} /> Desistir e Devolver MeuBusCoins
          </button>

          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '1.5rem' }}>
            Dica: Se a câmera do lojista falhar, ele pode digitar o código acima no painel dele.
          </div>
        </div>
      )}

      <p
        style={{
          textAlign: 'center',
          fontSize: '0.8rem',
          color: '#64748b',
          marginTop: '2rem',
        }}
      >
        Ajude a cidade transmitindo sua rota para ganhar mais MeuBusCoins!
      </p>
      <Footer />
    </div>
  );
}
