/*
 * Livro-Caixa do Casal — conexão com o Firebase (Google).
 *
 * Login com a conta Google e dados no Cloud Firestore, atualizados em tempo real entre os aparelhos e guardados no
 * aparelho quando estiver sem internet (cache persistente do Firestore). O casal compartilha um único livro:
 *   livros/{livro}/config/app · livros/{livro}/series/{id} · livros/{livro}/metas/{id} · livros/{livro}/aportes/{id}
 * Quem pode ler e gravar é definido pelas regras do Firestore (lista de e-mails), geradas na tela de regras.
 *
 * Expõe window.Backend.use('db' | 'user' | 'downloads'), a interface que js/app.js usa, mais sair(), mostrarRegras(),
 * trocarConfig() e info(). Antes de liberar o app, mostra em #porta a configuração, o login e as regras, se faltarem.
 */
(function () {
  'use strict';

  const VERSAO_SDK = '12.19.0';
  const BASE_SDK = 'https://www.gstatic.com/firebasejs/' + VERSAO_SDK + '/';
  const CHAVE_CFG = 'lcc:firebase';
  const CHAVE_EMAILS = 'lcc:emails';
  const CAMPOS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  const CONF_SITE = window.LCC_NUVEM || {};
  const LIVRO = /^[\w-]{1,60}$/.test(CONF_SITE.livro || '') ? CONF_SITE.livro : 'principal';

  let fb = null;        // {m: módulos do SDK, app, auth, fs, cfg}
  let usuario = null;
  let promessa = null;

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ler = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const gravarLocal = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } };
  const MARCA = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="var(--ink)"/><path d="M7 11.5h18M7 16.5h18M7 21.5h18" stroke="var(--on-ink)" stroke-opacity=".55" stroke-width="1.4"/><path d="M11.5 6v20M13.8 6v20" stroke="var(--margin)" stroke-width="1.4"/></svg>';
  const G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

  /* ------------------------------------------------------------ configuração do projeto */

  /** firebaseConfig em uso: o colado neste aparelho ou o publicado em js/nuvem-config.js. */
  function config() {
    const local = ler(CHAVE_CFG, null);
    if (local && local.apiKey && local.projectId) return local;
    const site = CONF_SITE.firebaseConfig;
    return site && site.apiKey && site.projectId ? site : null;
  }
  function origemConfig() {
    const local = ler(CHAVE_CFG, null);
    if (local && local.apiKey) return 'aparelho';
    return CONF_SITE.firebaseConfig && CONF_SITE.firebaseConfig.apiKey ? 'site' : null;
  }
  /** Lê o objeto firebaseConfig colado do console (JSON ou o trecho em JavaScript). */
  function lerConfig(texto) {
    const cfg = {};
    String(texto || '').replace(/["']?(\w+)["']?\s*:\s*["']([^"']+)["']/g, (t, k, v) => { if (CAMPOS.includes(k)) cfg[k] = v.trim(); return t; });
    if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId) throw new Error('Configuração incompleta: copie o objeto firebaseConfig inteiro (apiKey, authDomain, projectId e appId).');
    return cfg;
  }

  /** Regras de segurança: só os e-mails do casal, com login Google verificado, leem e gravam o livro. */
  function regras(emails) {
    const lista = emails.map((e) => "'" + String(e).trim().toLowerCase().replace(/['"\\\s]/g, '') + "'").join(', ');
    return "rules_version = '2';\n" +
      'service cloud.firestore {\n' +
      '  match /databases/{database}/documents {\n' +
      '    // Livro-Caixa do Casal: só estes e-mails (login Google verificado) leem e gravam os lançamentos.\n' +
      '    match /livros/{livro}/{documento=**} {\n' +
      '      allow read, write: if request.auth != null\n' +
      '        && request.auth.token.email_verified == true\n' +
      '        && request.auth.token.email.lower() in [' + lista + '];\n' +
      '    }\n' +
      '  }\n' +
      '}\n';
  }

  /* ------------------------------------------------------------ telas de acesso */

  function porta(html) {
    const p = $('#porta'); if (!p) return;
    p.innerHTML = `<div class="porta-in"><div class="porta-marca">${MARCA}<div><strong>Livro-Caixa</strong><span>do Casal · finanças compartilhadas</span></div></div>${html}</div>`;
    p.hidden = false; document.documentElement.classList.add('locked');
  }
  function fecharPorta() { const p = $('#porta'); if (!p) return; p.hidden = true; p.innerHTML = ''; document.documentElement.classList.remove('locked'); }
  function erroTexto(e) {
    const c = String((e && e.code) || '');
    const T = {
      'auth/popup-closed-by-user': 'A janela do Google foi fechada antes de concluir o login.',
      'auth/cancelled-popup-request': 'O login foi cancelado. Tente de novo.',
      'auth/unauthorized-domain': `Este endereço (${location.hostname}) não está autorizado no Firebase. Em Segurança › Authentication › Configurações › Domínios autorizados, adicione-o.`,
      'auth/operation-not-allowed': 'O login com Google não está ativado. Em Segurança › Authentication › Método de login, ative o Google.',
      'auth/network-request-failed': 'Sem internet para entrar. Verifique a conexão.',
      'auth/invalid-api-key': 'A chave da API do firebaseConfig está errada. Cole a configuração de novo.',
      'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'A chave da API do firebaseConfig está errada. Cole a configuração de novo.',
    };
    return T[c] || (e && e.message) || 'Algo deu errado.';
  }

  function telaConfig(trocando) {
    const atual = config();
    porta(`<section class="card">
      <div><h1 class="ct" style="font-size:20px">Conectar ao Firebase</h1><p class="sub">Os lançamentos ficam no Cloud Firestore do seu projeto Firebase (plano gratuito). Faça uma vez e use o mesmo projeto nos dois celulares e no computador.</p></div>
      <ol>
        <li>Abra <a href="https://console.firebase.google.com/" target="_blank" rel="noopener">console.firebase.google.com</a> e crie um projeto (por exemplo, <code>livro-caixa-casal</code>). O Google Analytics pode ficar desligado.</li>
        <li>No menu da esquerda, <b>Segurança › Authentication</b>: toque em <b>Vamos começar</b>, abra <b>Método de login</b> e ative o <b>Google</b>.</li>
        <li>Ainda em Authentication, aba <b>Configurações › Domínios autorizados</b>: adicione <code>${esc(location.hostname || 'o endereço do app')}</code>.</li>
        <li><b>Bancos de dados e armazenamento › Firestore</b>: crie o banco (edição Standard, local <code>southamerica-east1</code> São Paulo, modo de produção).</li>
        <li><b>Configurações do projeto › Geral › Seus aplicativos</b>: toque em <code>&lt;/&gt;</code> (Web), dê um apelido, toque em <b>Registrar app</b> e copie o objeto <code>firebaseConfig</code>.</li>
        <li>Cole abaixo e toque em <b>Salvar e continuar</b>. Para valer em todos os aparelhos sem colar de novo, publique-o em <code>js/nuvem-config.js</code>.</li>
      </ol>
      <div class="fld"><label for="nv-cfg">firebaseConfig</label><textarea id="nv-cfg" rows="9" spellcheck="false" placeholder="const firebaseConfig = {&#10;  apiKey: &quot;...&quot;,&#10;  authDomain: &quot;...&quot;,&#10;  projectId: &quot;...&quot;,&#10;  ...&#10;};">${atual && trocando ? esc(JSON.stringify(atual, null, 2)) : ''}</textarea></div>
      <p class="err" id="nv-err" role="alert"></p>
      <div class="acts"><button type="button" class="btn pri" id="nv-salvar">Salvar e continuar</button>${trocando ? '<button type="button" class="btn" id="nv-voltar">Voltar ao app</button>' : ''}${trocando && origemConfig() === 'aparelho' ? '<button type="button" class="btn dng" id="nv-limpar">Apagar deste aparelho</button>' : ''}</div>
    </section>`);
    $('#nv-salvar').onclick = () => {
      try { const cfg = lerConfig($('#nv-cfg').value); gravarLocal(CHAVE_CFG, cfg); location.reload(); }
      catch (e) { $('#nv-err').textContent = e.message; }
    };
    if ($('#nv-voltar')) $('#nv-voltar').onclick = fecharPorta;
    if ($('#nv-limpar')) $('#nv-limpar').onclick = () => { gravarLocal(CHAVE_CFG, null); location.reload(); };
  }

  function telaLogin(msg) {
    porta(`<section class="card">
      <div><h1 class="ct" style="font-size:20px">Entrar</h1><p class="sub">Use a sua conta Google. Só os e-mails liberados nas regras do Firestore veem os lançamentos.</p></div>
      <div><button type="button" class="btn-google" id="nv-google">${G}Entrar com Google</button></div>
      <p class="err" id="nv-err" role="alert">${esc(msg || '')}</p>
      <p class="hint">Projeto: <code>${esc(fb ? fb.cfg.projectId : '')}</code> · <a href="#" id="nv-trocar">trocar configuração</a></p>
    </section>`);
    $('#nv-google').onclick = entrar;
    $('#nv-trocar').onclick = (e) => { e.preventDefault(); telaConfig(true); };
  }

  async function entrar() {
    const prov = new fb.m.auth.GoogleAuthProvider();
    prov.setCustomParameters({ prompt: 'select_account' });
    const err = $('#nv-err'); if (err) err.textContent = '';
    try { await fb.m.auth.signInWithPopup(fb.auth, prov); }
    catch (e) {
      const c = String(e && e.code);
      if (/popup-blocked|operation-not-supported|web-storage-unsupported/.test(c)) { await fb.m.auth.signInWithRedirect(fb.auth, prov); return; }
      if (err) err.textContent = erroTexto(e);
    }
  }

  function telaRegras(voltavel) {
    const meu = (usuario && usuario.email || '').toLowerCase();
    const salvos = ler(CHAVE_EMAILS, []);
    const outro = salvos.find((e) => e !== meu) || '';
    porta(`<section class="card">
      <div><h1 class="ct" style="font-size:20px">Liberar o acesso no Firestore</h1><p class="sub">${voltavel ? 'Regras para colar no console do Firebase.' : `O Firebase ainda não liberou o e-mail <b>${esc(meu)}</b>. Publique as regras abaixo uma vez; depois é só entrar.`}</p></div>
      <div class="row2"><div class="fld"><label for="nv-e1">Seu e-mail Google</label><input id="nv-e1" class="inp" type="email" value="${esc(meu)}" autocomplete="email"></div><div class="fld"><label for="nv-e2">E-mail Google da outra pessoa</label><input id="nv-e2" class="inp" type="email" value="${esc(outro)}" placeholder="conjuge@gmail.com" autocomplete="off"></div></div>
      <div class="fld"><label for="nv-regras">Regras</label><textarea id="nv-regras" rows="13" readonly spellcheck="false"></textarea></div>
      <ol>
        <li>No <a href="https://console.firebase.google.com/" target="_blank" rel="noopener">console do Firebase</a>, abra <b>Bancos de dados e armazenamento › Firestore</b> e a aba <b>Regras</b>.</li>
        <li>Apague o conteúdo, cole as regras e toque em <b>Publicar</b>.</li>
        <li>Volte aqui e toque em <b>Já publiquei</b>. A outra pessoa entra no mesmo endereço com a conta Google dela.</li>
      </ol>
      <p class="err" id="nv-err" role="alert"></p>
      <div class="acts"><button type="button" class="btn pri" id="nv-copiar">Copiar regras</button>${voltavel ? '<button type="button" class="btn" id="nv-voltar">Voltar ao app</button>' : '<button type="button" class="btn" id="nv-de-novo">Já publiquei</button>'}<button type="button" class="btn" id="nv-sair">Sair e trocar de conta</button></div>
    </section>`);
    const atualizar = () => {
      const es = [$('#nv-e1').value, $('#nv-e2').value].map((x) => x.trim().toLowerCase()).filter((x) => /^[^@\s'"]+@[^@\s'"]+\.[^@\s'"]+$/.test(x));
      gravarLocal(CHAVE_EMAILS, es);
      $('#nv-regras').value = regras(es.length ? es : ['seu-email@gmail.com']);
    };
    $('#nv-e1').oninput = atualizar; $('#nv-e2').oninput = atualizar; atualizar();
    $('#nv-copiar').onclick = () => {
      const t = $('#nv-regras'); const p = navigator.clipboard && navigator.clipboard.writeText(t.value);
      const ok = () => { $('#nv-err').textContent = ''; $('#nv-copiar').textContent = 'Copiado'; };
      if (p) p.then(ok, () => { t.select(); }); else t.select();
    };
    if ($('#nv-voltar')) $('#nv-voltar').onclick = fecharPorta;
    if ($('#nv-de-novo')) $('#nv-de-novo').onclick = () => { const b = $('#nv-de-novo'); b.disabled = true; b.textContent = 'Verificando…'; window.dispatchEvent(new Event('lcc:verificar')); };
    $('#nv-sair').onclick = sair;
  }

  function telaErro(titulo, texto) {
    porta(`<section class="card"><div><h1 class="ct" style="font-size:20px">${esc(titulo)}</h1><p class="sub">${esc(texto)}</p></div><div class="acts"><button type="button" class="btn pri" id="nv-recarregar">Tentar de novo</button><button type="button" class="btn" id="nv-cfg">Configuração do Firebase</button></div></section>`);
    $('#nv-recarregar').onclick = () => location.reload();
    $('#nv-cfg').onclick = () => telaConfig(true);
  }

  /* ------------------------------------------------------------ banco: mesma interface do app */

  function codigo(e) { return String((e && e.code) || 'unavailable').replace(/^firestore\//, '').replace(/-/g, '_'); }
  function erroDb(e) { return { code: codigo(e), message: (e && e.message) || '' }; }
  /** Grava sem travar o app sem internet: resolve quando o servidor confirma ou, sem resposta, logo após a cópia local. */
  function gravacao(p) {
    let liberado = false;
    const real = p.catch((e) => {
      const er = erroDb(e);
      if (liberado) window.dispatchEvent(new CustomEvent('lcc:erro-gravacao', { detail: er }));
      throw er;
    });
    real.catch(() => { /* avisado pelo evento, se já tinha sido liberado */ });
    return Promise.race([real, sleep(1500).then(() => { liberado = true; })]);
  }
  /** null em atualizações = apagar o campo (deleteField), como o app espera. */
  function comApagar(o) {
    if (o === null) return fb.m.fs.deleteField();
    if (Array.isArray(o) || typeof o !== 'object') return o;
    const r = {}; for (const k of Object.keys(o)) r[k] = comApagar(o[k]); return r;
  }
  function snapDoc(s) {
    const existe = typeof s.exists === 'function' ? s.exists() : !!s.exists;
    return { id: s.id, exists: existe, data: () => (existe ? s.data() : undefined), metadata: s.metadata };
  }
  function partes(caminho) { return String(caminho).split('/').filter(Boolean); }
  function docRef(caminho) {
    const fs = fb.m.fs; const r = fs.doc(fb.fs, 'livros', LIVRO, ...partes(caminho));
    return {
      id: r.id, path: caminho,
      get: () => fs.getDoc(r).then(snapDoc, (e) => { throw erroDb(e); }),
      set: (d) => gravacao(fs.setDoc(r, d)),
      update: (d) => gravacao(fs.setDoc(r, comApagar(d), { merge: true })),
      delete: () => gravacao(fs.deleteDoc(r)),
      onSnapshot: (prox, erro) => fs.onSnapshot(r, (s) => prox(snapDoc(s)), (e) => erro && erro(erroDb(e))),
      collection: (sub) => colRef(caminho + '/' + sub),
    };
  }
  function colRef(caminho, lim) {
    const fs = fb.m.fs; const c = fs.collection(fb.fs, 'livros', LIVRO, ...partes(caminho));
    const q = lim ? fs.query(c, fs.limit(lim)) : c;
    const embrulhar = (qs) => ({ docs: qs.docs.map(snapDoc), size: qs.size, empty: qs.empty, docChanges: () => qs.docChanges(), metadata: qs.metadata });
    const ref = {
      path: caminho,
      limit: (n) => colRef(caminho, n),
      where: () => ref, orderBy: () => ref,
      doc: (id) => docRef(caminho + '/' + (id || fs.doc(c).id)),
      add: async (d) => { const novo = docRef(caminho + '/' + fs.doc(c).id); await novo.set(d); return novo; },
      get: () => fs.getDocs(q).then(embrulhar, (e) => { throw erroDb(e); }),
      onSnapshot: (prox, erro) => fs.onSnapshot(q, (qs) => prox(embrulhar(qs)), (e) => erro && erro(erroDb(e))),
    };
    return ref;
  }
  const db = Object.freeze({ doc: (c) => docRef(c), collection: (c) => colRef(c) });
  const user = Object.freeze({
    can: async (nome) => (nome === 'data.write' ? true : null),
    isOwner: async () => true,
    canEdit: async () => true,
    id: async () => (usuario ? usuario.uid : null),
    me: async () => ({ id: usuario ? usuario.uid : null, name: (usuario && usuario.displayName) || '', email: usuario ? usuario.email : null, avatarUrl: (usuario && usuario.photoURL) || '', isOwner: true, canEdit: true }),
  });
  const downloads = Object.freeze({
    save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([data], { type: /\.json$/i.test(filename) ? 'application/json' : /\.csv$/i.test(filename) ? 'text/csv;charset=utf-8' : 'application/octet-stream' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = filename; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return { status: 'saved' };
    },
  });

  /* ------------------------------------------------------------ fluxo de entrada */

  async function verificar() {
    try { await fb.m.fs.getDoc(fb.m.fs.doc(fb.fs, 'livros', LIVRO, 'config', 'app')); return 'ok'; }
    catch (e) { const c = codigo(e); return c === 'permission_denied' ? 'negado' : c === 'unavailable' ? 'offline' : 'erro:' + ((e && e.message) || c); }
  }
  async function preparar() {
    const cfg = config();
    if (!cfg) { telaConfig(false); return new Promise(() => {}); }
    let m;
    try { m = { app: await import(BASE_SDK + 'firebase-app.js'), auth: await import(BASE_SDK + 'firebase-auth.js'), fs: await import(BASE_SDK + 'firebase-firestore.js') }; }
    catch (e) { telaErro('Não foi possível carregar o Firebase', 'Verifique a internet. Na primeira abertura neste aparelho o app precisa estar on-line.'); return new Promise(() => {}); }
    const app = m.app.initializeApp(cfg);
    const auth = m.auth.getAuth(app);
    let fs;
    try { fs = m.fs.initializeFirestore(app, { localCache: m.fs.persistentLocalCache({ tabManager: m.fs.persistentMultipleTabManager() }) }); }
    catch (e) { fs = m.fs.getFirestore(app); }
    fb = { m, app, auth, fs, cfg };
    m.auth.getRedirectResult(auth).catch((e) => telaLogin(erroTexto(e)));
    await new Promise((ok) => {
      let antes = null;
      m.auth.onAuthStateChanged(auth, (u) => {
        if (antes && !u) { location.reload(); return; }
        usuario = u; antes = u;
        if (u) ok(); else telaLogin();
      });
    });
    for (;;) {
      const r = await verificar();
      if (r === 'ok' || r === 'offline') break;
      if (r === 'negado') { telaRegras(false); await new Promise((ok) => window.addEventListener('lcc:verificar', ok, { once: true })); continue; }
      telaErro('Não foi possível abrir o banco', r.replace(/^erro:/, ''));
      return new Promise(() => {});
    }
    fecharPorta();
    return { db, user };
  }
  function pronto() { if (!promessa) promessa = preparar(); return promessa; }

  async function sair() { try { if (fb) await fb.m.auth.signOut(fb.auth); } finally { location.reload(); } }

  window.Backend = {
    use: async (nome) => {
      if (nome === 'downloads') return downloads;
      if (nome === 'db') return (await pronto()).db;
      if (nome === 'user') return (await pronto()).user;
      return null;
    },
    sair,
    mostrarRegras: () => { if (usuario) telaRegras(true); },
    trocarConfig: () => telaConfig(true),
    info: () => ({ email: usuario ? usuario.email : null, projeto: fb ? fb.cfg.projectId : (config() || {}).projectId || null, origem: origemConfig(), livro: LIVRO }),
    regras,
    lerConfig,
  };
})();
