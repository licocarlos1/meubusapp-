import { useState } from 'react';
import { BusFront, Coins, Gift, ChevronRight, MapPin } from 'lucide-react';

const ONBOARDING_KEY = 'meubusapp_onboarding_done';

export function isOnboardingDone() {
  return localStorage.getItem(ONBOARDING_KEY) === 'true';
}

const screens = [
  {
    icon: <BusFront size={72} color="#10b981" />,
    title: 'Bem-vindo ao MeuBusApp!',
    subtitle: 'O Waze do transporte coletivo de Sete Lagoas',
    body: (
      <p style={{ color: '#94a3b8', fontSize: '1rem', lineHeight: 1.6, textAlign: 'center' }}>
        Saiba <strong style={{ color: '#e2e8f0' }}>onde está o ônibus</strong> em tempo real,
        graças à colaboração de outros passageiros — sem esperar no ponto sem saber nada.
      </p>
    ),
  },
  {
    icon: <Coins size={72} color="#eab308" />,
    title: 'Transmita e ganhe moedas',
    subtitle: 'Sua colaboração vale prêmios reais',
    body: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', width: '100%' }}>
        {[
          { step: '1', text: 'Entre no ônibus e toque em "Estou no Ônibus"' },
          { step: '2', text: 'Selecione a linha e comece a transmitir' },
          { step: '3', text: 'Ganhe 10 MeuBusCoins após 3 min e 300m percorridos' },
        ].map(({ step, text }) => (
          <div
            key={step}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.8rem',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '0.8rem',
              padding: '0.8rem 1rem',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #10b981, #3b82f6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '0.9rem',
                flexShrink: 0,
              }}
            >
              {step}
            </div>
            <span style={{ color: '#e2e8f0', fontSize: '0.9rem', lineHeight: 1.4 }}>{text}</span>
          </div>
        ))}
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid #10b981',
            borderRadius: '0.8rem',
            padding: '0.7rem 1rem',
            textAlign: 'center',
            color: '#10b981',
            fontWeight: 700,
            fontSize: '0.9rem',
          }}
        >
          ✨ 10 MeuBusCoins por viagem válida
        </div>
      </div>
    ),
  },
  {
    icon: <Gift size={72} color="#3b82f6" />,
    title: 'Troque por prêmios na cidade',
    subtitle: 'Parceiros locais de Sete Lagoas',
    body: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', width: '100%' }}>
        <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.6, textAlign: 'center' }}>
          Acumule MeuBusCoins e resgate{' '}
          <strong style={{ color: '#e2e8f0' }}>descontos e brindes</strong> em estabelecimentos
          parceiros perto de você.
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid #3b82f6',
            borderRadius: '0.8rem',
            padding: '0.8rem 1rem',
          }}
        >
          <MapPin size={20} color="#3b82f6" />
          <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>
            Os brindes aparecem automaticamente quando você está próximo da loja parceira.
          </span>
        </div>
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid #10b981',
            borderRadius: '0.8rem',
            padding: '0.8rem 1rem',
            textAlign: 'center',
          }}
        >
          <div style={{ color: '#10b981', fontWeight: 800, fontSize: '1rem' }}>
            Indique amigos, ganhe mais!
          </div>
          <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: 4 }}>
            Você e seu amigo ganham 15 moedas quando ele fizer a 1ª viagem.
          </div>
        </div>
      </div>
    ),
  },
];

export default function Onboarding({ onDone }) {
  const [current, setCurrent] = useState(0);

  const isLast = current === screens.length - 1;

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem(ONBOARDING_KEY, 'true');
      onDone();
    } else {
      setCurrent((c) => c + 1);
    }
  };

  const { icon, title, subtitle, body } = screens[current];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0f172a',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      {/* Dots */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '2rem' }}>
        {screens.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === current ? 24 : 8,
              height: 8,
              borderRadius: 4,
              background: i === current ? 'var(--primary)' : 'rgba(255,255,255,0.2)',
              transition: 'all 0.3s ease',
            }}
          />
        ))}
      </div>

      {/* Icon */}
      <div style={{ marginBottom: '1.5rem' }}>{icon}</div>

      {/* Title */}
      <h2
        style={{
          fontSize: '1.6rem',
          fontWeight: 800,
          textAlign: 'center',
          background: 'linear-gradient(to right, #10b981, #3b82f6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: '0.5rem',
        }}
      >
        {title}
      </h2>
      <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem', textAlign: 'center' }}>
        {subtitle}
      </p>

      {/* Body */}
      <div style={{ width: '100%', maxWidth: 400, marginBottom: '2rem' }}>{body}</div>

      {/* Button */}
      <button
        className="btn btn-primary"
        style={{ maxWidth: 400, width: '100%', padding: '1.1rem', fontSize: '1.1rem' }}
        onClick={handleNext}
      >
        {isLast ? 'Começar agora!' : 'Próximo'}
        {!isLast && <ChevronRight size={20} />}
      </button>

      {/* Skip */}
      {!isLast && (
        <button
          onClick={() => {
            localStorage.setItem(ONBOARDING_KEY, 'true');
            onDone();
          }}
          style={{
            background: 'none',
            border: 'none',
            color: '#475569',
            cursor: 'pointer',
            marginTop: '1rem',
            fontSize: '0.85rem',
          }}
        >
          Pular introdução
        </button>
      )}
    </div>
  );
}
