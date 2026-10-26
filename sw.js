/*
 * Service worker do app instalado (PWA): abre sem internet e mantém os arquivos atualizados.
 * - Página (index.html): primeiro a rede (versão publicada mais recente); sem internet, a cópia guardada.
 * - Arquivos do app (js/css/ícones, com ?v= da versão) e bibliotecas dos CDNs (versões fixas): cópia guardada, senão a rede.
 * - Firebase (login e banco) passa direto: os lançamentos sem internet ficam no cache do próprio Firestore.
 * A versão abaixo acompanha a de index.html: ao publicar, o navegador instala este arquivo novo e limpa o cache antigo.
 */
const VERSAO = '2026.10.26.1';
const CACHE = 'livro-caixa-' + VERSAO;
const CDNS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (ev) => {
  ev.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const resp = await fetch('./index.html', { cache: 'no-store' });
    const html = await resp.clone().text();
    await cache.put('./index.html', resp);
    const locais = ['./', './manifest.webmanifest'];
    html.replace(/(?:src|href)="([^"#:]+)"/g, (t, u) => { if (!/^(data|https?|mailto):/.test(u)) locais.push(u); return t; });
    await Promise.all(locais.map((u) => cache.add(new Request(u, { cache: 'no-store' })).catch(() => { /* arquivo opcional */ })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => n.startsWith('livro-caixa-') && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const local = url.origin === self.location.origin;
  if (req.mode === 'navigate' && local) {
    ev.respondWith((async () => {
      try {
        const resp = await fetch(req);
        if (resp.ok) { const c = await caches.open(CACHE); c.put('./index.html', resp.clone()); }
        return resp;
      } catch (e) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }
  if (!local && !CDNS.includes(url.hostname)) return;
  if (url.hostname === 'www.gstatic.com' && !url.pathname.startsWith('/firebasejs/')) return;
  ev.respondWith((async () => {
    const guardado = await caches.match(req);
    if (guardado) return guardado;
    const resp = await fetch(req);
    if (resp.ok || resp.type === 'opaque') { const c = await caches.open(CACHE); c.put(req, resp.clone()); }
    return resp;
  })());
});
