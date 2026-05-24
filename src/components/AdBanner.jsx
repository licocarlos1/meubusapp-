import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

const CTA_LINK = 'https://wa.me/5531983315536?text=Ol%C3%A1%21%20Gostaria%20de%20anunciar%20minha%20empresa%20no%20MeuBusApp.';

// Estilos por posição
const positionStyles = {
  top: {
    wrapper: { zIndex: 1100, background: '#1e293b', textAlign: 'center', width: '100%', borderBottom: '1px solid #334155' },
    img: { width: '100%', maxWidth: '600px', height: 'auto', minHeight: '50px', maxHeight: '100px', objectFit: 'contain', display: 'block', margin: '0 auto' },
    ctaHeight: '50px',
    ctaFontSize: '1rem',
    lateral: false,
  },
  bottom: {
    wrapper: { zIndex: 1100, background: '#1e293b', textAlign: 'center', width: '100%', borderTop: '1px solid #334155' },
    img: { width: '100%', maxWidth: '600px', height: 'auto', minHeight: '50px', maxHeight: '100px', objectFit: 'contain', display: 'block', margin: '0 auto' },
    ctaHeight: '50px',
    ctaFontSize: '1rem',
    lateral: false,
  },
  esquerda: {
    wrapper: {
      position: 'absolute',
      left: '8px',
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 999,
      width: '60px',
      borderRadius: '10px',
      overflow: 'hidden',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      background: '#1e293b',
      border: '1px solid #334155',
    },
    img: { width: '60px', height: '160px', objectFit: 'cover', display: 'block' },
    ctaHeight: '160px',
    ctaFontSize: '0.55rem',
    lateral: true,
  },
  direita: {
    wrapper: {
      position: 'absolute',
      right: '8px',
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 999,
      width: '60px',
      borderRadius: '10px',
      overflow: 'hidden',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      background: '#1e293b',
      border: '1px solid #334155',
    },
    img: { width: '60px', height: '160px', objectFit: 'cover', display: 'block' },
    ctaHeight: '160px',
    ctaFontSize: '0.55rem',
    lateral: true,
  },
};

export default function AdBanner({ position = 'top' }) {
  const [ads, setAds] = useState([]);
  const [currentAdIdx, setCurrentAdIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const hasTrackedViewRef = useRef(new Set());

  const style = positionStyles[position] || positionStyles.top;

  useEffect(() => {
    fetchAds();
  }, [position]);

  const fetchAds = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('anuncios')
      .select('*')
      .lte('data_inicio', today)
      .gte('data_fim', today);

    if (!error && data && data.length > 0) {
      const filtered = data.filter(ad => (ad.posicao || 'top') === position);
      setAds(filtered);
    } else if (error) {
      console.warn('Erro ao carregar banners:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (ads.length > 0 && !loading) {
      const currentAd = ads[currentAdIdx];
      if (currentAd && !hasTrackedViewRef.current.has(currentAd.id)) {
        trackEvent(currentAd.id, 'view');
        hasTrackedViewRef.current.add(currentAd.id);
      }
    }
  }, [currentAdIdx, ads, loading]);

  const trackEvent = async (anuncioId, tipo) => {
    try {
      await supabase.rpc('increment_anuncio_evento', { p_anuncio_id: anuncioId, p_tipo_evento: tipo });
    } catch (error) {
      console.warn(`Erro ao rastrear ${tipo}:`, error);
    }
  };

  const handleAdClick = async (ad) => {
    await trackEvent(ad.id, 'click');
  };

  useEffect(() => {
    if (ads.length > 1) {
      const interval = setInterval(() => {
        setCurrentAdIdx(prev => (prev + 1) % ads.length);
      }, 8000);
      return () => clearInterval(interval);
    }
  }, [ads]);

  // CTA padrão quando não há anúncio — laterais são menores
  if (loading || ads.length === 0) {
    if (style.lateral) {
      return (
        <a
          href={CTA_LINK}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...style.wrapper,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
            height: style.ctaHeight,
            gap: '4px',
            padding: '6px 2px',
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>📢</span>
          <span style={{
            fontSize: style.ctaFontSize,
            color: '#10b981',
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: 1.2,
            writingMode: 'vertical-lr',
            transform: 'rotate(180deg)',
          }}>
            ANUNCIE AQUI
          </span>
        </a>
      );
    }

    return (
      <div style={style.wrapper}>
        <a
          href={CTA_LINK}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', height: style.ctaHeight, width: '100%' }}
        >
          <div style={{ color: 'white', fontWeight: 'bold', fontSize: style.ctaFontSize, letterSpacing: '1px' }}>
            🚀 ANUNCIE AQUI O SEU NEGÓCIO
          </div>
          <div style={{ color: '#10b981', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 600 }}>
            Fale conosco e apareça para milhares de passageiros
          </div>
        </a>
      </div>
    );
  }

  const ad = ads[currentAdIdx];

  return (
    <div style={style.wrapper}>
      <a
        href={ad.link_clique}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => handleAdClick(ad)}
        style={{ display: 'block', textDecoration: 'none' }}
      >
        <img
          src={ad.imagem_url}
          alt={ad.titulo}
          style={style.img}
        />
        {!style.lateral && (
          <div style={{ fontSize: '0.6rem', color: '#64748b', background: '#000', padding: '4px' }}>
            Anúncio: {ad.titulo}
          </div>
        )}
      </a>
    </div>
  );
}
