import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BusFront, MapPin, Wallet, Coins, Smartphone, Map as MapIcon, X, HelpCircle, Share2, Copy, CheckCheck, Flame, KeyRound } from 'lucide-react';
import { usePoints } from '../hooks/usePoints';
import { getReferralCode, getStreak, getDeviceId } from '../hooks/usePoints';
import { useConfig } from '../hooks/useConfig';
import { supabase } from '../lib/supabase';
import Footer from '../components/Footer';
import AdBanner from '../components/AdBanner';

export default function Home() {
  const { totalPoints } = usePoints();
  const { pontosAtivados } = useConfig();
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [recoveryStatus, setRecoveryStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [recoveryMsg, setRecoveryMsg] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [linhas, setLinhas] = useState([]);
  const [copied, setCopied] = useState(false);
  const streak = getStreak();

  useEffect(() => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(ios);

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      if (isIOS) {
        alert("Para instalar no iPhone: Clique no ícone de 'Compartilhar' no seu navegador e selecione 'Adicionar à Tela de Início'. 📲");
      }
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  const openMapFilter = async () => {
    setShowMapModal(true);
    const { data } = await supabase.from('linhas').select('nome').order('nome');
    if (data) setLinhas(data);
  };

  const navigateToMap = (linha) => {
    setShowMapModal(false);
    navigate(`/mapa?linha=${encodeURIComponent(linha)}`);
  };

  const referralCode = getReferralCode();
  const referralLink = `${window.location.origin}/?ref=${referralCode}`;

  const handleShare = async () => {
    const text = `Baixei o MeuBusApp e estou rastreando os ônibus de Sete Lagoas em tempo real! Você também pode ganhar prêmios. Acesse: ${referralLink}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'MeuBusApp', text, url: referralLink });
      } catch (_) {}
    } else {
      handleCopy();
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const myDeviceId = getDeviceId();

  const copyDeviceId = () => {
    navigator.clipboard.writeText(myDeviceId).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    });
  };

  const restoreAccount = async () => {
    const code = recoveryInput.trim();
    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(code)) {
      setRecoveryStatus('error');
      setRecoveryMsg('Formato inválido. O código deve ser um UUID completo (ex: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).');
      return;
    }
    if (code.toLowerCase() === myDeviceId.toLowerCase()) {
      setRecoveryStatus('error');
      setRecoveryMsg('Este já é o seu dispositivo atual.');
      return;
    }

    setRecoveryStatus('loading');
    setRecoveryMsg('');

    try {
      const { data: exists } = await supabase.rpc('verificar_perfil_existe', {
        p_device_id: code.toLowerCase(),
      });

      if (!exists) {
        setRecoveryStatus('error');
        setRecoveryMsg('Nenhuma conta encontrada com este código. Verifique e tente novamente.');
        return;
      }

      // Restore: overwrite localStorage device_id and reload
      localStorage.setItem('meubusapp_device_id', code.toLowerCase());
      setRecoveryStatus('success');
      setRecoveryMsg('Conta encontrada! Recarregando...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setRecoveryStatus('error');
      setRecoveryMsg('Erro de conexão. Verifique sua internet e tente novamente.');
    }
  };

  return (
    <div className="container" style={{ position: 'relative', padding: 0 }}>
      <AdBanner position="top" />

      <div style={{ padding: '1.5rem' }}>
        <header>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <h1 style={{ margin: 0 }}>MeuBusApp</h1>
                <span style={{ background: 'var(--primary, #10b981)', color: 'white', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '6px', fontWeight: 'bold', letterSpacing: '1px' }}>BETA</span>
              </div>
              <p style={{ margin: 0 }}>Acompanhe e colabore para uma Sete Lagoas pontual.</p>
            </div>

            {pontosAtivados && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                <div style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid #eab308', padding: '0.4rem 0.8rem', borderRadius: '1rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Coins size={14} color="#eab308" />
                  <span style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.8rem)', fontWeight: 'bold', color: '#eab308', whiteSpace: 'nowrap' }}>{totalPoints} MeuBusCoins</span>
                </div>
                {streak > 0 && (
                  <div style={{ background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234,179,8,0.3)', padding: '0.25rem 0.6rem', borderRadius: '1rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Flame size={12} color="#eab308" />
                    <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#eab308' }}>{streak} dia{streak !== 1 ? 's' : ''} seguido{streak !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '0.8rem', fontSize: '1.2rem', color: '#e2e8f0' }}>O que você vai fazer hoje?</h2>

          <Link to="/transmitir" style={{ textDecoration: 'none' }}>
            <button className="btn btn-primary" style={{ padding: '1.2rem', fontSize: '1.1rem', width: '100%' }}>
              <BusFront size={24} />
              Estou no Ônibus
            </button>
          </Link>

          <button className="btn btn-secondary" onClick={openMapFilter} style={{ padding: '1.2rem', fontSize: '1.1rem', width: '100%' }}>
            <MapIcon size={24} />
            Ver Mapa
          </button>

          {pontosAtivados && (
            <Link to="/carteira" style={{ textDecoration: 'none' }}>
              <button className="btn btn-outline" style={{ padding: '1.2rem', fontSize: '1.1rem', width: '100%', borderColor: 'var(--primary)', color: 'var(--primary)' }}>
                <Wallet size={24} />
                Meus MeuBusCoins
              </button>
            </Link>
          )}

          {/* Referral button — só aparece quando pontos estão ativos */}
          {pontosAtivados && (
            <button
              onClick={() => setShowReferralModal(true)}
              style={{
                background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(59,130,246,0.15))',
                border: '1px solid rgba(16,185,129,0.4)',
                borderRadius: '1rem',
                padding: '1rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.8rem',
                color: '#e2e8f0',
                width: '100%',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Share2 size={18} color="white" />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Indicar Amigos</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Você e seu amigo ganham +15 moedas</div>
              </div>
            </button>
          )}

          {(deferredPrompt || isIOS) && (
            <button
              className="btn pulsing-btn"
              onClick={handleInstallClick}
              style={{ padding: '1.2rem', fontSize: '1.1rem', width: '100%', background: 'linear-gradient(45deg, #10b981, #3b82f6)', color: 'white', border: 'none' }}
            >
              <Smartphone size={24} />
              Instalar MeuBusApp no Celular
            </button>
          )}

          <button
            onClick={() => setShowHelpModal(true)}
            style={{ background: 'none', border: 'none', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', marginTop: '0.5rem' }}
          >
            <HelpCircle size={18} />
            Como o MeuBusApp funciona?
          </button>

          <button
            onClick={() => { setShowRecoveryModal(true); setRecoveryStatus(null); setRecoveryInput(''); }}
            style={{ background: 'none', border: 'none', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            <KeyRound size={15} />
            Código de recuperação / Trocar de celular
          </button>

          <div style={{ textAlign: 'center', marginTop: '0.5rem', color: '#64748b', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span>🔒 Sua colaboração é anônima e vale benefícios. Veja nossa <Link to="/privacidade" style={{ color: 'var(--primary)' }}>Política de Privacidade</Link>.</span>
            <a
              href="https://wa.me/5531983315536?text=Ol%C3%A1%21%20Achei%20o%20MeuBusApp%20fant%C3%A1stico%20e%20gostaria%20de%20contribuir%20com%20o%20projeto."
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#10b981', textDecoration: 'none', fontWeight: '500', display: 'inline-block', background: 'rgba(16, 185, 129, 0.1)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)' }}
            >
              💚 Clique Aqui e Ajude o projeto contribuindo com qualquer valor
            </a>
          </div>
        </div>
      </div>

      {/* Referral Modal */}
      {showReferralModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2rem', background: '#0f172a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Share2 size={20} color="var(--primary)" /> Indicar Amigos
              </h3>
              <button onClick={() => setShowReferralModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <div
              style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid #10b981',
                borderRadius: '1rem',
                padding: '1rem',
                textAlign: 'center',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ fontSize: '2rem', fontWeight: 900, color: '#10b981', letterSpacing: '4px' }}>
                {referralCode}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                Seu código de indicação
              </div>
            </div>

            <div style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.5rem', textAlign: 'center' }}>
              Quando seu amigo fizer a <strong style={{ color: '#e2e8f0' }}>primeira viagem</strong> usando seu link,{' '}
              <strong style={{ color: '#eab308' }}>ambos ganham 15 MeuBusCoins!</strong>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <button
                className="btn btn-primary"
                onClick={handleShare}
                style={{ padding: '1rem' }}
              >
                <Share2 size={18} />
                Compartilhar via WhatsApp / Apps
              </button>
              <button
                className="btn btn-outline"
                onClick={handleCopy}
                style={{ padding: '0.9rem', borderColor: copied ? 'var(--primary)' : undefined, color: copied ? 'var(--primary)' : undefined }}
              >
                {copied ? <CheckCheck size={18} /> : <Copy size={18} />}
                {copied ? 'Link Copiado!' : 'Copiar Link'}
              </button>
            </div>

            <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '1rem', textAlign: 'center' }}>
              Válido apenas para novos usuários na 1ª viagem.
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2rem', background: '#0f172a', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BusFront size={20} color="var(--primary)" />
                Como funciona?
              </h3>
              <button onClick={() => setShowHelpModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ color: '#e2e8f0', fontSize: '0.95rem', lineHeight: '1.6' }}>
              <p>O MeuBusApp é o "Waze" do transporte coletivo de Sete Lagoas!</p>
              <h4 style={{ color: 'var(--primary)', marginTop: '1rem', marginBottom: '0.5rem' }}>1. Colabore com a cidade!</h4>
              <p>Quando entrar no ônibus, clique em <strong>"Estou no Ônibus"</strong>. Você transmitirá a viagem pelo GPS{pontosAtivados ? ' e <strong>ganhará MeuBusCoins</strong> por isso.' : '.'}</p>
              <h4 style={{ color: 'var(--primary)', marginTop: '1rem', marginBottom: '0.5rem' }}>2. Acompanhe do ponto</h4>
              <p>Está esperando? Clique em <strong>"Ver Mapa"</strong> para ver, em tempo real, onde o ônibus está.</p>
              {pontosAtivados && (
                <>
                  <h4 style={{ color: 'var(--primary)', marginTop: '1rem', marginBottom: '0.5rem' }}>3. Resgate prêmios reais</h4>
                  <p>Acumulou MeuBusCoins? Vá em <strong>"Meus MeuBusCoins"</strong> e troque por descontos em parceiros da cidade.</p>
                  <h4 style={{ color: '#eab308', marginTop: '1rem', marginBottom: '0.5rem' }}>4. Bônus de sequência</h4>
                  <p>Transmita dias seguidos e ganhe bônus: 3 dias (+5), 7 dias (+10), 14 dias (+20), 30 dias (+30 moedas)!</p>
                </>
              )}
              <div style={{ marginTop: '1.5rem', padding: '0.8rem', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid #eab308', borderRadius: '8px', fontSize: '0.85rem' }}>
                📍 <strong>Importante:</strong> Ao acessar pela primeira vez, você precisa <strong>permitir o acesso à localização</strong> para que o sistema funcione corretamente.
              </div>
            </div>

            <button className="btn btn-primary" onClick={() => setShowHelpModal(false)} style={{ width: '100%', marginTop: '2rem', padding: '1rem' }}>
              Entendi, vamos lá!
            </button>
          </div>
        </div>
      )}

      {/* Map Modal */}
      {showMapModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2rem', background: '#0f172a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: 'white' }}>Qual linha você quer ver?</h3>
              <button onClick={() => setShowMapModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '50vh', overflowY: 'auto' }}>
              {linhas.map(l => (
                <button key={l.nome} className="btn btn-outline" onClick={() => navigateToMap(l.nome)} style={{ padding: '0.8rem', textAlign: 'left', borderColor: 'rgba(255,255,255,0.1)', color: '#e2e8f0' }}>
                  {l.nome}
                </button>
              ))}
              {linhas.length === 0 && (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>Carregando linhas...</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recovery Modal */}
      {showRecoveryModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '2rem', background: '#0f172a', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={20} color="var(--primary)" /> Conta & Recuperação
              </h3>
              <button onClick={() => setShowRecoveryModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            {/* Seção: Meu Código */}
            <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '12px', padding: '1.2rem', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                🔑 Seu Código de Recuperação
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#e2e8f0', wordBreak: 'break-all', background: 'rgba(0,0,0,0.3)', padding: '0.7rem', borderRadius: '8px', marginBottom: '0.8rem', letterSpacing: '1px' }}>
                {myDeviceId}
              </div>
              <button
                onClick={copyDeviceId}
                style={{ background: codeCopied ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.07)', border: `1px solid ${codeCopied ? '#10b981' : 'rgba(255,255,255,0.15)'}`, color: codeCopied ? '#10b981' : '#e2e8f0', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', width: '100%', justifyContent: 'center' }}
              >
                {codeCopied ? <CheckCheck size={16} /> : <Copy size={16} />}
                {codeCopied ? 'Copiado!' : 'Copiar código'}
              </button>
              <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '0.7rem', lineHeight: 1.5 }}>
                ⚠️ <strong>Guarde este código com segurança.</strong> Nunca compartilhe com ninguém. Com ele é possível acessar seus pontos em outro celular.
              </div>
            </div>

            {/* Seção: Restaurar */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.5rem' }}>
              <div style={{ fontSize: '0.85rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '0.5rem' }}>
                📲 Trocou de celular?
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '1rem', lineHeight: 1.5 }}>
                Cole abaixo o código do seu celular anterior para recuperar seus pontos e histórico.
              </div>
              <textarea
                value={recoveryInput}
                onChange={(e) => { setRecoveryInput(e.target.value); setRecoveryStatus(null); }}
                placeholder="Cole aqui seu código anterior (UUID completo)"
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '0.8rem', color: '#e2e8f0', fontSize: '0.8rem', fontFamily: 'monospace', resize: 'none', height: '80px', boxSizing: 'border-box' }}
              />

              {recoveryStatus === 'error' && (
                <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.5rem', background: 'rgba(239,68,68,0.1)', padding: '0.6rem', borderRadius: '6px' }}>
                  ❌ {recoveryMsg}
                </div>
              )}
              {recoveryStatus === 'success' && (
                <div style={{ color: '#10b981', fontSize: '0.8rem', marginTop: '0.5rem', background: 'rgba(16,185,129,0.1)', padding: '0.6rem', borderRadius: '6px' }}>
                  ✅ {recoveryMsg}
                </div>
              )}

              <button
                className="btn btn-primary"
                onClick={restoreAccount}
                disabled={recoveryStatus === 'loading' || recoveryStatus === 'success'}
                style={{ width: '100%', marginTop: '1rem', opacity: recoveryStatus === 'loading' ? 0.7 : 1 }}
              >
                {recoveryStatus === 'loading' ? '⏳ Verificando...' : '🔄 Restaurar minha conta'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AdBanner position="bottom" />
      <Footer />
    </div>
  );
}
