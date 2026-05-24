import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, StopCircle, ArrowLeft, Coins, ShieldCheck, Clock, AlertTriangle, Flame, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePoints } from '../hooks/usePoints';
import { useConfig } from '../hooks/useConfig';
import { calcDistanceKm } from '../lib/geo';
import {
  getStreak,
} from '../hooks/usePoints';
import Footer from '../components/Footer';

const INACTIVITY_THRESHOLD_M = 50;
const INACTIVITY_CHECK_INTERVAL_MS = 60 * 1000;
const INACTIVITY_MAX_MS = 5 * 60 * 1000;
const MAX_TRIP_MS = 60 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

// Minimum to earn points
const MIN_DURATION_S = 180; // 3 minutes
const MIN_DISTANCE_M = 300; // 300 meters

function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', text: '#10b981' },
    warning: { bg: 'rgba(234, 179, 8, 0.15)', border: '#eab308', text: '#eab308' },
    info: { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#3b82f6' },
  };
  const c = colors[type] || colors.success;

  return (
    <div
      style={{
        position: 'fixed',
        top: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9000,
        maxWidth: 360,
        width: 'calc(100% - 2rem)',
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: '1rem',
        padding: '0.9rem 1.2rem',
        color: c.text,
        fontWeight: 700,
        fontSize: '0.95rem',
        textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(12px)',
        animation: 'slideDown 0.3s ease',
      }}
    >
      {message}
    </div>
  );
}

function ProgressBar({ label, value, max, color = '#10b981' }) {
  const pct = Math.min((value / max) * 100, 100);
  const done = value >= max;
  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          color: done ? color : '#94a3b8',
          fontWeight: done ? 700 : 400,
          marginBottom: '4px',
        }}
      >
        <span>{label}</span>
        <span>{done ? '✓ OK' : '...'}</span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 4,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: done
              ? `linear-gradient(90deg, ${color}, #34d399)`
              : color,
            borderRadius: 4,
            transition: 'width 0.5s ease',
            boxShadow: done ? `0 0 8px ${color}` : 'none',
          }}
        />
      </div>
    </div>
  );
}

export default function Broadcaster() {
  const navigate = useNavigate();
  const { totalPoints, deviceId, processReferralIfNeeded, refreshPoints } = usePoints();
  const { pontosAtivados } = useConfig();
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [linha, setLinha] = useState('');
  const [customLinha, setCustomLinha] = useState('');
  const [error, setError] = useState(null);
  const [currentCoords, setCurrentCoords] = useState(null);
  const [linhasDb, setLinhasDb] = useState([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentDistanceM, setCurrentDistanceM] = useState(0);
  const [inactivityWarning, setInactivityWarning] = useState(false);
  const [criteriaMet, setCriteriaMet] = useState(false);
  const [streak, setStreak] = useState(getStreak);
  const [toast, setToast] = useState(null);

  const watchId = useRef(null);
  const wakeLock = useRef(null);
  const autoStopTimer = useRef(null);
  const heartbeatTimer = useRef(null);
  const startTime = useRef(null);
  const startCoordsRef = useRef(null);
  const rowId = useRef(deviceId);
  const sessionId = useRef(null);
  const sessionPoints = useRef(0);
  const currentCoordsRef = useRef(null);
  const linhaRef = useRef('');
  const elapsedInterval = useRef(null);
  const lastMovedCoordsRef = useRef(null);
  const lastMovedTimeRef = useRef(null);
  const inactivityCheckRef = useRef(null);
  const lastLoggedCoordsRef = useRef(null);
  const lastAccumCoordsRef = useRef(null);
  const accumulatedDistKmRef = useRef(0);

  useEffect(() => {
    linhaRef.current = linha === 'Outra' ? customLinha : linha;
  }, [linha, customLinha]);

  const getLinhaName = useCallback(() => linhaRef.current, []);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, key: Date.now() });
  }, []);

  useEffect(() => {
    fetchLinhas();
    checkForOrphanedSession();
    // Auto-cleanup de sessões órfãs — throttle de 5 min para não sobrecarregar o banco
    const lastCleanup = parseInt(localStorage.getItem('meubusapp_last_cleanup') || '0', 10);
    if (Date.now() - lastCleanup > 5 * 60 * 1000) {
      localStorage.setItem('meubusapp_last_cleanup', String(Date.now()));
      supabase.rpc('limpar_sessoes_orfas').then(({ data }) => {
        if (data > 0) console.log(`[cleanup] ${data} sessão(ões) órfã(s) encerrada(s) automaticamente.`);
      });
    }
    return () => stopTransmitting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update criteria flag whenever elapsed time or distance changes
  useEffect(() => {
    if (isTransmitting && elapsedTime >= MIN_DURATION_S && currentDistanceM >= MIN_DISTANCE_M && !criteriaMet) {
      setCriteriaMet(true);
    }
  }, [elapsedTime, currentDistanceM, isTransmitting, criteriaMet]);

  const checkForOrphanedSession = async () => {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('historico_transmissoes')
        .select('id, linha_nome, inicio_em')
        .eq('perfil_id', deviceId)
        .is('fim_em', null)
        .lt('inicio_em', oneHourAgo)
        .maybeSingle();

      if (data) {
        await supabase.rpc('finalizar_transmissao', {
          p_sessao_id: data.id,
          p_fim_em: new Date().toISOString(),
          p_pontos: 0,
        });
        await supabase.from('onibus_posicoes').delete().eq('id', deviceId);
        showToast(`Transmissão antiga da linha "${data.linha_nome}" encerrada automaticamente.`, 'warning');
      }
    } catch (err) {
      console.error('Erro na verificação de sessão órfã:', err);
    }
  };

  const fetchLinhas = async () => {
    const { data } = await supabase.from('linhas').select('*').order('nome');
    if (data) setLinhasDb(data);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const startTransmitting = async () => {
    const currentLinhaName = linhaRef.current;
    if (!currentLinhaName) {
      setError('Por favor, selecione ou digite uma linha.');
      return;
    }
    setError(null);
    setIsTransmitting(true);
    setElapsedTime(0);
    setCurrentDistanceM(0);
    setInactivityWarning(false);
    setCriteriaMet(false);
    startTime.current = new Date();

    elapsedInterval.current = setInterval(() => {
      if (startTime.current) {
        setElapsedTime(Math.floor((Date.now() - startTime.current.getTime()) / 1000));
      }
    }, 1000);

    try {
      const { data: sData, error: sError } = await supabase
        .from('historico_transmissoes')
        .insert({ perfil_id: rowId.current, linha_nome: currentLinhaName, pontos_ganhos: 0 })
        .select()
        .single();

      if (sError) {
        console.error('Falha ao criar histórico:', sError.message);
        if (sError.code === '23505') {
          // unique_violation: já existe sessão aberta (outra aba ou travamento anterior)
          setError('Você já tem uma transmissão ativa em outra aba. Feche-a antes de continuar.');
          setIsTransmitting(false);
          clearInterval(elapsedInterval.current);
          elapsedInterval.current = null;
          return;
        }
      } else if (sData) {
        sessionId.current = sData.id;
      }
    } catch (e) {
      console.error('Erro na criação da sessão:', e);
    }

    sessionPoints.current = 0;
    lastAccumCoordsRef.current = null;
    accumulatedDistKmRef.current = 0;

    if (!navigator.geolocation) {
      setError('Geolocalização não é suportada.');
      setIsTransmitting(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        startCoordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        lastMovedCoordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        lastMovedTimeRef.current = Date.now();
        sendUpdate(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => console.error('Erro GPS Inicial:', err.message)
    );

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        sendUpdate(lat, lng);
        setError(null);

        if (lastMovedCoordsRef.current) {
          const movedDist =
            calcDistanceKm(lastMovedCoordsRef.current.lat, lastMovedCoordsRef.current.lng, lat, lng) * 1000;
          if (movedDist > INACTIVITY_THRESHOLD_M) {
            lastMovedCoordsRef.current = { lat, lng };
            lastMovedTimeRef.current = Date.now();
            setInactivityWarning(false);
          }
        }

        // Acumular distância segmento a segmento (correto para rotas circulares)
        const prevAccum = lastAccumCoordsRef.current || startCoordsRef.current;
        if (prevAccum) {
          const segmentKm = calcDistanceKm(prevAccum.lat, prevAccum.lng, lat, lng);
          accumulatedDistKmRef.current += segmentKm;
          setCurrentDistanceM(accumulatedDistKmRef.current * 1000);
        }
        lastAccumCoordsRef.current = { lat, lng };
      },
      () => setError('Sinal de GPS fraco. Tentando reconectar...'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    );

    inactivityCheckRef.current = setInterval(() => {
      if (lastMovedTimeRef.current) {
        const timeSinceMove = Date.now() - lastMovedTimeRef.current;
        if (timeSinceMove >= INACTIVITY_MAX_MS) {
          stopTransmitting();
          showToast('Transmissão encerrada: sem movimento por 5 minutos.', 'warning');
        } else if (timeSinceMove >= INACTIVITY_MAX_MS - 60000) {
          setInactivityWarning(true);
        }
      }
    }, INACTIVITY_CHECK_INTERVAL_MS);

    requestWakeLock();
    sendHeartbeat();

    autoStopTimer.current = setTimeout(() => {
      stopTransmitting();
      showToast('Transmissão encerrada: limite de 60 minutos atingido.', 'warning');
    }, MAX_TRIP_MS);
  };

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLock.current = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.error('Falha no Wake Lock:', err);
      }
    }
  };

  const sendUpdate = async (latitude, longitude) => {
    try {
      setCurrentCoords({ lat: latitude, lng: longitude });
      currentCoordsRef.current = { lat: latitude, lng: longitude };

      const { error: upsertError } = await supabase.from('onibus_posicoes').upsert({
        id: rowId.current,
        linha_nome: linhaRef.current,
        latitude,
        longitude,
      });

      let shouldLogRoute = false;
      if (!lastLoggedCoordsRef.current) {
        shouldLogRoute = true;
      } else {
        const distLog =
          calcDistanceKm(lastLoggedCoordsRef.current.lat, lastLoggedCoordsRef.current.lng, latitude, longitude) * 1000;
        if (distLog > 50) shouldLogRoute = true;
      }

      if (shouldLogRoute && sessionId.current) {
        lastLoggedCoordsRef.current = { lat: latitude, lng: longitude };
        supabase
          .from('historico_coordenadas')
          .insert({ sessao_id: sessionId.current, linha_nome: linhaRef.current, latitude, longitude })
          .then();
      }

      if (upsertError) {
        setError(`Erro: ${upsertError.message}`);
      } else {
        setError(null);
      }
    } catch (e) {
      setError(`Erro de rede: ${e.message}`);
    }
  };

  const stopTransmitting = async () => {
    const endTime = new Date();
    const durationSeconds = startTime.current ? (endTime - startTime.current) / 1000 : 0;

    if (watchId.current) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
    if (autoStopTimer.current) { clearTimeout(autoStopTimer.current); autoStopTimer.current = null; }
    if (heartbeatTimer.current) { clearTimeout(heartbeatTimer.current); heartbeatTimer.current = null; }
    if (elapsedInterval.current) { clearInterval(elapsedInterval.current); elapsedInterval.current = null; }
    if (inactivityCheckRef.current) { clearInterval(inactivityCheckRef.current); inactivityCheckRef.current = null; }
    if (wakeLock.current) { try { wakeLock.current.release(); } catch (_) {} wakeLock.current = null; }

    // Usar distância acumulada (soma dos segmentos GPS) em vez de ponto-a-ponto
    const distanceKm = accumulatedDistKmRef.current;

    if (durationSeconds >= MIN_DURATION_S && distanceKm >= MIN_DISTANCE_M / 1000) {
      if (pontosAtivados) {
        // Validate route position if enabled for this line (fail-open on network error)
        let routeValid = true;
        if (currentCoordsRef.current) {
          try {
            const { data: onRoute } = await supabase.rpc('verificar_posicao_na_rota', {
              p_linha_nome: linhaRef.current,
              p_lat: currentCoordsRef.current.lat,
              p_lng: currentCoordsRef.current.lng,
            });
            routeValid = onRoute !== false;
          } catch (_) {
            routeValid = true; // fail-open: network error → don't punish user
          }
        }

        if (!routeValid) {
          showToast('Sua posição está fora da rota desta linha. Pontos não concedidos.', 'warning');
        } else {
          const { data: rewardData, error: rewardError } = await supabase.rpc('atribuir_pontos_viagem', {
            p_device_id: deviceId,
            p_pontos_base: 10,
          });

          if (rewardError) {
            console.error('Erro ao atribuir pontos:', rewardError.message);
            showToast('Erro ao registrar pontos. Tente novamente.', 'warning');
          } else {
            const { pontos_atribuidos, new_streak, bonus_points, is_milestone, rate_limited } = rewardData;

            if (rate_limited) {
              showToast('Viagem registrada! Aguarde 30 min para ganhar pontos novamente.', 'info');
            } else {
              setStreak(new_streak);
              localStorage.setItem('meubusapp_streak', String(new_streak));
              sessionPoints.current = pontos_atribuidos;
              await refreshPoints();

              if (is_milestone) {
                showToast(`🔥 ${new_streak} dias seguidos! +${bonus_points} bônus = ${pontos_atribuidos} MeuBusCoins!`, 'success');
              } else {
                const streakMsg = new_streak > 1 ? ` (🔥 ${new_streak} dias)` : '';
                showToast(`Você ganhou 10 MeuBusCoins!${streakMsg}`, 'success');
              }
            }

            await processReferralIfNeeded();
          }
        }
      } else {
        showToast('Viagem registrada! Obrigado por colaborar.', 'success');
      }
    } else if (isTransmitting) {
      showToast('Viagem encerrada. Continue transmitindo!', 'info');
    }

    if (sessionId.current) {
      await supabase.rpc('finalizar_transmissao', {
        p_sessao_id: sessionId.current,
        p_fim_em: new Date().toISOString(),
        p_pontos: sessionPoints.current,
      });
      sessionId.current = null;
    }

    setIsTransmitting(false);
    setInactivityWarning(false);
    setCriteriaMet(false);
    startTime.current = null;
    startCoordsRef.current = null;
    currentCoordsRef.current = null;
    lastAccumCoordsRef.current = null;
    accumulatedDistKmRef.current = 0;

    try {
      await supabase.from('onibus_posicoes').delete().eq('id', rowId.current);
    } catch (_) {}
  };

  const sendHeartbeat = async () => {
    if (!sessionId.current) return;
    try {
      await supabase.rpc('heartbeat_transmissao', { p_sessao_id: sessionId.current });
    } catch (err) {
      console.error('Heartbeat falhou:', err);
    }
    // Reagendar mesmo em caso de erro — sessão não pode ficar sem heartbeat
    if (sessionId.current) {
      heartbeatTimer.current = setTimeout(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    }
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isTransmitting && sessionId.current) {
        if (navigator.sendBeacon) {
          const apiBase = import.meta.env.VITE_API_URL || '';
          const payload = JSON.stringify({
            p_sessao_id: sessionId.current,
            p_fim_em: new Date().toISOString(),
            p_pontos: 0,
          });
          navigator.sendBeacon(
            `${apiBase}/api/rpc/finalizar_transmissao`,
            new Blob([payload], { type: 'application/json' })
          );
          navigator.sendBeacon(
            `${apiBase}/api/rpc/remover_posicao_beacon`,
            new Blob([JSON.stringify({ p_device_id: rowId.current })], { type: 'application/json' })
          );
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (isTransmitting) stopTransmitting();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTransmitting]);

  const timeProgressPct = Math.min((elapsedTime / MIN_DURATION_S) * 100, 100);
  const distProgressPct = Math.min((currentDistanceM / MIN_DISTANCE_M) * 100, 100);

  return (
    <div className="container">
      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <style>{`
        @keyframes slideDown {
          from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
          to   { transform: translateX(-50%) translateY(0);     opacity: 1; }
        }
      `}</style>

      <header>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
          <button
            className="btn btn-outline"
            aria-label="Voltar"
            style={{ border: 'none', padding: '0.5rem', width: 'auto', marginBottom: '1rem', color: '#94a3b8' }}
            onClick={() => navigate('/')}
          >
            <ArrowLeft size={24} /> Voltar
          </button>

          {pontosAtivados && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '5px' }}>
              {streak > 0 && (
                <div
                  style={{
                    background: 'rgba(234, 179, 8, 0.1)',
                    border: '1px solid #eab308',
                    padding: '0.4rem 0.7rem',
                    borderRadius: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Flame size={14} color="#eab308" />
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#eab308' }}>{streak}d</span>
                </div>
              )}
              <div
                style={{
                  background: 'rgba(234, 179, 8, 0.1)',
                  border: '1px solid #eab308',
                  padding: '0.4rem 0.8rem',
                  borderRadius: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Coins size={14} color="#eab308" />
                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#eab308' }}>{totalPoints}</span>
              </div>
            </div>
          )}
        </div>
        <h1>Transmitir</h1>
        <p>Compartilhe seu trajeto e ajude a cidade.</p>
      </header>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {!isTransmitting ? (
          <>
            {/* Reward banner — só exibe quando pontos estão ativos */}
            {pontosAtivados && (
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.05)',
                  padding: '1rem',
                  borderRadius: '1rem',
                  border: '1px dashed rgba(255,255,255,0.1)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Recompensa por viagem válida:</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--secondary)' }}>
                  ✨ 10 MeuBusCoins
                </div>
                {streak >= 2 && (
                  <div style={{ fontSize: '0.75rem', color: '#eab308', marginTop: '4px' }}>
                    🔥 {streak} dias seguidos — continue para ganhar bônus!
                  </div>
                )}
              </div>
            )}

            <label style={{ fontWeight: '600', color: '#e2e8f0' }}>Selecione a Linha do Ônibus:</label>
            <select value={linha} onChange={(e) => setLinha(e.target.value)}>
              <option value="">-- Selecione --</option>
              {linhasDb.map((l) => (
                <option key={l.id} value={l.nome}>{l.nome}</option>
              ))}
              <option value="Outra">Outra (Digitar...)</option>
            </select>

            {linha === 'Outra' && (
              <input
                type="text"
                placeholder="Ex: Linha Especial Centro"
                maxLength={60}
                value={customLinha}
                onChange={(e) => setCustomLinha(e.target.value.replace(/[<>'"]/g, ''))}
              />
            )}

            {error && (
              <div style={{ color: 'var(--danger)', fontWeight: 600, textAlign: 'center' }}>{error}</div>
            )}

            <button className="btn btn-primary" style={{ marginTop: '0.5rem' }} onClick={startTransmitting}>
              <Radio size={24} />
              Começar a Transmitir
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            {/* Pulsing icon */}
            <div style={{ padding: '1rem 0' }}>
              <button
                className="btn btn-primary pulsing-btn"
                aria-label="Transmissão ativa"
                style={{ borderRadius: '50%', width: '100px', height: '100px', margin: '0 auto', cursor: 'default' }}
              >
                <Radio size={40} />
              </button>
            </div>

            {/* Timer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '1.2rem', color: '#e2e8f0' }}>
              <Clock size={18} color="var(--secondary)" />
              <span style={{ fontSize: '1.8rem', fontWeight: '800', fontFamily: 'monospace', color: 'var(--secondary)' }}>
                {formatTime(elapsedTime)}
              </span>
            </div>

            {/* Criteria met banner */}
            {criteriaMet ? (
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid #10b981',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <CheckCircle size={18} color="#10b981" />
                <span style={{ color: '#10b981', fontSize: '0.9rem', fontWeight: 700 }}>
                  {pontosAtivados ? '✅ 10 MeuBusCoins garantidos! Continue até o destino.' : '✅ Critérios atingidos! Continue até o destino.'}
                </span>
              </div>
            ) : (
              /* Progress bars genéricas — sem valores exatos para evitar jogo */
              <div
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  marginBottom: '1rem',
                  border: '1px solid rgba(255,255,255,0.08)',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '8px', textAlign: 'center', fontWeight: 600 }}>
                  VIAGEM EM ANDAMENTO
                </div>
                <ProgressBar
                  label="Tempo de viagem"
                  value={elapsedTime}
                  max={MIN_DURATION_S}
                  color="#3b82f6"
                />
                <ProgressBar
                  label="Distância percorrida"
                  value={currentDistanceM}
                  max={MIN_DISTANCE_M}
                  color="#10b981"
                />
              </div>
            )}

            {/* Inactivity warning */}
            {inactivityWarning && (
              <div
                style={{
                  background: 'rgba(234, 179, 8, 0.15)',
                  border: '1px solid #eab308',
                  borderRadius: '10px',
                  padding: '10px',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <AlertTriangle size={18} color="#eab308" />
                <span style={{ color: '#eab308', fontSize: '0.85rem', fontWeight: 600 }}>
                  Sem movimento. A transmissão encerrará em breve.
                </span>
              </div>
            )}

            {error && (
              <div style={{ color: 'var(--danger)', fontWeight: 600, marginBottom: '1rem', background: '#330000', padding: '10px', borderRadius: '5px' }}>
                Falha na transmissão: {error}
              </div>
            )}

            <h3 style={{ fontSize: '1.4rem', marginBottom: '0.1rem', color: 'var(--primary)' }}>
              Transmissão Ativa
            </h3>
            <p style={{ color: '#94a3b8', marginBottom: '1rem' }}>Rota {getLinhaName()}</p>

            <div
              style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid #10b981',
                borderRadius: '10px',
                padding: '10px',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ color: '#10b981', fontWeight: '800', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <ShieldCheck size={18} /> MODO VIAGEM ATIVO
              </div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>
                Sua tela não vai apagar. Encerra sozinho se parar de se mover.
              </div>
            </div>

            <button
              className="btn btn-danger"
              onClick={stopTransmitting}
              style={{ opacity: criteriaMet ? 1 : 0.75 }}
            >
              <StopCircle size={24} />
              {criteriaMet ? 'Cheguei! Encerrar Viagem' : 'Encerrar Viagem'}
            </button>

            {!criteriaMet && pontosAtivados && (
              <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '8px' }}>
                Complete 3 min + 300m para ganhar moedas
              </div>
            )}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
