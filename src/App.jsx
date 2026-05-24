import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Onboarding, { isOnboardingDone } from './components/Onboarding';
import { storeReferrerIfNew } from './hooks/usePoints';
import { ConfigContext } from './hooks/useConfig';
import { supabase } from './lib/supabase';
import Home from './pages/Home';
import MapView from './pages/MapView';
import Broadcaster from './pages/Broadcaster';
import Rewards from './pages/Rewards';
import Merchant from './pages/Merchant';
import Admin from './pages/Admin';
import Privacy from './pages/Privacy';

function ReferralCapture() {
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get('ref');
    if (ref) storeReferrerIfNew(ref);
  }, [location.search]);
  return null;
}

function App() {
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingDone());
  const [appConfig, setAppConfig] = useState({ pontosAtivados: true });

  useEffect(() => {
    supabase
      .from('configuracoes')
      .select('chave, valor')
      .then(({ data }) => {
        if (!data) return;
        const cfg = { pontosAtivados: true };
        data.forEach((row) => {
          if (row.chave === 'pontos_ativados') cfg.pontosAtivados = row.valor === 'true';
        });
        setAppConfig(cfg);
      })
      .catch(() => {}); // falha silenciosa — mantém padrão ativado
  }, []);

  if (showOnboarding) {
    return <Onboarding onDone={() => setShowOnboarding(false)} />;
  }

  return (
    <ConfigContext.Provider value={appConfig}>
      <ErrorBoundary>
        <BrowserRouter>
          <ReferralCapture />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/mapa" element={<MapView />} />
            <Route path="/transmitir" element={<Broadcaster />} />
            <Route path="/carteira" element={<Rewards />} />
            <Route path="/lojista/:shopId" element={<Merchant />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/privacidade" element={<Privacy />} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </ConfigContext.Provider>
  );
}

export default App;
