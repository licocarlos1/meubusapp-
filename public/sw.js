const CACHE_NAME = 'meubusapp-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Instalação: Salva ativos básicos e assume o controle imediatamente
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Ativação: Limpa caches de versões anteriores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

// Estratégia Network-First: Tenta a rede primeiro para garantir o frescor (importante para Vite hashes)
self.addEventListener('fetch', (event) => {
  // Ignora requisições de outros domínios (Supabase) ou métodos que não sejam GET
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Atualiza o cache com a versão mais recente da rede
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => {
        // Fallback para o cache apenas se estiver offline
        return caches.match(event.request);
      })
  );
});
