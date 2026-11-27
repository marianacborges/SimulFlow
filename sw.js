// Service worker do SimulFlow: "rede primeiro" para os arquivos do próprio site.
// - Com internet: sempre busca a versão mais nova (revalida no servidor; se não mudou, a resposta é curta),
//   então uma versão publicada aparece ao recarregar, sem precisar limpar o cache do navegador.
// - Sem internet: usa a última cópia guardada, para o app (e a tela de leitura) abrir mesmo offline.
// Não intercepta outros domínios (planilha Google / Apps Script).
const CACHE = 'simulflow-arquivos';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const resp = await fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' });
      if (resp.ok) cache.put(url.href, resp.clone()).catch(() => {});
      return resp;
    } catch (erro) {
      const raiz = new URL('./', self.location).href;
      const ehInicio = url.href === raiz || url.href === raiz + 'index.html';
      const copia = await cache.match(url.href) || (req.mode === 'navigate' && ehInicio ? await cache.match(ehInicio && url.href === raiz ? raiz + 'index.html' : raiz) : null);
      if (copia) return copia;
      throw erro;
    }
  })());
});
