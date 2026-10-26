/*
 * Livro-Caixa do Casal — aplicativo (painel, lançamentos, planilha, metas e ajustes).
 * Os dados chegam por window.Backend.use('db' | 'user' | 'downloads'), implementado em js/nuvem.js (Firebase).
 * Competência mensal: cada lançamento guarda valores por mês (v['AAAA-MM']) e a situação do mês (st: pago | espera).
 */
(() => {
'use strict';

/* ================= utilidades ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const r2 = (n) => Math.round((+n || 0) * 100) / 100;
const r4 = (n) => Math.round((+n || 0) * 10000) / 10000;
const clone = (o) => JSON.parse(JSON.stringify(o));
const clampInt = (v, a, b, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MINUS = '−';
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DEC = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CMP = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
function money(n, sinal) { const v = r2(n); const s = BRL.format(Math.abs(v)); return v < 0 ? MINUS + s : (sinal && v > 0 ? '+' + s : s); }
function dec(n) { const v = r2(n); const s = DEC.format(Math.abs(v)); return v < 0 ? MINUS + s : s; }
function compact(n) { const a = Math.abs(n); const s = a < 1000 ? String(Math.round(a)) : CMP.format(a); return (n < 0 && Math.round(a) !== 0 ? MINUS : '') + s; }
function pct(x, d = 0) { if (!Number.isFinite(x)) return '—'; return (x * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'; }
const store = {
  get(k, d) { try { const v = localStorage.getItem('lcc:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lcc:' + k, JSON.stringify(v)); } catch { /* sem armazenamento local */ } },
};

/* meses (competência) */
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_L = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mk = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const mParse = (k) => { const [y, m] = String(k).split('-').map(Number); return { y, m }; };
const mValid = (k) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(k));
const mAdd = (k, n) => { const { y, m } = mParse(k); const t = y * 12 + (m - 1) + n; return mk(Math.floor(t / 12), (t % 12) + 1); };
const mDiff = (a, b) => { const A = mParse(a), B = mParse(b); return (B.y * 12 + B.m) - (A.y * 12 + A.m); };
const mShort = (k) => { const { y, m } = mParse(k); return `${MES[m - 1]}/${String(y).slice(2)}`; };
const mLong = (k) => { const { y, m } = mParse(k); return `${MES_L[m - 1]} de ${y}`; };
const mNow = () => { const d = new Date(); return mk(d.getFullYear(), d.getMonth() + 1); };
const mRange = (a, b) => { const o = []; if (mDiff(a, b) < 0) return o; for (let k = a; mDiff(k, b) >= 0; k = mAdd(k, 1)) o.push(k); return o; };
const isFut = (m) => mDiff(mNow(), m) > 0;
const isPast = (m) => mDiff(m, mNow()) > 0;
const mMin = (a, b) => (mDiff(a, b) < 0 ? b : a);
const mMax = (a, b) => (mDiff(a, b) > 0 ? b : a);

/* valor digitado: aceita 1.234,56 · 1234.56 · contas como 197/2 ou 283,75/2 */
function numTok(t) {
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'));
  const dots = (t.match(/\./g) || []).length;
  if (dots > 1) return Number(t.replace(/\./g, ''));
  if (dots === 1 && /\.\d{3}$/.test(t)) return Number(t.replace('.', ''));
  return Number(t);
}
function parseValor(input) {
  const s = String(input ?? '').replace(/R\$|\s/g, '').replace(/[x×]/gi, '*').replace(/÷/g, '/').replace(/−/g, '-');
  if (!s) return NaN;
  const toks = s.match(/\d[\d.,]*|[-+*/()]/g);
  if (!toks || toks.join('') !== s) return NaN;
  let i = 0;
  const expr = () => { let v = term(); while (toks[i] === '+' || toks[i] === '-') { const op = toks[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
  const term = () => { let v = fator(); while (toks[i] === '*' || toks[i] === '/') { const op = toks[i++]; const r = fator(); v = op === '*' ? v * r : v / r; } return v; };
  const fator = () => {
    const t = toks[i++];
    if (t === '-') return -fator();
    if (t === '+') return fator();
    if (t === '(') { const v = expr(); if (toks[i++] !== ')') throw new Error('par'); return v; }
    if (t && /\d/.test(t[0])) { const n = numTok(t); if (!Number.isFinite(n)) throw new Error('num'); return n; }
    throw new Error('tok');
  };
  try { const v = expr(); return i === toks.length && Number.isFinite(v) ? r4(v) : NaN; } catch { return NaN; }
}

/* ícones */
const IC = {
  painel: '<rect x="3.5" y="3.5" width="7" height="9" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.5"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.5"/><rect x="3.5" y="15.5" width="7" height="5" rx="1.5"/>',
  lanc: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" stroke-width="2.6"/>',
  plan: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15"/>',
  metas: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  ajustes: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.2 4L19 7"/>',
  esq: '<path d="M14.5 6l-6 6 6 6"/>',
  dir: '<path d="M9.5 6l6 6-6 6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  seta: '<path d="M5 12h13M13 7l5 5-5 5"/>',
  alerta: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  baixar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  subir: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  lixo: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;
const MARK = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="var(--ink)"/><path d="M7 11.5h18M7 16.5h18M7 21.5h18" stroke="var(--on-ink)" stroke-opacity=".55" stroke-width="1.4"/><path d="M11.5 6v20M13.8 6v20" stroke="var(--margin)" stroke-width="1.4"/></svg>';

/* ================= configuração ================= */
const CATS_PADRAO = [
  { id: 'moradia', nome: 'Moradia', tipo: 'N' },
  { id: 'contas', nome: 'Contas da casa', tipo: 'N' },
  { id: 'mercado', nome: 'Mercado', tipo: 'N' },
  { id: 'transporte', nome: 'Transporte', tipo: 'N' },
  { id: 'seguros', nome: 'Seguros', tipo: 'N' },
  { id: 'saude', nome: 'Saúde', tipo: 'N' },
  { id: 'educacao', nome: 'Educação', tipo: 'N' },
  { id: 'pet', nome: 'Pet', tipo: 'N' },
  { id: 'dividas', nome: 'Empréstimos e financiamentos', tipo: 'N' },
  { id: 'casa', nome: 'Casa e eletro', tipo: 'D' },
  { id: 'vestuario', nome: 'Vestuário', tipo: 'D' },
  { id: 'beleza', nome: 'Beleza e estética', tipo: 'D' },
  { id: 'lazer', nome: 'Viagem e lazer', tipo: 'D' },
  { id: 'eletronicos', nome: 'Eletrônicos', tipo: 'D' },
  { id: 'compras', nome: 'Compras diversas', tipo: 'D' },
  { id: 'investimentos', nome: 'Reserva e investimentos', tipo: 'F' },
  { id: 'outros', nome: 'A classificar', tipo: 'X' },
  { id: 'salario', nome: 'Salário', tipo: 'R' },
  { id: 'decimo', nome: '13º salário', tipo: 'R' },
  { id: 'ferias', nome: 'Férias', tipo: 'R' },
  { id: 'bonus', nome: 'Bônus, PLR e APL', tipo: 'R' },
  { id: 'assiduidade', nome: 'Assiduidade', tipo: 'R' },
  { id: 'extra', nome: 'Renda extra (aulas, consultoria, livros)', tipo: 'R' },
  { id: 'outras', nome: 'Outras receitas', tipo: 'R' },
];
const CLASSE = { N: 'Necessidade', D: 'Desejo', F: 'Futuro', X: 'A classificar', R: 'Receita' };
const FORMAS = [['cartao', 'Cartão de crédito'], ['pix', 'Pix'], ['boleto', 'Boleto'], ['debito', 'Débito automático'], ['dinheiro', 'Dinheiro'], ['outro', 'Não informado']];
const CFG_PADRAO = {
  versao: 1, inicio: null,
  pessoas: { p1: { nome: 'Pessoa 1' }, p2: { nome: 'Pessoa 2' } },
  cartoes: [], categorias: null,
  saldoInicial: { p1: 0, p2: 0 },
  regras: { limiteParcelas: 30, mesesReserva: 6, necessidades: 50, desejos: 30, futuro: 20 },
  acertos: {},
  calcAssid: { base: 0, jornada: 220, site: 1, dias: 0, act: 10, desconto: 26, pessoa: 'p2' },
};
function normCfg(d) {
  d = d || {};
  return {
    ...CFG_PADRAO, ...d,
    pessoas: { p1: { ...CFG_PADRAO.pessoas.p1, ...(d.pessoas?.p1 || {}) }, p2: { ...CFG_PADRAO.pessoas.p2, ...(d.pessoas?.p2 || {}) } },
    regras: { ...CFG_PADRAO.regras, ...(d.regras || {}) },
    saldoInicial: { ...CFG_PADRAO.saldoInicial, ...(d.saldoInicial || {}) },
    calcAssid: { ...CFG_PADRAO.calcAssid, ...(d.calcAssid || {}) },
    cartoes: Array.isArray(d.cartoes) ? d.cartoes.filter((c) => c && c.id) : [],
    categorias: Array.isArray(d.categorias) && d.categorias.length ? d.categorias : CATS_PADRAO,
    acertos: d.acertos || {},
  };
}
const CFG0 = normCfg({});

/* ================= estado ================= */
const S = {
  cfg: null, cfgDoc: false,
  series: new Map(), metas: new Map(), aportes: new Map(),
  loaded: { cfg: false, series: false, metas: false, aportes: false },
  db: null, user: null, downloads: null,
  conn: 'carregando', canWrite: true, writeKnown: null,
  view: 'painel', sub: { lanc: 'lista', plan: 'grade', metas: 'metas' },
  month: mNow(), pessoa: 'casal', eu: null,
  filtro: 'todos', busca: '', tabelas: {}, sheet: null, opener: null,
};
const cfg = () => S.cfg || CFG0;
const nomeP = (p) => (p === 'casal' ? 'Casal' : (cfg().pessoas?.[p]?.nome || (p === 'p1' ? 'Pessoa 1' : 'Pessoa 2')));
const outraP = (p) => (p === 'p1' ? 'p2' : 'p1');
const catDe = (id) => cfg().categorias.find((c) => c.id === id) || (id === 'transf' ? { id, nome: 'Transferência', tipo: 'T' } : { id, nome: 'A classificar', tipo: 'X' });
const cartaoDe = (id) => cfg().cartoes.find((c) => c.id === id) || null;
const corCartao = (c) => `k${c && c.cor >= 1 && c.cor <= 5 ? c.cor : 0}`;

/* ================= regras de cálculo ================= */
function share(s, p) {
  if (s.tipo === 'transf') return 0;
  if (p === 'casal') return 1;
  if (s.pessoa === 'casal') { const d = (Number.isFinite(+s.div) ? +s.div : 50) / 100; return p === 'p1' ? d : 1 - d; }
  return s.pessoa === p ? 1 : 0;
}
function val(s, m) { const v = s.v ? s.v[m] : null; return typeof v === 'number' && Number.isFinite(v) ? v : 0; }
function status(s, m) { const x = s.st ? s.st[m] : null; return x === 'pago' || x === 'espera' ? x : 'prev'; }
function parcLabel(s, m) {
  if (!s.parc || !s.parc.ini) return '';
  const n = (+s.parc.n || 1) + mDiff(s.parc.ini, m);
  return n >= 1 ? `${n}/${s.parc.de}` : '';
}
function mesesDe(s) { return Object.keys(s.v || {}).filter((k) => mValid(k) && val(s, k)).sort(); }
function pagadorDe(s) {
  if (s.forma === 'cartao' && s.cartao) { const c = cartaoDe(s.cartao); if (c && (c.titular === 'p1' || c.titular === 'p2')) return c.titular; }
  if (s.pagador === 'p1' || s.pagador === 'p2') return s.pagador;
  if (s.pessoa === 'p1' || s.pessoa === 'p2') return s.pessoa;
  return null;
}
const porOrdem = (a, b) => ((a.ord ?? 0) - (b.ord ?? 0)) || String(a.desc).localeCompare(String(b.desc), 'pt-BR');

function totals(m, p) {
  const t = { rec: 0, desp: 0, cartao: 0, parcelas: 0, tin: 0, tout: 0, espera: 0, nEspera: 0, pago: 0, aPagar: 0, nPago: 0, nTotal: 0, recebido: 0,
    cls: { N: 0, D: 0, F: 0, X: 0 }, porCat: {}, porCartao: {}, porP: { p1: 0, p2: 0 }, recP: { p1: 0, p2: 0 } };
  for (const s of S.series.values()) {
    const v = val(s, m); if (!v) continue;
    const st = status(s, m);
    if (s.tipo === 'transf') {
      if (p === 'casal' || st === 'espera') continue;
      if (s.de === p) t.tout += v; else if (s.para === p) t.tin += v;
      continue;
    }
    const f = share(s, p); if (!f) continue;
    const x = v * f;
    if (st === 'espera') { if (s.tipo === 'despesa') { t.espera += x; t.nEspera++; } continue; }
    if (s.tipo === 'receita') {
      t.rec += x; if (st === 'pago') t.recebido += x;
      t.recP.p1 += v * share(s, 'p1'); t.recP.p2 += v * share(s, 'p2');
      continue;
    }
    if (s.tipo !== 'despesa') continue;
    t.desp += x; t.nTotal++;
    if (st === 'pago') { t.pago += x; t.nPago++; } else t.aPagar += x;
    if (s.forma === 'cartao') { const k = cartaoDe(s.cartao) ? s.cartao : '_'; t.cartao += x; t.porCartao[k] = (t.porCartao[k] || 0) + x; }
    if (s.parc) t.parcelas += x;
    const c = catDe(s.cat); const cl = t.cls[c.tipo] !== undefined ? c.tipo : 'X';
    t.cls[cl] += x;
    t.porCat[c.id] = (t.porCat[c.id] || 0) + x;
    t.porP.p1 += v * share(s, 'p1'); t.porP.p2 += v * share(s, 'p2');
  }
  t.sobra = t.rec + t.tin - t.desp - t.tout;
  return t;
}
function horizonte() {
  let a = mValid(cfg().inicio) ? cfg().inicio : null, b = null;
  for (const s of S.series.values()) for (const k of mesesDe(s)) { if (!a || mDiff(k, a) > 0) a = k; if (!b || mDiff(b, k) > 0) b = k; }
  if (!a) a = mNow();
  if (!b || mDiff(a, b) < 11) b = mAdd(a, 11);
  return mRange(a, b);
}
function janela() {
  const h = horizonte();
  if (h.length <= 24) return h;
  let i = h.indexOf(S.month); if (i < 0) i = 0;
  const ini = Math.max(0, Math.min(i - 6, h.length - 24));
  return h.slice(ini, ini + 24);
}
function saldoInicial(p) { const si = cfg().saldoInicial || {}; return p === 'casal' ? (+si.p1 || 0) + (+si.p2 || 0) : (+si[p] || 0); }
function projecao(p) {
  let saldo = saldoInicial(p);
  return horizonte().map((m) => { const t = totals(m, p); saldo += t.sobra; return { m, t, saldo }; });
}
function acerto(m) {
  const deve = { p1: 0, p2: 0 }; const itens = [];
  for (const s of S.series.values()) {
    if (s.tipo !== 'despesa') continue;
    const v = val(s, m); if (!v || status(s, m) === 'espera') continue;
    const pag = pagadorDe(s); if (!pag) continue;
    const outro = outraP(pag); const parte = v * share(s, outro);
    if (parte > 0.004) { deve[outro] += parte; itens.push({ s, parte, deve: outro, para: pag }); }
  }
  const transf = [];
  for (const s of S.series.values()) if (s.tipo === 'transf' && val(s, m) && status(s, m) !== 'espera') transf.push({ s, v: val(s, m) });
  const liq = deve.p2 - deve.p1;
  return { deve, liq, itens, transf, feito: !!cfg().acertos?.[m] };
}
function faturas(m, p) {
  const lista = cfg().cartoes.map((c) => ({ c, itens: [], total: 0, pago: 0, porP: { p1: 0, p2: 0 } }));
  const fora = { c: { id: '_', nome: 'Cartão não cadastrado', titular: null, cor: 0 }, itens: [], total: 0, pago: 0, porP: { p1: 0, p2: 0 } };
  for (const s of [...S.series.values()].sort(porOrdem)) {
    if (s.tipo !== 'despesa' || s.forma !== 'cartao') continue;
    const v = val(s, m); if (!v) continue;
    const st = status(s, m); const f = share(s, p); if (!f) continue;
    const alvo = lista.find((x) => x.c.id === s.cartao) || fora;
    alvo.itens.push({ s, v: v * f, vTotal: v, st, f });
    if (st === 'espera') continue;
    alvo.total += v * f; if (st === 'pago') alvo.pago += v * f;
    alvo.porP.p1 += v * share(s, 'p1') * (p === 'casal' ? 1 : (p === 'p1' ? 1 : 0));
    alvo.porP.p2 += v * share(s, 'p2') * (p === 'casal' ? 1 : (p === 'p2' ? 1 : 0));
  }
  return (fora.itens.length ? [...lista, fora] : lista).filter((x) => x.itens.length || cfg().cartoes.length <= 6);
}
function parcelamentos(p, mRef) {
  const out = [];
  for (const s of S.series.values()) {
    if (s.tipo !== 'despesa' || !s.parc) continue;
    const f = share(s, p); if (!f) continue;
    const ms = mesesDe(s).filter((k) => status(s, k) !== 'espera'); if (!ms.length) continue;
    const fim = ms[ms.length - 1]; if (mDiff(mRef, fim) < 0) continue;
    const rest = ms.filter((k) => mDiff(mRef, k) >= 0);
    out.push({ s, fim, nRest: rest.length, restante: rest.reduce((a, k) => a + val(s, k) * f, 0), parcela: val(s, rest[0]) * f, label: parcLabel(s, rest[0]), prox: rest[0] });
  }
  return out.sort((a, b) => mDiff(b.fim, a.fim) || b.parcela - a.parcela);
}
function liberacoes(p, mRef, nMeses) {
  const grupos = new Map();
  for (const s of S.series.values()) {
    if (s.tipo !== 'despesa') continue;
    const f = share(s, p); if (!f) continue;
    const ms = mesesDe(s).filter((k) => status(s, k) !== 'espera'); if (!ms.length) continue;
    const fim = ms[ms.length - 1]; const d = mDiff(mRef, fim);
    if (d < 0 || d >= nMeses) continue;
    const g = grupos.get(fim) || { fim, itens: [], total: 0 };
    g.itens.push(s); g.total += val(s, fim) * f; grupos.set(fim, g);
  }
  return [...grupos.values()].sort((a, b) => mDiff(b.fim, a.fim));
}
function reservaAlvo(meses) {
  const ms = mRange(mNow(), mAdd(mNow(), 11));
  const media = ms.reduce((a, k) => { const t = totals(k, 'casal'); return a + t.cls.N + t.cls.X; }, 0) / ms.length;
  return { alvo: media * (meses || cfg().regras.mesesReserva || 6), media };
}
function guardado(meta) { let g = +meta.inicial || 0; for (const a of S.aportes.values()) if (a.meta === meta.id) g += +a.v || 0; return g; }
function nomesUnicos(itens, max = 4) {
  const c = new Map(); for (const s of itens) c.set(s.desc, (c.get(s.desc) || 0) + 1);
  const n = [...c.entries()].map(([d, k]) => esc(d) + (k > 1 ? ` (${k})` : ''));
  return n.slice(0, max).join(', ') + (n.length > max ? ` e mais ${n.length - max}` : '');
}
function insights(p, m) {
  const out = []; const R = cfg().regras; const proj = projecao(p); const t = totals(m, p);
  const futuros = proj.filter((x) => mDiff(m, x.m) >= 0);
  const neg = futuros.filter((x) => x.t.sobra < -0.5);
  if (neg.length) out.push({ n: 'crit', t: `<span class="lv">${neg.length} ${neg.length > 1 ? 'meses' : 'mês'} no vermelho</span> a partir de ${mShort(m)}: ${neg.slice(0, 4).map((x) => `${mShort(x.m)} (${money(x.t.sobra)})`).join(', ')}${neg.length > 4 ? '…' : ''}.` });
  const sNeg = futuros.find((x) => x.saldo < -0.5);
  if (sNeg) out.push({ n: 'crit', t: `<span class="lv">Saldo acumulado negativo</span> em ${mShort(sNeg.m)} (${money(sNeg.saldo)}). Informe o saldo em conta em Ajustes ou reduza gastos antes desse mês.` });
  if (t.rec > 0 && t.parcelas / t.rec > R.limiteParcelas / 100) {
    const abaixo = futuros.find((x) => mDiff(m, x.m) > 0 && x.t.rec > 0 && x.t.parcelas / x.t.rec <= R.limiteParcelas / 100);
    out.push({ n: 'warn', t: `<span class="lv">Parcelas levam ${pct(t.parcelas / t.rec)} da renda</span> em ${mShort(m)} (referência: até ${R.limiteParcelas}%).${abaixo ? ` Fica abaixo do limite a partir de ${mShort(abaixo.m)}.` : ''}` });
  }
  if (t.cls.X > 0.5) out.push({ n: 'warn', t: `<span class="lv">${money(t.cls.X)} em itens “A classificar”</span> neste mês. Classifique para a regra 50/30/20 ficar precisa.` });
  const lib = liberacoes(p, m, 6).sort((a, b) => b.total - a.total)[0];
  if (lib && lib.total > 50) out.push({ n: 'good', t: `<span class="lv">A partir de ${mShort(mAdd(lib.fim, 1))}, ${money(lib.total)} a menos por mês</span> com o fim de ${nomesUnicos(lib.itens)}.` });
  const melhor = futuros.reduce((a, x) => (!a || x.t.sobra > a.t.sobra ? x : a), null);
  if (melhor && melhor.t.sobra > 0 && futuros.length > 1) out.push({ n: 'good', t: `<span class="lv">${mShort(melhor.m)} tem a maior sobra</span> (${money(melhor.t.sobra)}): bom mês para reforçar a reserva.` });
  if (t.espera > 0) out.push({ n: 'info', t: `<span class="lv">${money(t.espera)} em espera</span> neste mês (${t.nEspera} ${t.nEspera > 1 ? 'itens' : 'item'}), fora das contas até você decidir.` });
  return out.slice(0, 6);
}

/* ================= banco de dados ================= */
const filas = new Map();
function naFila(chave, fn) {
  const ant = filas.get(chave) || Promise.resolve();
  const p = ant.catch(() => {}).then(fn);
  filas.set(chave, p);
  p.then(() => {}, () => {}).then(() => { if (filas.get(chave) === p) filas.delete(chave); });
  return p;
}
function limpo(o) {
  const d = clone(o); delete d.id;
  for (const k of ['v', 'st']) if (d[k]) for (const m of Object.keys(d[k])) if (d[k][m] == null) delete d[k][m];
  for (const k of Object.keys(d)) if (d[k] === undefined) delete d[k];
  return d;
}
function erroGravacao(e) {
  const c = e && e.code;
  if (c === 'permission_denied' || (c === 'invalid_argument' && S.writeKnown !== true)) { S.canWrite = false; render(); toast('O Firebase recusou a gravação. Confira se o seu e-mail está nas regras (Ajustes › Conta).'); return; }
  if (c === 'revoked') { S.canWrite = false; S.conn = 'revoked'; render(); return; }
  if (c === 'quota_exceeded') { toast('O espaço do app acabou. Exclua lançamentos antigos para continuar.'); return; }
  if (c === 'resource_exhausted') { toast('Muitas alterações seguidas. Espere alguns segundos.'); return; }
  toast('Não foi possível salvar. Tente de novo.');
}
addEventListener('lcc:erro-gravacao', (ev) => erroGravacao(ev.detail));
function gravar(chave, fn) {
  if (!S.db) { toast('Sem conexão com os dados do app.'); return Promise.reject(new Error('sem-db')); }
  if (!S.canWrite) { toast('Modo leitura: você não pode editar.'); return Promise.reject(new Error('leitura')); }
  return naFila(chave, async () => {
    for (let i = 0; ; i++) {
      try { return await fn(); }
      catch (e) {
        const c = e && e.code;
        if ((c === 'unavailable' || c === 'resource_exhausted') && i < 4) { await sleep(500 * 2 ** i + Math.random() * 300); continue; }
        erroGravacao(e); throw e;
      }
    }
  });
}
const dbSet = (col, id, data) => gravar(`${col}/${id}`, () => S.db.collection(col).doc(id).set(limpo(data)));
const dbUpd = (col, id, data) => gravar(`${col}/${id}`, () => S.db.collection(col).doc(id).update(data));
const dbDel = (col, id) => gravar(`${col}/${id}`, () => S.db.collection(col).doc(id).delete());
function saveCfg(patch) {
  if (S.cfgDoc) return dbUpd('config', 'app', patch);
  const base = clone(S.cfg || CFG0);
  if (base.categorias === CATS_PADRAO || JSON.stringify(base.categorias) === JSON.stringify(CATS_PADRAO)) base.categorias = null;
  const merged = mergeDeep(base, patch);
  if (!mValid(merged.inicio)) merged.inicio = mNow();
  return dbSet('config', 'app', merged);
}
function mergeDeep(a, b) {
  const o = { ...a };
  for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? mergeDeep(a[k], v) : v;
  return o;
}

async function conectar() {
  const cl = window.Backend;
  if (!cl || typeof cl.use !== 'function') { S.conn = 'offline'; render(); return; }
  const safe = (n) => Promise.resolve().then(() => cl.use(n)).catch(() => null);
  const [db, user, downloads] = await Promise.all([safe('db'), safe('user'), safe('downloads')]);
  S.user = user; S.downloads = downloads;
  if (!db) { S.conn = 'offline'; render(); return; }
  S.db = db;
  if (user) { try { const w = await user.can('data.write'); S.writeKnown = w; if (w === false) S.canWrite = false; S.conta = await user.me(); } catch { /* sem informação */ } }
  assinar();
}
function assinar() {
  const erro = (e) => {
    console.warn('db', e && e.code, e && e.message);
    if (e && e.code === 'revoked') { S.conn = 'revoked'; S.canWrite = false; }
    else if (e && e.code === 'permission_denied') S.conn = 'semacesso';
    else if (!(S.loaded.cfg && S.loaded.series)) S.conn = 'erro';
    render();
  };
  const pronto = () => {
    if (S.loaded.cfg && S.loaded.series && S.conn !== 'revoked' && S.conn !== 'semacesso') S.conn = 'ok';
    agendar();
    if (S.abrirNovo && S.conn === 'ok' && S.canWrite) { S.abrirNovo = false; setTimeout(() => abrirNovo(), 50); }
  };
  try {
    S.db.doc('config/app').onSnapshot((snap) => { S.cfgDoc = !!snap.exists; S.cfg = snap.exists ? normCfg(snap.data()) : null; S.loaded.cfg = true; pronto(); }, erro);
    S.db.collection('series').limit(1000).onSnapshot((qs) => { const m = new Map(); for (const d of qs.docs) if (d.exists) m.set(d.id, { ...d.data(), id: d.id }); S.series = m; S.loaded.series = true; pronto(); }, erro);
    S.db.collection('metas').limit(200).onSnapshot((qs) => { const m = new Map(); for (const d of qs.docs) if (d.exists) m.set(d.id, { ...d.data(), id: d.id }); S.metas = m; S.loaded.metas = true; agendar(); }, erro);
    S.db.collection('aportes').limit(1000).onSnapshot((qs) => { const m = new Map(); for (const d of qs.docs) if (d.exists) m.set(d.id, { ...d.data(), id: d.id }); S.aportes = m; S.loaded.aportes = true; agendar(); }, erro);
  } catch (e) { erro(e); }
}

/* ================= renderização ================= */
let pend = false, adiada = false;
function agendar() {
  if (pend) return; pend = true;
  requestAnimationFrame(() => {
    pend = false;
    const a = document.activeElement;
    if (a && $('#view').contains(a) && a.matches('input, select, textarea')) { adiada = true; return; }
    render();
  });
}
document.addEventListener('focusout', () => { if (adiada) { adiada = false; setTimeout(agendar, 0); } });

const NAV = [
  { v: 'painel', t: 'Painel', i: 'painel' }, { v: 'lanc', t: 'Lançamentos', i: 'lanc' }, { v: 'plan', t: 'Planilha', i: 'plan' },
  { v: 'metas', t: 'Metas', i: 'metas' }, { v: 'ajustes', t: 'Ajustes', i: 'ajustes' },
];
function render() {
  esconderTip();
  renderChrome();
  const v = $('#view');
  for (const k of Object.keys(CH)) delete CH[k];
  v.innerHTML = (VIEWS[S.view] || VIEWS.painel)();
  desenharGraficos();
  if (S.view === 'metas' && S.sub.metas === 'simular') simAtualizar();
  if (S.view === 'ajustes') calcAtualizar();
}
function renderChrome() {
  $('#app').dataset.pv = S.pessoa;
  const nav = (cls) => NAV.map((n) => `<button type="button" class="${cls}" data-act="nav" data-v="${n.v}"${S.view === n.v ? ' aria-current="page"' : ''}>${ic(n.i)}<span>${n.t}</span></button>`).join('');
  $('#tabbar').innerHTML = nav('tab');
  $('#rail-nav').innerHTML = nav('rl');
  $('#top').innerHTML = topHTML();
  $('#banner').innerHTML = bannerHTML();
  const imp = cfg().importacao;
  $('#rail-foot').innerHTML = S.conn === 'ok' ? `<span class="nuvem${S.semInternet ? ' off' : ''}"><i></i>${S.semInternet ? 'Sem internet' : 'Sincronizado'}</span><span>${S.series.size} lançamentos${imp ? ` · importado de ${esc(imp.arquivo)}` : ''}</span>${S.conta?.email ? `<span>${esc(S.conta.email)}</span>` : ''}` : '';
  $('#fab').hidden = !(S.canWrite && S.conn === 'ok' && ['painel', 'lanc', 'plan'].includes(S.view));
}
function topHTML() {
  const atual = S.month === mNow(); const { y, m } = mParse(S.month);
  const pf = S.loaded.cfg ? `<div class="pf" role="radiogroup" aria-label="Ver as finanças de">${['casal', 'p1', 'p2'].map((p) => `<button type="button" role="radio" aria-checked="${S.pessoa === p}" data-act="pessoa" data-p="${p}" class="pf-b pc-${p}"><i></i>${esc(nomeP(p))}</button>`).join('')}</div>` : '';
  return `<div class="top-in">
    <div class="brand-m">${MARK}<span>Livro-Caixa</span></div>
    <div class="msw" role="group" aria-label="Mês de competência">
      <button type="button" class="ib" data-act="mes" data-d="-1" aria-label="Mês anterior">${ic('esq')}</button>
      <button type="button" class="ml" data-act="mes-pick" aria-label="Mês: ${mLong(S.month)}"><span class="ml-m">${MES_L[m - 1]}</span><span class="ml-y">${y}</span></button>
      <button type="button" class="ib" data-act="mes" data-d="1" aria-label="Próximo mês">${ic('dir')}</button>
      ${atual ? '' : '<button type="button" class="hoje" data-act="mes-hoje">Hoje</button>'}
    </div>
    ${pf}
  </div>`;
}
function bannerHTML() {
  if (S.conn === 'revoked') return `<div class="banner" role="status">${ic('alerta')}<span>O acesso aos dados foi encerrado nesta sessão. Recarregue a página.</span></div>`;
  if (!S.canWrite && S.conn === 'ok') return `<div class="banner" role="status">${ic('info')}<span>Modo leitura: o Firebase recusou a gravação. Confira se o seu e-mail está nas regras do Firestore (Ajustes › Conta).</span></div>`;
  if (S.semInternet && S.conn === 'ok') return `<div class="banner" role="status">${ic('info')}<span>Sem internet: os lançamentos ficam guardados neste aparelho e sobem para a nuvem quando a conexão voltar.</span></div>`;
  return '';
}
function estado(k) {
  const E = {
    carregando: ['Abrindo o livro-caixa…', 'Receitas, parcelas de cartão, contas fixas e metas aparecem aqui assim que os dados chegarem.'],
    offline: ['Sem conexão com o banco de dados', 'Configure o Firebase e entre com a sua conta Google para ver os lançamentos. Se já configurou, verifique a internet e recarregue a página.'],
    erro: ['Não foi possível ler os dados agora', 'Verifique a conexão e recarregue a página.'],
    vazio: ['Nenhum lançamento ainda', 'Comece pelas receitas do mês e pelas parcelas dos cartões. Cada lançamento pode ser de um, do outro ou dos dois.'],
    revoked: ['Acesso encerrado', 'Seu acesso a este app mudou. Recarregue a página.'],
    semacesso: ['Seu e-mail não tem acesso a este livro-caixa', 'As regras do Firestore liberam só os e-mails do casal. Gere as regras com o seu e-mail e publique no console do Firebase.'],
  };
  const [t, d] = E[k] || E.carregando;
  const acoes = k === 'vazio' && S.canWrite ? `<div class="acts"><button type="button" class="btn pri" data-act="novo">${ic('mais')} Novo lançamento</button><button type="button" class="btn" data-act="restaurar">${ic('subir')} Importar backup (.json)</button></div>`
    : k === 'semacesso' ? '<div class="acts"><button type="button" class="btn pri" data-act="regras">Ver regras do Firestore</button><button type="button" class="btn" data-act="sair">Sair e trocar de conta</button></div>' : '';
  return `<section class="card empty"><span class="eyebrow">Livro-Caixa do Casal</span><h2 class="ct">${t}</h2><p class="sub">${d}</p>${acoes}</section>`;
}
function portao(permiteVazio) {
  if (S.conn === 'offline') return estado('offline');
  if (S.conn === 'revoked') return estado('revoked');
  if (S.conn === 'semacesso') return estado('semacesso');
  if (!(S.loaded.cfg && S.loaded.series)) return estado(S.conn === 'erro' ? 'erro' : 'carregando');
  if (S.series.size === 0 && S.writeKnown === false && !S.cfgDoc) return estado('semacesso');
  if (!permiteVazio && S.series.size === 0) return estado('vazio');
  return '';
}
const chip = (n, t) => `<span class="chip st-${n}">${esc(t)}</span>`;
function pchip(p, s) {
  if (p === 'casal') { const d = Number.isFinite(+s?.div) ? +s.div : 50; return `<span class="pc pc-casal"><i></i>Casal${d !== 50 ? ` ${d}/${100 - d}` : ''}</span>`; }
  if (p !== 'p1' && p !== 'p2') return '';
  return `<span class="pc pc-${p}"><i></i>${esc(nomeP(p))}</span>`;
}
const seg = (k, opts) => `<div class="seg" role="group">${opts.map(([v, t]) => `<button type="button" data-act="sub" data-k="${k}" data-v="${v}" aria-pressed="${S.sub[k] === v}">${t}</button>`).join('')}</div>`;
function meter(frac, cor, marcas = []) {
  const w = Math.max(0, Math.min(1, frac)) * 100;
  return `<div class="meter" style="--mc:${cor}"><span style="width:${w.toFixed(1)}%"></span>${marcas.map((x) => `<i class="mk" style="left:${(Math.max(0, Math.min(1, x)) * 100).toFixed(1)}%"></i>`).join('')}</div>`;
}
const STC = { good: 'var(--good)', warn: 'var(--warn)', crit: 'var(--crit)', info: 'var(--ink-2)' };

/* ================= gráficos ================= */
const CH = {};
const f1 = (n) => (Math.round(n * 10) / 10).toString();
function ticks(lo, hi, n = 4) {
  if (hi - lo < 1) hi = lo + 100;
  const raw = (hi - lo) / n; const mag = 10 ** Math.floor(Math.log10(raw)); const q = raw / mag;
  const step = (q <= 1 ? 1 : q <= 2 ? 2 : q <= 2.5 ? 2.5 : q <= 5 ? 5 : 10) * mag;
  const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step;
  const out = []; for (let v = a; v <= b + step / 2; v += step) out.push(Math.round(v / step) * step);
  return out;
}
function barPath(x, y, w, h, fim) {
  const r = Math.min(4, w / 2, h);
  if (fim === 't') return `M${f1(x)},${f1(y + h)}V${f1(y + r)}Q${f1(x)},${f1(y)} ${f1(x + r)},${f1(y)}H${f1(x + w - r)}Q${f1(x + w)},${f1(y)} ${f1(x + w)},${f1(y + r)}V${f1(y + h)}Z`;
  if (fim === 'b') return `M${f1(x)},${f1(y)}H${f1(x + w)}V${f1(y + h - r)}Q${f1(x + w)},${f1(y + h)} ${f1(x + w - r)},${f1(y + h)}H${f1(x + r)}Q${f1(x)},${f1(y + h)} ${f1(x)},${f1(y + h - r)}Z`;
  return `M${f1(x)},${f1(y)}H${f1(x + w)}V${f1(y + h)}H${f1(x)}Z`;
}
function eixoX(data, cx, band, H, B) {
  const passo = band < 30 ? 2 : 1; let s = '';
  const forc = (i) => !!data[i] && (data[i].sel || i === 0 || mParse(data[i].m).m === 1);
  data.forEach((d, i) => {
    const { y, m } = mParse(d.m);
    const mostra = forc(i) || (passo === 1 || (i % 2 === 0 && !forc(i - 1) && !forc(i + 1)));
    if (mostra) s += `<text class="${d.sel ? 'axm' : 'ax'}" x="${f1(cx(i))}" y="${H - B + 15}" text-anchor="middle">${MES[m - 1]}</text>`;
    if (i === 0 || m === 1) s += `<text class="yr" x="${f1(cx(i))}" y="${H - B + 28}" text-anchor="middle">${y}</text>`;
  });
  return s;
}
function escala(minV, maxV, n) {
  if (minV < 0 && maxV > 0 && -minV < 0.12 * maxV) { const tk = ticks(0, maxV, n); return { tk, lo: -Math.max(-minV, 0.05 * tk[tk.length - 1]), hi: tk[tk.length - 1] }; }
  const tk = ticks(minV, maxV, n); return { tk, lo: tk[0], hi: tk[tk.length - 1] };
}
function desenharGraficos() { for (const el of $$('.chart[data-chart]')) desenhar(el); }
function desenhar(el) {
  const sp = CH[el.dataset.chart]; if (!sp) return;
  if (sp.kind === 'cols') drawCols(el, sp); else if (sp.kind === 'stack') drawStack(el, sp); else if (sp.kind === 'area') drawArea(el, sp);
}
function drawCols(el, sp) {
  const W = Math.max(260, Math.round(el.clientWidth || 320)), H = sp.h || 220, L = 44, R = 8, T = 22, B = 32;
  const d = sp.data, n = d.length;
  const vals = d.map((x) => x.v);
  const { tk, lo, hi } = escala(Math.min(0, ...vals), Math.max(0, ...vals), 4);
  const ph = H - T - B; const y = (v) => T + (hi - v) / (hi - lo || 1) * ph;
  const band = (W - L - R) / n, bw = Math.max(4, Math.min(24, band * 0.62)); const cx = (i) => L + band * (i + 0.5);
  let g = '', sel = '', bars = '', lb = '';
  for (const t of tk) if (t >= lo - 1e-6) g += `<line class="g" x1="${L}" x2="${W - R}" y1="${f1(y(t))}" y2="${f1(y(t))}"/><text class="ax" x="${L - 7}" y="${f1(y(t))}" dy="0.32em" text-anchor="end">${esc(compact(t))}</text>`;
  let iMin = -1; d.forEach((x, i) => { if (x.v < 0 && (iMin < 0 || x.v < d[iMin].v)) iMin = i; });
  d.forEach((x, i) => {
    if (x.sel) sel = `<rect class="selband" x="${f1(cx(i) - band / 2)}" y="${T - 18}" width="${f1(band)}" height="${f1(ph + 18)}" rx="6"/>`;
    const y0 = y(0), y1 = y(x.v), h = Math.max(Math.abs(y1 - y0), Math.abs(x.v) > 0.5 ? 2 : 0);
    if (h >= 0.5) bars += `<path class="${x.v < 0 ? 'bar-neg' : 'bar'}${x.fut ? ' fut' : ''}" d="${barPath(cx(i) - bw / 2, x.v < 0 ? y0 : y0 - h, bw, h, x.v < 0 ? 'b' : 't')}"/>`;
    const rot = x.sel || (i === iMin && !d[i - 1]?.sel && !d[i + 1]?.sel && !x.sel);
    if (rot) { const ly = x.v < 0 ? y0 - 6 : y1 - 6; lb += `<text class="lbl" x="${f1(cx(i))}" y="${f1(Math.max(11, ly))}" text-anchor="middle">${esc(compact(x.v))}</text>`; }
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${sel}${g}${bars}<line class="base" x1="${L}" x2="${W - R}" y1="${f1(y(0))}" y2="${f1(y(0))}"/>${lb}${eixoX(d, cx, band, H, B)}<rect class="hov" x="0" y="${T - 18}" width="0" height="${f1(ph + 18)}" rx="6"/></svg>`;
  Object.assign(sp, { W, H, hit: (px) => (px < L - 4 || px > W - R + 4 ? null : Math.max(0, Math.min(n - 1, Math.floor((px - L) / band)))), at: (i) => ({ x: cx(i), y: y(Math.max(0, d[i].v)) }),
    hover: (svg, i) => { const r = svg.querySelector('.hov'); if (i == null) { r.setAttribute('width', 0); return; } r.setAttribute('x', f1(cx(i) - band / 2)); r.setAttribute('width', f1(band)); } });
}
function drawStack(el, sp) {
  const W = Math.max(260, Math.round(el.clientWidth || 320)), H = sp.h || 220, L = 44, R = 8, T = 18, B = 32;
  const d = sp.data, n = d.length, ser = sp.series;
  const tot = d.map((x) => ser.reduce((a, s) => a + (x.vals[s.key] || 0), 0));
  const tk = ticks(0, Math.max(0, ...tot), 4); const hi = tk[tk.length - 1];
  const ph = H - T - B; const y = (v) => T + (hi - v) / (hi || 1) * ph;
  const band = (W - L - R) / n, bw = Math.max(4, Math.min(24, band * 0.62)); const cx = (i) => L + band * (i + 0.5);
  let g = '', bars = '', sel = '', lb = '';
  for (const t of tk) g += `<line class="g" x1="${L}" x2="${W - R}" y1="${f1(y(t))}" y2="${f1(y(t))}"/><text class="ax" x="${L - 7}" y="${f1(y(t))}" dy="0.32em" text-anchor="end">${esc(compact(t))}</text>`;
  d.forEach((x, i) => {
    if (x.sel) sel = `<rect class="selband" x="${f1(cx(i) - band / 2)}" y="${T - 14}" width="${f1(band)}" height="${f1(ph + 14)}" rx="6"/>`;
    let acc = 0; const segs = ser.filter((s) => (x.vals[s.key] || 0) > 0.004);
    segs.forEach((s, j) => {
      const v = x.vals[s.key]; const yTop = y(acc + v), yBot = y(acc); acc += v;
      let h = yBot - yTop; let top = yTop;
      if (j > 0 && h > 3) { h -= 2; }
      if (h < 0.4) return;
      bars += `<path class="${s.cls}${x.fut ? ' fut' : ''}" d="${barPath(cx(i) - bw / 2, top, bw, h, j === segs.length - 1 ? 't' : '')}"/>`;
    });
    if (x.sel && tot[i] > 0) lb = `<text class="lbl" x="${f1(cx(i))}" y="${f1(Math.max(11, y(tot[i]) - 6))}" text-anchor="middle">${esc(compact(tot[i]))}</text>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${sel}${g}${bars}<line class="base" x1="${L}" x2="${W - R}" y1="${f1(y(0))}" y2="${f1(y(0))}"/>${lb}${eixoX(d, cx, band, H, B)}<rect class="hov" x="0" y="${T - 14}" width="0" height="${f1(ph + 14)}" rx="6"/></svg>`;
  Object.assign(sp, { W, H, hit: (px) => (px < L - 4 || px > W - R + 4 ? null : Math.max(0, Math.min(n - 1, Math.floor((px - L) / band)))), at: (i) => ({ x: cx(i), y: y(tot[i]) }),
    hover: (svg, i) => { const r = svg.querySelector('.hov'); if (i == null) { r.setAttribute('width', 0); return; } r.setAttribute('x', f1(cx(i) - band / 2)); r.setAttribute('width', f1(band)); } });
}
function drawArea(el, sp) {
  const W = Math.max(260, Math.round(el.clientWidth || 320)), H = sp.h || 220, L = 48, R = 14, T = 24, B = 32;
  const d = sp.data, n = d.length; const vals = d.map((x) => x.v);
  const refV = sp.ref ? sp.ref.v : null;
  const { tk, lo, hi } = escala(Math.min(0, ...vals), Math.max(0, ...vals, refV ?? 0), 4);
  const ph = H - T - B; const y = (v) => T + (hi - v) / (hi - lo || 1) * ph;
  const step = n > 1 ? (W - L - R) / (n - 1) : 0; const px = (i) => (n > 1 ? L + step * i : (L + W - R) / 2);
  let g = '';
  for (const t of tk) g += `<line class="g" x1="${L}" x2="${W - R}" y1="${f1(y(t))}" y2="${f1(y(t))}"/><text class="ax" x="${L - 7}" y="${f1(y(t))}" dy="0.32em" text-anchor="end">${esc(compact(t))}</text>`;
  const pts = d.map((x, i) => `${f1(px(i))},${f1(y(x.v))}`);
  const base = y(Math.max(lo, Math.min(0, hi)));
  const area = `M${f1(px(0))},${f1(base)}L${pts.join('L')}L${f1(px(n - 1))},${f1(base)}Z`;
  let extra = '';
  const iNow = d.findIndex((x) => x.m === mNow());
  if (iNow >= 0) extra += `<line class="now" x1="${f1(px(iNow))}" x2="${f1(px(iNow))}" y1="${T - 10}" y2="${H - B}"/><text class="lbl-s" x="${f1(px(iNow) + 4)}" y="${T - 12}">hoje</text>`;
  if (refV != null && refV > 0) extra += `<line class="ref" x1="${L}" x2="${W - R}" y1="${f1(y(refV))}" y2="${f1(y(refV))}"/><text class="lbl-s" x="${L + 4}" y="${f1(y(refV) - 6)}">${esc(sp.ref.label)}</text>`;
  const iSel = d.findIndex((x) => x.sel);
  const last = n - 1;
  let dots = `<circle class="dot" cx="${f1(px(last))}" cy="${f1(y(d[last].v))}" r="4.5"/>`;
  let lb = `<text class="lbl" x="${f1(px(last))}" y="${f1(Math.max(11, y(d[last].v) - 10))}" text-anchor="end">${esc(compact(d[last].v))}</text>`;
  if (iSel >= 0 && iSel !== last) { dots += `<circle class="dot" cx="${f1(px(iSel))}" cy="${f1(y(d[iSel].v))}" r="4.5"/>`; if (Math.abs(iSel - last) > 2) lb += `<text class="lbl" x="${f1(px(iSel) + (iSel === 0 ? -2 : 0))}" y="${f1(Math.max(11, y(d[iSel].v) - 10))}" text-anchor="${iSel === 0 ? 'start' : 'middle'}">${esc(compact(d[iSel].v))}</text>`; }
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${g}<line class="base" x1="${L}" x2="${W - R}" y1="${f1(y(Math.max(lo, 0)))}" y2="${f1(y(Math.max(lo, 0)))}"/><path class="area" d="${area}"/><path class="line" d="M${pts.join('L')}"/>${extra}${dots}${lb}${eixoX(d, px, step || 40, H, B)}<line class="xh" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/><circle class="dot hd" r="4.5" cx="0" cy="0" visibility="hidden"/></svg>`;
  Object.assign(sp, { W, H, hit: (x) => (x < L - 10 || x > W - R + 10 ? null : Math.max(0, Math.min(n - 1, Math.round((x - L) / (step || 1))))), at: (i) => ({ x: px(i), y: y(d[i].v) }),
    hover: (svg, i) => {
      const xh = svg.querySelector('.xh'), hd = svg.querySelector('.hd');
      if (i == null) { xh.setAttribute('visibility', 'hidden'); hd.setAttribute('visibility', 'hidden'); return; }
      xh.setAttribute('x1', f1(px(i))); xh.setAttribute('x2', f1(px(i))); xh.setAttribute('visibility', 'visible');
      hd.setAttribute('cx', f1(px(i))); hd.setAttribute('cy', f1(y(d[i].v))); hd.setAttribute('visibility', 'visible');
    } });
}
function sparkSVG(vals) {
  if (vals.length < 2) return '';
  const W = 160, H = 30; const lo = Math.min(...vals, 0), hi = Math.max(...vals, 1);
  const x = (i) => 3 + (W - 8) * i / (vals.length - 1); const y = (v) => 4 + (hi - v) / (hi - lo || 1) * (H - 8);
  const pts = vals.map((v, i) => `${f1(x(i))},${f1(y(v))}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--ent)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><circle cx="${f1(x(vals.length - 1))}" cy="${f1(y(vals[vals.length - 1]))}" r="3" fill="var(--ent)"/></svg>`;
}

/* dica (tooltip) */
let tipAtual = null;
function mostrarTip(el, i, cx, cy) {
  const sp = CH[el.dataset.chart]; if (!sp || i == null || !sp.tip) return;
  const svg = el.querySelector('svg'); if (!svg) return;
  sp.hover(svg, i); tipAtual = { el, i };
  const t = $('#tip'); t.innerHTML = sp.tip(i); t.hidden = false;
  const rect = svg.getBoundingClientRect();
  if (cx == null) { const a = sp.at(i); cx = rect.left + a.x * rect.width / sp.W; cy = rect.top + a.y * rect.height / sp.H; }
  const r = t.getBoundingClientRect();
  let left = cx + 14, top = cy - r.height - 12;
  if (left + r.width > innerWidth - 8) left = cx - r.width - 14;
  if (left < 8) left = 8;
  if (top < 8) top = Math.min(innerHeight - r.height - 8, cy + 16);
  t.style.left = left + 'px'; t.style.top = top + 'px';
}
function esconderTip() {
  const t = $('#tip'); if (t) t.hidden = true;
  if (tipAtual) { const sp = CH[tipAtual.el.dataset.chart]; const svg = tipAtual.el.querySelector('svg'); if (sp && svg && sp.hover) sp.hover(svg, null); tipAtual = null; }
}
function idxDoPonteiro(el, e) {
  const sp = CH[el.dataset.chart]; const svg = el.querySelector('svg'); if (!sp || !svg || !sp.hit) return null;
  const r = svg.getBoundingClientRect(); return sp.hit((e.clientX - r.left) * sp.W / r.width);
}
document.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  const el = e.target.closest && e.target.closest('.chart[data-chart]');
  if (!el) { if (tipAtual) esconderTip(); return; }
  const i = idxDoPonteiro(el, e); if (i == null) { esconderTip(); return; }
  mostrarTip(el, i, e.clientX, e.clientY);
});
document.addEventListener('scroll', () => { if (tipAtual) esconderTip(); }, { passive: true, capture: true });
function tipLinhas(titulo, linhas) {
  return `<div class="tt">${esc(titulo)}</div>${linhas.map((l) => `<div class="tr${l.forte ? ' strong' : ''}"><span class="key" style="--c:${l.cor || 'transparent'}"></span><span class="tl">${esc(l.n)}</span><span class="tv">${esc(l.v)}</span></div>`).join('')}`;
}
function tabelaHTML(cols, rows) {
  return `<div class="tbl-s"><table class="mini"><thead><tr>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td class="amt">${c}</td>` : `<th scope="row">${c}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function cardGrafico({ id, titulo, sub, span2, tabela, legenda = '', extra = '', aria }) {
  const aberto = !!S.tabelas[id];
  return `<section class="card${span2 ? ' span2' : ''}">
    <div class="ch"><div><h2 class="ct">${titulo}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div><button type="button" class="link" data-act="tabela" data-id="${id}" aria-expanded="${aberto}" aria-controls="tbl-${id}">${aberto ? 'Ocultar tabela' : 'Ver tabela'}</button></div>
    ${legenda}<div class="chart" data-chart="${id}" tabindex="0" role="img" aria-label="${esc(aria || titulo)}"></div>${extra}
    <div class="tblv" id="tbl-${id}"${aberto ? '' : ' hidden'}>${tabela}</div>
  </section>`;
}

/* ================= painel ================= */
const VIEWS = {};
VIEWS.painel = () => {
  const g = portao(false); if (g) return g;
  const p = S.pessoa, m = S.month; const t = totals(m, p); const proj = projecao(p);
  return `${perguntaEu()}<div class="dash">${heroHTML(t, m, p)}${kpisHTML(t, proj, m, p)}${cardSobra(proj, m, p)}${cardSaldo(proj, m, p)}${cardFaturasMes(m, p)}${cardCategorias(t, m)}${card503020(t, m)}${cardAcerto(m, false)}${cardInsights(p, m)}${cardAPagar(m, p)}${cardTerminando(m, p)}</div>`;
};
function perguntaEu() {
  if (S.eu || !S.canWrite) return '';
  return `<section class="card" style="margin-bottom:14px"><div class="ch"><div><h2 class="ct">Quem está usando este aparelho?</h2><p class="sub">Só define a pessoa que já vem marcada nos novos lançamentos feitos aqui.</p></div></div><div class="acts"><button type="button" class="btn pc-p1" data-act="eu" data-p="p1"><span class="pc"><i></i></span>${esc(nomeP('p1'))}</button><button type="button" class="btn pc-p2" data-act="eu" data-p="p2"><span class="pc"><i></i></span>${esc(nomeP('p2'))}</button></div></section>`;
}
function heroHTML(t, m, p) {
  const neg = t.sobra < -0.005; const ant = totals(mAdd(m, -1), p); const temAnt = ant.rec || ant.desp;
  const delta = t.sobra - ant.sobra;
  const pagoFr = t.desp > 0 ? t.pago / t.desp : 0;
  let split = '';
  if (p === 'casal' && t.desp > 0) {
    const a = t.porP.p1 / t.desp, b = t.porP.p2 / t.desp;
    split = `<div class="split"><div class="mlbl"><span>Quem responde pelas despesas</span></div><div class="split-bar">${a > 0.001 ? `<span class="pc-p1" style="flex:${a.toFixed(4)}"></span>` : ''}${b > 0.001 ? `<span class="pc-p2" style="flex:${b.toFixed(4)}"></span>` : ''}</div><div class="legend" style="margin:0"><span class="lk"><i class="sw pc-p1"></i>${esc(nomeP('p1'))} ${money(t.porP.p1)} (${pct(a)})</span><span class="lk"><i class="sw pc-p2"></i>${esc(nomeP('p2'))} ${money(t.porP.p2)} (${pct(b)})</span></div></div>`;
  }
  return `<section class="card hero" aria-labelledby="hero-t">
    <div class="hero-top"><span class="eyebrow" id="hero-t">Sobra ${isPast(m) ? 'de' : 'prevista em'} ${mShort(m)} · ${esc(nomeP(p))}</span>${neg ? chip('crit', 'No vermelho') : chip('good', 'No azul')}</div>
    <div class="hero-num${neg ? ' neg' : ''}">${money(t.sobra)}</div>
    ${temAnt ? `<p class="hero-delta">${Math.abs(delta) < 0.005 ? `Igual a ${mShort(mAdd(m, -1))}` : `${money(Math.abs(delta))} ${delta > 0 ? 'a mais' : 'a menos'} que ${mShort(mAdd(m, -1))}`}</p>` : ''}
    <dl class="hero-dl">
      <div><dt>Receitas</dt><dd class="amt">${money(t.rec)}</dd></div>
      <div><dt>Despesas</dt><dd class="amt">${money(t.desp)}</dd></div>
      ${p !== 'casal' && (t.tin || t.tout) ? `<div><dt>Transferências</dt><dd class="amt">${money(t.tin - t.tout, true)}</dd></div>` : ''}
    </dl>
    <div class="split"><div class="mlbl"><span>Contas pagas: ${t.nPago} de ${t.nTotal}</span><span class="amt">${money(t.pago)} de ${money(t.desp)}</span></div>${meter(pagoFr, 'var(--ink-2)')}</div>
    ${split}
  </section>`;
}
function kpisHTML(t, proj, m, p) {
  const R = cfg().regras;
  const pou = t.rec > 0 ? t.sobra / t.rec : NaN;
  const nPou = !Number.isFinite(pou) ? 'info' : pou >= R.futuro / 100 ? 'good' : pou >= R.futuro / 200 ? 'warn' : 'crit';
  const com = t.rec > 0 ? t.parcelas / t.rec : NaN;
  const nCom = !Number.isFinite(com) ? 'info' : com <= R.limiteParcelas / 100 ? 'good' : com <= (R.limiteParcelas + 10) / 100 ? 'warn' : 'crit';
  const fim = proj[proj.length - 1];
  const pend = t.nTotal - t.nPago;
  const txt = { good: 'Dentro da meta', warn: 'Atenção', crit: 'Fora da meta', info: 'Sem receita' };
  return `<section class="kpis" aria-label="Indicadores do mês">
    <article class="card kpi"><span class="eyebrow">Taxa de poupança</span><span class="kv${pou < 0 ? ' neg' : ''}">${pct(pou, 1)}</span>${meter(Number.isFinite(pou) ? Math.max(0, pou) / 0.4 : 0, STC[nPou], [R.futuro / 100 / 0.4])}<span class="ks">Meta: guardar ${R.futuro}% da renda</span>${chip(nPou, txt[nPou])}</article>
    <article class="card kpi"><span class="eyebrow">Parcelas na renda</span><span class="kv">${pct(com, 1)}</span>${meter(Number.isFinite(com) ? com / 0.6 : 0, STC[nCom], [R.limiteParcelas / 100 / 0.6])}<span class="ks">${money(t.parcelas)} em parcelas · referência até ${R.limiteParcelas}%</span>${chip(nCom, nCom === 'good' ? 'Dentro do limite' : txt[nCom])}</article>
    <article class="card kpi"><span class="eyebrow">A pagar no mês</span><span class="kv">${Math.abs(t.aPagar) >= 100000 ? `R$ ${compact(t.aPagar)}` : money(t.aPagar)}</span><span class="ks">${pend} ${pend === 1 ? 'conta pendente' : 'contas pendentes'}${t.espera ? ` · ${money(t.espera)} em espera` : ''}</span></article>
    <article class="card kpi"><span class="eyebrow">Saldo projetado</span><span class="kv${fim && fim.saldo < 0 ? ' neg' : ''}" title="${fim ? money(fim.saldo) : ''}">${fim ? (Math.abs(fim.saldo) >= 100000 ? `R$ ${compact(fim.saldo)}` : money(fim.saldo)) : '—'}</span>${sparkSVG(proj.map((x) => x.saldo))}<span class="ks">em ${fim ? mShort(fim.m) : '—'} · saldo inicial ${money(saldoInicial(p))}</span></article>
  </section>`;
}
function cardSobra(proj, m, p) {
  const vis = janela(); const ps = proj.filter((x) => vis.includes(x.m));
  CH.sobra = { kind: 'cols', pick: true, data: ps.map((x) => ({ m: x.m, v: x.t.sobra, fut: isFut(x.m), sel: x.m === m })),
    tip: (i) => { const x = ps[i]; const l = [{ n: 'Receitas', v: money(x.t.rec) }, { n: 'Despesas', v: money(x.t.desp) }]; if (p !== 'casal' && (x.t.tin || x.t.tout)) l.push({ n: 'Transferências', v: money(x.t.tin - x.t.tout, true) }); l.push({ n: 'Sobra', v: money(x.t.sobra), forte: true, cor: x.t.sobra < 0 ? 'var(--crit)' : 'var(--ent)' }); return tipLinhas(mLong(x.m), l); } };
  const tab = tabelaHTML(['Mês', 'Receitas', 'Despesas', 'Sobra'], ps.map((x) => [mShort(x.m), money(x.t.rec), money(x.t.desp), `<span class="${x.t.sobra < 0 ? 'neg' : ''}">${money(x.t.sobra)}</span>`]));
  const negs = ps.filter((x) => x.t.sobra < 0).length;
  return cardGrafico({ id: 'sobra', titulo: `Sobra mês a mês · ${esc(nomeP(p))}`, sub: 'Receitas menos despesas de cada mês. Toque numa barra para abrir o mês. Barras mais claras são projeção; vermelhas, meses no vermelho.', span2: true, tabela: tab, aria: `Sobra mensal de ${mShort(ps[0].m)} a ${mShort(ps[ps.length - 1].m)}; ${negs} ${negs === 1 ? 'mês negativo' : 'meses negativos'}.` });
}
function cardSaldo(proj, m, p) {
  const vis = janela(); const ps = proj.filter((x) => vis.includes(x.m));
  const res = p === 'casal' ? [...S.metas.values()].find((x) => x.tipo === 'reserva') : null;
  const ref = res ? { v: reservaAlvo(res.meses).alvo, label: `Reserva ideal ${compact(reservaAlvo(res.meses).alvo)}` } : null;
  CH.saldo = { kind: 'area', ref, data: ps.map((x) => ({ m: x.m, v: x.saldo, sel: x.m === m })), tip: (i) => tipLinhas(mLong(ps[i].m), [{ n: 'Sobra do mês', v: money(ps[i].t.sobra) }, { n: 'Saldo acumulado', v: money(ps[i].saldo), forte: true, cor: 'var(--ent)' }]) };
  const tab = tabelaHTML(['Mês', 'Sobra', 'Saldo acumulado'], ps.map((x) => [mShort(x.m), money(x.t.sobra), money(x.saldo)]));
  return cardGrafico({ id: 'saldo', titulo: 'Saldo acumulado projetado', sub: `Saldo inicial de ${money(saldoInicial(p))} mais as sobras de cada mês. Ajuste o saldo inicial em Ajustes.`, tabela: tab, aria: `Saldo acumulado chega a ${money(ps[ps.length - 1].saldo)} em ${mShort(ps[ps.length - 1].m)}.` });
}
function serieCartoes() {
  const cs = cfg().cartoes.map((c) => ({ key: c.id, nome: c.nome, cls: corCartao(c) }));
  return [...cs, { key: '_', nome: 'Cartão não cadastrado', cls: 'k0' }];
}
function cardFaturasMes(m, p, span2) {
  const vis = janela(); const ser = serieCartoes();
  const data = vis.map((k) => { const t = totals(k, p); return { m: k, vals: t.porCartao, fut: isFut(k), sel: k === m }; });
  const usadas = ser.filter((s) => data.some((x) => (x.vals[s.key] || 0) > 0.004));
  if (!usadas.length) return `<section class="card${span2 ? ' span2' : ''}"><h2 class="ct">Faturas de cartão</h2><p class="sub">Nenhuma compra no cartão para ${esc(nomeP(p))} no período.</p></section>`;
  CH.faturas = { kind: 'stack', series: usadas, data, tip: (i) => { const x = data[i]; const l = usadas.filter((s) => x.vals[s.key]).map((s) => ({ n: s.nome, v: money(x.vals[s.key]), cor: `var(--${s.cls})` })); l.push({ n: 'Total', v: money(usadas.reduce((a, s) => a + (x.vals[s.key] || 0), 0)), forte: true }); return tipLinhas(mLong(x.m), l); } };
  const legenda = `<div class="legend">${usadas.map((s) => `<span class="lk"><i class="sw ${s.cls}"></i>${esc(s.nome)}</span>`).join('')}</div>`;
  const tab = tabelaHTML(['Mês', ...usadas.map((s) => s.nome), 'Total'], data.map((x) => [mShort(x.m), ...usadas.map((s) => money(x.vals[s.key] || 0)), money(usadas.reduce((a, s) => a + (x.vals[s.key] || 0), 0))]));
  return cardGrafico({ id: 'faturas', titulo: 'Faturas de cartão por mês', sub: 'Parcelas e compras somadas por cartão. Mostra quando os parcelamentos terminam.', span2, tabela: tab, legenda, aria: 'Faturas de cartão empilhadas por cartão em cada mês.' });
}
function cardCategorias(t, m) {
  const itens = Object.entries(t.porCat).map(([id, v]) => ({ c: catDe(id), v })).filter((x) => x.v > 0.004).sort((a, b) => b.v - a.v);
  if (!itens.length) return `<section class="card"><h2 class="ct">Despesas por categoria</h2><p class="sub">Sem despesas em ${mShort(m)}.</p></section>`;
  const top = itens.slice(0, 8); const resto = itens.slice(8).reduce((a, x) => a + x.v, 0);
  if (resto > 0) top.push({ c: { nome: `Outras ${itens.length - 8} categorias`, tipo: '' }, v: resto });
  const max = top[0].v;
  return `<section class="card"><div class="ch"><div><h2 class="ct">Despesas por categoria</h2><p class="sub">${mLong(m)} · ${money(t.desp)} no total</p></div></div>
    <div class="hb" role="list">${top.map((x) => `<div class="hb-row" role="listitem"><span class="hb-n">${esc(x.c.nome)}${x.c.tipo && x.c.tipo !== 'X' ? ` <span class="tag">${CLASSE[x.c.tipo]}</span>` : ''}</span><span class="hb-v amt">${money(x.v)} <span class="muted">· ${pct(x.v / t.desp)}</span></span><div class="hb-b"><span style="width:${(x.v / max * 100).toFixed(1)}%"></span></div></div>`).join('')}</div></section>`;
}
function card503020(t, m) {
  const R = cfg().regras;
  if (!(t.rec > 0)) return `<section class="card"><h2 class="ct">Regra 50/30/20</h2><p class="sub">Sem receitas em ${mShort(m)} para comparar.</p></section>`;
  const fut = t.cls.F + Math.max(0, t.sobra);
  const linhas = [
    { n: 'Necessidades', d: 'moradia, contas, transporte, saúde, educação', v: t.cls.N, alvo: R.necessidades, tipo: 'max' },
    { n: 'Desejos', d: 'lazer, compras, vestuário, eletrônicos', v: t.cls.D, alvo: R.desejos, tipo: 'max' },
    { n: 'Futuro', d: 'sobra do mês e aportes', v: fut, alvo: R.futuro, tipo: 'min' },
  ];
  const html = linhas.map((l) => {
    const fr = l.v / t.rec; const ok = l.tipo === 'max' ? fr <= l.alvo / 100 : fr >= l.alvo / 100;
    const perto = l.tipo === 'max' ? fr <= (l.alvo + 10) / 100 : fr >= l.alvo / 200;
    const nv = ok ? 'good' : perto ? 'warn' : 'crit';
    return `<div class="r5"><div class="r5-h"><span><strong>${l.n}</strong> <span class="muted">· ${l.d}</span></span><span class="amt">${pct(fr)} <span class="muted">${l.tipo === 'max' ? 'até' : 'mín.'} ${l.alvo}%</span></span></div>${meter(fr, STC[nv], [l.alvo / 100])}<div class="mlbl"><span class="amt">${money(l.v)}</span>${chip(nv, ok ? 'Dentro da meta' : l.tipo === 'max' ? 'Acima da meta' : 'Abaixo da meta')}</div></div>`;
  }).join('');
  const x = t.cls.X;
  return `<section class="card"><div class="ch"><div><h2 class="ct">Regra 50/30/20</h2><p class="sub">Quanto da renda de ${mShort(m)} vai para cada tipo de gasto.</p></div></div><div class="rule503020">${html}${x > 0.5 ? `<p class="hint">${money(x)} (${pct(x / t.rec)}) em itens “A classificar” ficaram fora. Classifique em Lançamentos.</p>` : ''}</div></section>`;
}
function cardAcerto(m, completo) {
  const a = acerto(m); const deve = a.liq > 0.004 ? 'p2' : a.liq < -0.004 ? 'p1' : null; const valor = Math.abs(a.liq);
  const tr = a.transf.map((x) => `<div><span>${esc(x.s.desc)}: ${esc(nomeP(x.s.de))} → ${esc(nomeP(x.s.para))}</span><span class="amt">${money(x.v)}</span></div>`).join('');
  const itens = completo && a.itens.length ? `<ul class="rows" style="margin-top:6px">${a.itens.sort((x, y) => y.parte - x.parte).map((x) => `<li class="row"><span></span><button type="button" class="r-body" data-act="editar" data-id="${esc(x.s.id)}"><span class="r-t">${esc(x.s.desc)}</span><span class="r-v amt">${money(x.parte)}</span><span class="r-m">${pchip(x.s.pessoa, x.s)}<span>pago por ${esc(nomeP(x.para))}</span>${x.s.forma === 'cartao' && cartaoDe(x.s.cartao) ? `<span>${esc(cartaoDe(x.s.cartao).nome)}</span>` : ''}</span></button></li>`).join('')}</ul>` : '';
  return `<section class="card acerto"${completo ? ' style="margin-bottom:12px"' : ''}>
    <div class="ch"><div><h2 class="ct">Acerto do casal · ${mShort(m)}</h2><p class="sub">Parte de um que foi paga pelo outro: itens no cartão do titular e contas pagas por quem não é o responsável.</p></div></div>
    ${deve ? `<div class="ac-big">${pchip(deve)} ${ic('seta')} ${pchip(outraP(deve))}<span class="amt">${money(valor)}</span></div>` : '<div class="ac-big">Nada a acertar neste mês</div>'}
    <div class="ac-l">
      <div><span>Parte de ${esc(nomeP('p2'))} paga por ${esc(nomeP('p1'))}</span><span class="amt">${money(a.deve.p2)}</span></div>
      <div><span>Parte de ${esc(nomeP('p1'))} paga por ${esc(nomeP('p2'))}</span><span class="amt">${money(a.deve.p1)}</span></div>
      ${tr ? `<div class="muted" style="margin-top:4px"><span>Transferências registradas (fora do acerto)</span><span></span></div>${tr}` : ''}
    </div>
    ${deve ? `<div class="acts"><button type="button" class="btn${a.feito ? '' : ' pri'}" data-act="acerto" data-m="${m}" aria-pressed="${a.feito}"${S.canWrite ? '' : ' disabled'}>${a.feito ? `${ic('check')} Acerto feito` : 'Marcar acerto como feito'}</button>${completo ? '' : '<button type="button" class="btn" data-act="ir-faturas">Ver itens</button>'}</div>` : ''}
    ${itens}
  </section>`;
}
function cardInsights(p, m) {
  const it = insights(p, m);
  return `<section class="card"><div class="ch"><div><h2 class="ct">Alertas e oportunidades</h2><p class="sub">Leitura automática dos lançamentos de ${esc(nomeP(p))}.</p></div></div>${it.length ? `<ul class="ins">${it.map((x) => `<li class="${x.n}"><span class="dot" aria-hidden="true"></span><span>${x.t}</span></li>`).join('')}</ul>` : '<p class="sub">Nada fora do normal por aqui.</p>'}</section>`;
}
function itensDoMes(m, p) {
  const out = [];
  for (const s of S.series.values()) {
    const v = val(s, m); if (!v) continue; const st = status(s, m);
    if (s.tipo === 'transf') { if (p !== 'casal' && s.de !== p && s.para !== p) continue; out.push({ s, v, vTotal: v, st, f: 1, sinal: p === 'casal' ? 0 : (s.para === p ? 1 : -1) }); continue; }
    const f = share(s, p); if (!f) continue;
    out.push({ s, v: v * f, vTotal: v, st, f });
  }
  return out.sort((a, b) => porOrdem(a.s, b.s));
}
function cardAPagar(m, p) {
  const pend = itensDoMes(m, p).filter((x) => x.s.tipo === 'despesa' && x.st === 'prev').sort((a, b) => b.v - a.v);
  const tot = pend.reduce((a, x) => a + x.v, 0);
  return `<section class="card" style="padding-bottom:6px"><div class="ch"><div><h2 class="ct">Contas a pagar em ${mShort(m)}</h2><p class="sub">${pend.length ? `${pend.length} pendentes · ${money(tot)}. Marque o que já foi pago.` : 'Tudo pago neste mês.'}</p></div>${pend.length > 8 ? '<button type="button" class="link" data-act="ir-lanc">Ver todas</button>' : ''}</div>${pend.length ? `<ul class="rows">${pend.slice(0, 8).map((x) => rowHTML(x, m)).join('')}</ul>` : ''}</section>`;
}
function cardTerminando(m, p) {
  const gs = liberacoes(p, m, 4);
  return `<section class="card"><div class="ch"><div><h2 class="ct">Parcelas e contas que terminam</h2><p class="sub">Últimos pagamentos nos próximos meses e quanto deixa de sair depois.</p></div></div>${gs.length ? `<div class="stack">${gs.map((g) => `<div><div class="r5-h"><strong>Última em ${mShort(g.fim)}</strong><span class="amt">${money(g.total)}/mês a menos em ${mShort(mAdd(g.fim, 1))}</span></div><p class="sub" style="margin-top:2px">${g.itens.sort(porOrdem).map((s) => `${esc(s.desc)}${parcLabel(s, g.fim) ? ` <span class="muted">(${parcLabel(s, g.fim)})</span>` : ''}`).join(', ')}</p></div>`).join('')}</div>` : '<p class="sub">Nada termina nos próximos 4 meses.</p>'}</section>`;
}

/* ================= lançamentos ================= */
function rowHTML(it, m) {
  const s = it.s; const pago = it.st === 'pago'; const espera = it.st === 'espera';
  const meta = [];
  if (s.tipo === 'transf') meta.push(`${pchip(s.de)}${ic('seta')}${pchip(s.para)}`);
  else meta.push(pchip(s.pessoa, s));
  if (s.tipo !== 'transf') meta.push(`<span>${esc(catDe(s.cat).nome)}</span>`);
  const pl = parcLabel(s, m); if (pl) meta.push(`<span class="tag">parcela ${pl}</span>`);
  if (s.pessoa === 'casal' && S.pessoa !== 'casal' && s.tipo !== 'transf') meta.push(`<span class="tag">${pct(it.f)} de ${money(it.vTotal)}</span>`);
  if (espera) meta.push('<span class="tag">em espera</span>');
  if (s.obs) meta.push(`<span class="tag" title="${esc(s.obs)}">obs.</span>`);
  const txt = s.tipo === 'transf' && it.sinal ? money(it.v * it.sinal, true) : money(it.v);
  const rotulo = s.tipo === 'receita' ? 'recebido' : 'pago';
  return `<li class="row${pago ? ' is-pago' : ''}${espera ? ' is-espera' : ''}">
    <button type="button" class="ck" data-act="ck" data-id="${esc(s.id)}" data-m="${m}" aria-pressed="${pago}" aria-label="${esc(s.desc)}: marcar como ${rotulo}"${S.canWrite && !espera ? '' : ' disabled'}>${ic('check')}</button>
    <button type="button" class="r-body" data-act="editar" data-id="${esc(s.id)}" data-m="${m}"><span class="r-t">${esc(s.desc)}</span><span class="r-v amt">${txt}</span><span class="r-m">${meta.join('')}</span></button>
  </li>`;
}
VIEWS.lanc = () => {
  const g = portao(false); if (g) return g;
  return `<div class="vh">${seg('lanc', [['lista', 'Lista do mês'], ['faturas', 'Faturas e acerto']])}</div>${S.sub.lanc === 'faturas' ? viewFaturas() : viewLista()}`;
};
function viewLista() {
  const t = totals(S.month, S.pessoa);
  const fs = [['todos', 'Todos'], ['despesa', 'Despesas'], ['receita', 'Receitas'], ['prev', 'Pendentes']];
  return `<div class="toolbar"><div class="seg" role="group" aria-label="Filtrar">${fs.map(([v, n]) => `<button type="button" data-act="filtro" data-f="${v}" aria-pressed="${S.filtro === v}">${n}</button>`).join('')}</div><label class="busca"><span class="hint" style="position:absolute;left:-9999px">Buscar</span><input id="busca" type="search" placeholder="Buscar descrição, categoria…" value="${esc(S.busca)}" autocomplete="off"></label></div>
    <div class="sumstrip"><div><span>Receitas</span><b class="amt">${money(t.rec + t.tin)}</b></div><div><span>Despesas</span><b class="amt">${money(t.desp + t.tout)}</b></div><div><span>Sobra</span><b class="amt${t.sobra < 0 ? ' neg' : ''}">${money(t.sobra)}</b></div></div>
    <div id="lista">${listaHTML()}</div>`;
}
function listaHTML() {
  const m = S.month, p = S.pessoa, q = norm(S.busca.trim());
  let its = itensDoMes(m, p);
  if (S.filtro === 'despesa') its = its.filter((x) => x.s.tipo === 'despesa');
  else if (S.filtro === 'receita') its = its.filter((x) => x.s.tipo === 'receita');
  else if (S.filtro === 'prev') its = its.filter((x) => x.st === 'prev' && x.s.tipo !== 'transf');
  else if (S.filtro === 'pago') its = its.filter((x) => x.st === 'pago');
  if (q) its = its.filter((x) => norm(`${x.s.desc} ${x.s.obs || ''} ${catDe(x.s.cat).nome} ${cartaoDe(x.s.cartao)?.nome || ''}`).includes(q));
  if (!its.length) return `<section class="card empty"><h2 class="ct">Nada por aqui</h2><p class="sub">${q || S.filtro !== 'todos' ? 'Nenhum lançamento com esse filtro neste mês.' : `Sem lançamentos em ${mLong(m)}.`}</p>${S.canWrite ? `<button type="button" class="btn pri" data-act="novo">${ic('mais')} Novo lançamento</button>` : ''}</section>`;
  const grupos = [];
  const ativos = its.filter((x) => x.st !== 'espera');
  grupos.push({ t: 'Receitas', its: ativos.filter((x) => x.s.tipo === 'receita') });
  for (const c of cfg().cartoes) grupos.push({ t: c.nome, s: `titular ${nomeP(c.titular)}${c.venc ? ` · vence dia ${c.venc}` : ''}`, its: ativos.filter((x) => x.s.tipo === 'despesa' && x.s.forma === 'cartao' && x.s.cartao === c.id) });
  grupos.push({ t: 'Cartão não cadastrado', its: ativos.filter((x) => x.s.tipo === 'despesa' && x.s.forma === 'cartao' && !cartaoDe(x.s.cartao)) });
  grupos.push({ t: 'Contas e outras despesas', its: ativos.filter((x) => x.s.tipo === 'despesa' && x.s.forma !== 'cartao') });
  grupos.push({ t: 'Transferências entre vocês', s: p === 'casal' ? 'não entram na conta do casal' : '', its: ativos.filter((x) => x.s.tipo === 'transf') });
  grupos.push({ t: 'Em espera', s: 'visíveis, mas fora das contas', its: its.filter((x) => x.st === 'espera') });
  return grupos.filter((g) => g.its.length).map((g) => {
    const tot = g.its.reduce((a, x) => a + (x.s.tipo === 'transf' && x.sinal ? x.v * x.sinal : x.v), 0);
    return `<section class="lg"><header class="lg-h"><h3>${esc(g.t)}${g.s ? `<span class="lg-s">${esc(g.s)}</span>` : ''}</h3><span class="amt">${g.t === 'Transferências entre vocês' && p !== 'casal' ? money(tot, true) : money(tot)}</span></header><ul class="rows">${g.its.map((x) => rowHTML(x, m)).join('')}</ul></section>`;
  }).join('');
}
function viewFaturas() {
  const m = S.month, p = S.pessoa; const fs = faturas(m, p);
  const corpo = fs.filter((f) => f.itens.length).map((f) => {
    const tit = f.c.titular ? `titular ${nomeP(f.c.titular)}` : 'cadastre em Ajustes';
    const tp = f.porP.p1 + f.porP.p2;
    const barra = p === 'casal' && tp > 0 ? `<div class="fat-bar"><div class="split-bar">${f.porP.p1 > 0.004 ? `<span class="pc-p1" style="flex:${(f.porP.p1 / tp).toFixed(4)}"></span>` : ''}${f.porP.p2 > 0.004 ? `<span class="pc-p2" style="flex:${(f.porP.p2 / tp).toFixed(4)}"></span>` : ''}</div><div class="legend" style="margin:0"><span class="lk"><i class="sw pc-p1"></i>${esc(nomeP('p1'))} ${money(f.porP.p1)}</span><span class="lk"><i class="sw pc-p2"></i>${esc(nomeP('p2'))} ${money(f.porP.p2)}</span><span class="lk">Pago ${money(f.pago)} de ${money(f.total)}</span></div></div>` : '';
    return `<section class="lg"><header class="lg-h"><h3>${esc(f.c.nome)}<span class="lg-s">${esc(tit)}${f.c.venc ? ` · vence dia ${esc(f.c.venc)}` : ''} · ${f.itens.length} ${f.itens.length === 1 ? 'item' : 'itens'}</span></h3><span class="amt">${money(f.total)}</span></header>${barra}<ul class="rows">${f.itens.map((x) => rowHTML(x, m)).join('')}</ul></section>`;
  }).join('');
  return cardAcerto(m, true) + (corpo || `<section class="card empty"><h2 class="ct">Sem faturas em ${mShort(m)}</h2><p class="sub">Nenhuma compra no cartão neste mês para ${esc(nomeP(p))}.</p></section>`);
}

/* ================= planilha ================= */
VIEWS.plan = () => {
  const g = portao(false); if (g) return g;
  return `<div class="vh">${seg('plan', [['grade', 'Grade por mês'], ['parcelas', 'Parcelamentos']])}</div>${S.sub.plan === 'parcelas' ? parcelasHTML() : gradeHTML()}`;
};
function gradeHTML() {
  const p = S.pessoa, ms = janela(), m0 = S.month, ed = S.canWrite;
  const ss = [...S.series.values()].sort(porOrdem);
  const visivel = (s) => (s.tipo === 'transf' ? p !== 'casal' && (s.de === p || s.para === p) : share(s, p) > 0);
  const linha = (s) => { let tot = 0; const cells = ms.map((k) => { let v = val(s, k); const st = status(s, k); v = s.tipo === 'transf' ? (s.para === p ? v : -v) : v * share(s, p); if (st !== 'espera') tot += v; return { v, st, k }; }); return { s, cells, tot }; };
  const temValor = (r) => r.cells.some((c) => Math.abs(c.v) > 0.004);
  const grupos = [];
  grupos.push({ t: 'Receitas', rows: ss.filter((s) => s.tipo === 'receita' && visivel(s)).map(linha).filter(temValor), sub: 'Total de receitas' });
  for (const c of cfg().cartoes) grupos.push({ t: c.nome, rows: ss.filter((s) => s.tipo === 'despesa' && s.forma === 'cartao' && s.cartao === c.id && visivel(s)).map(linha).filter(temValor), sub: `Fatura ${c.nome}` });
  grupos.push({ t: 'Cartão não cadastrado', rows: ss.filter((s) => s.tipo === 'despesa' && s.forma === 'cartao' && !cartaoDe(s.cartao) && visivel(s)).map(linha).filter(temValor), sub: 'Subtotal' });
  grupos.push({ t: 'Contas e outras despesas', rows: ss.filter((s) => s.tipo === 'despesa' && s.forma !== 'cartao' && visivel(s)).map(linha).filter(temValor), sub: 'Subtotal' });
  if (p !== 'casal') grupos.push({ t: 'Transferências entre vocês', rows: ss.filter((s) => s.tipo === 'transf' && visivel(s)).map(linha).filter(temValor), sub: 'Saldo de transferências' });
  const head = `<thead><tr><th class="c-it" scope="col"><span>Lançamento</span></th>${ms.map((k) => `<th scope="col" class="${k === m0 ? 'cur' : ''}"><span>${mShort(k)}</span></th>`).join('')}<th scope="col"><span>Total</span></th></tr></thead>`;
  const cel = (s, c) => { const cls = `${c.st === 'pago' ? 'pago' : c.st === 'espera' ? 'espera' : ''} ${c.k === m0 ? 'cur' : ''}`; const tx = Math.abs(c.v) > 0.004 ? dec(c.v) : ''; return ed ? `<td class="${cls}"><button type="button" class="cb" data-act="cel" data-id="${esc(s.id)}" data-m="${c.k}" aria-label="${esc(s.desc)} em ${mShort(c.k)}: ${tx || 'vazio'}">${tx || '&nbsp;'}</button></td>` : `<td class="${cls}"><span>${tx || '&nbsp;'}</span></td>`; };
  const soma = (rows) => ms.map((k, i) => rows.reduce((a, r) => a + (r.cells[i].st === 'espera' ? 0 : r.cells[i].v), 0));
  const linhaTot = (cls, rot, vals, tot) => `<tr class="${cls}"><td class="c-it"><span>${esc(rot)}</span></td>${vals.map((v, i) => `<td class="${ms[i] === m0 ? 'cur' : ''}"><span class="${v < -0.004 ? 'neg' : ''}">${Math.abs(v) > 0.004 ? dec(v) : '—'}</span></td>`).join('')}<td><span class="${tot < -0.004 ? 'neg' : ''}">${dec(tot)}</span></td></tr>`;
  let body = '';
  for (const g of grupos) {
    if (!g.rows.length) continue;
    body += `<tr class="grp"><td class="c-it"><span>${esc(g.t)}</span></td><td colspan="${ms.length + 1}"><span>&nbsp;</span></td></tr>`;
    for (const r of g.rows) {
      const s = r.s; const pl = s.parc ? parcLabel(s, ms.find((k) => val(s, k)) || ms[0]) : '';
      const det = [p === 'casal' && s.tipo !== 'transf' ? nomeP(s.pessoa) + (s.pessoa === 'casal' ? ` ${s.div ?? 50}/${100 - (s.div ?? 50)}` : '') : '', pl ? `parcela ${pl} em ${mShort(ms.find((k) => val(s, k)) || ms[0])}` : '', s.tipo === 'transf' ? `${nomeP(s.de)} → ${nomeP(s.para)}` : ''].filter(Boolean).join(' · ');
      body += `<tr><td class="c-it"><span>${esc(s.desc)}${det ? `<small>${esc(det)}</small>` : ''}</span></td>${r.cells.map((c) => cel(s, c)).join('')}<td><span>${dec(r.tot)}</span></td></tr>`;
    }
    const sv = soma(g.rows); body += linhaTot('sub', g.sub, sv, sv.reduce((a, v) => a + v, 0));
  }
  const tts = ms.map((k) => totals(k, p));
  const proj = projecao(p); const saldoDe = (k) => (proj.find((x) => x.m === k) || {}).saldo || 0;
  body += linhaTot('tot', 'Total de despesas', tts.map((t) => t.desp), tts.reduce((a, t) => a + t.desp, 0));
  body += linhaTot('tot', 'Total de receitas', tts.map((t) => t.rec), tts.reduce((a, t) => a + t.rec, 0));
  if (p !== 'casal') body += linhaTot('', 'Transferências (líquido)', tts.map((t) => t.tin - t.tout), tts.reduce((a, t) => a + t.tin - t.tout, 0));
  body += linhaTot('sobra', 'Sobra', tts.map((t) => t.sobra), tts.reduce((a, t) => a + t.sobra, 0));
  body += `<tr><td class="c-it"><span>Saldo acumulado</span></td>${ms.map((k) => `<td class="${k === m0 ? 'cur' : ''}"><span class="${saldoDe(k) < 0 ? 'neg' : ''}">${dec(saldoDe(k))}</span></td>`).join('')}<td><span></span></td></tr>`;
  return `<div class="tbl-wrap" role="region" aria-label="Planilha de ${esc(nomeP(p))} por mês" tabindex="0"><table class="grid">${head}<tbody>${body}</tbody></table></div>
    <div class="gnote"><span><span class="sq" style="background:color-mix(in srgb,var(--good) 18%,var(--surface))"></span>pago</span><span><s>valor riscado</s> em espera (fora da conta)</span><span>Coluna destacada: ${mShort(m0)}</span>${ed ? '<span>Toque num valor para editar o mês</span>' : ''}</div>`;
}
function parcelasHTML() {
  const p = S.pessoa, m = S.month; const lista = parcelamentos(p, m);
  const total = lista.reduce((a, x) => a + x.restante, 0);
  const porFim = new Map(); for (const x of lista) { const g = porFim.get(x.fim) || []; g.push(x); porFim.set(x.fim, g); }
  const blocos = [...porFim.entries()].map(([fim, xs]) => `<section class="lg"><header class="lg-h"><h3>Termina em ${mShort(fim)}<span class="lg-s">${xs.length} ${xs.length === 1 ? 'parcelamento' : 'parcelamentos'} · libera ${money(xs.reduce((a, x) => a + val(x.s, fim) * share(x.s, p), 0))}/mês em ${mShort(mAdd(fim, 1))}</span></h3><span class="amt">${money(xs.reduce((a, x) => a + x.restante, 0))}</span></header><ul class="rows">${xs.map((x) => `<li class="row"><span></span><button type="button" class="r-body" data-act="editar" data-id="${esc(x.s.id)}" data-m="${x.prox}"><span class="r-t">${esc(x.s.desc)}</span><span class="r-v amt">${money(x.restante)}</span><span class="r-m">${pchip(x.s.pessoa, x.s)}${x.s.forma === 'cartao' && cartaoDe(x.s.cartao) ? `<span>${esc(cartaoDe(x.s.cartao).nome)}</span>` : ''}<span class="tag">${x.nRest} × ${money(x.parcela)}</span>${x.label ? `<span class="tag">próxima ${x.label}</span>` : ''}</span></button></li>`).join('')}</ul></section>`).join('');
  return `<div class="dash" style="margin-bottom:14px">${cardFaturasMes(m, p, true)}</div>
    <section class="card" style="margin-bottom:12px"><div class="r5-h"><span><strong>Ainda a pagar em parcelas</strong> <span class="muted">a partir de ${mShort(m)}</span></span><span class="amt" style="font-size:20px;font-weight:600">${money(total)}</span></div><p class="sub">${lista.length} parcelamentos ativos de ${esc(nomeP(p))}. Valores restantes por compra, agrupados pelo mês da última parcela.</p></section>
    ${blocos || `<section class="card empty"><h2 class="ct">Nenhum parcelamento ativo</h2><p class="sub">Compras parceladas aparecem aqui com a data da última parcela.</p></section>`}`;
}

/* ================= metas e simulador ================= */
VIEWS.metas = () => {
  const g = portao(true); if (g) return g;
  return `<div class="vh">${seg('metas', [['metas', 'Metas'], ['simular', 'Posso comprar?']])}${S.sub.metas === 'metas' && S.canWrite ? `<button type="button" class="btn" data-act="meta-nova">${ic('mais')} Nova meta</button>` : ''}</div>${S.sub.metas === 'simular' ? simuladorHTML() : metasHTML()}`;
};
function metasHTML() {
  const ms = [...S.metas.values()].sort((a, b) => (a.ord || 0) - (b.ord || 0));
  if (!ms.length) return `<section class="card empty"><h2 class="ct">Nenhuma meta ainda</h2><p class="sub">Comece pela reserva de emergência: de 3 a 6 meses das despesas essenciais, em aplicação segura e com liquidez.</p>${S.canWrite ? '<button type="button" class="btn pri" data-act="meta-reserva">Criar reserva de emergência</button>' : ''}</section>`;
  return `<div class="metas">${ms.map(metaCard).join('')}</div>`;
}
function metaCard(mt) {
  const reserva = mt.tipo === 'reserva'; const ra = reserva ? reservaAlvo(mt.meses) : null;
  const alvo = reserva ? ra.alvo : (+mt.alvo || 0); const g = guardado(mt); const fr = alvo > 0 ? g / alvo : 0;
  const falta = Math.max(0, alvo - g); const prazo = mValid(mt.prazo) ? mt.prazo : null;
  const nMes = prazo ? Math.max(1, mDiff(mNow(), prazo) + 1) : null; const porMes = nMes ? falta / nMes : null;
  const aps = [...S.aportes.values()].filter((a) => a.meta === mt.id).sort((a, b) => String(b.criado).localeCompare(String(a.criado)));
  const nv = fr >= 1 ? 'good' : prazo && mDiff(prazo, mNow()) > 0 ? 'crit' : fr >= 0.5 ? 'good' : 'warn';
  return `<section class="card meta">
    <div class="ch"><div><span class="eyebrow">${reserva ? 'Reserva de emergência' : 'Meta'} · ${esc(nomeP(mt.pessoa || 'casal'))}</span><h2 class="ct">${esc(mt.nome)}</h2></div>${chip(nv, fr >= 1 ? 'Concluída' : `${pct(fr)} guardado`)}</div>
    <div class="meta-n"><span class="amt">${money(g)}</span><span class="muted">de ${money(alvo)}</span></div>
    ${meter(fr, STC[nv])}
    <p class="sub">${reserva ? `${mt.meses || cfg().regras.mesesReserva} × a média das despesas essenciais do casal nos próximos 12 meses (${money(ra.media)}/mês, já com itens a classificar). ` : ''}${falta > 0 ? `Faltam ${money(falta)}${prazo ? `; até ${mShort(prazo)} são ${money(porMes)} por mês (${nMes} ${nMes === 1 ? 'mês' : 'meses'}).` : '.'}` : 'Meta atingida.'}</p>
    ${aps.length ? `<ul class="apl">${aps.slice(0, 5).map((a) => `<li><span>${mShort(a.m)}${a.obs ? ` · ${esc(a.obs)}` : ''}</span><span class="amt${a.v < 0 ? ' neg' : ''}">${money(a.v, true)}</span></li>`).join('')}</ul>` : ''}
    ${S.canWrite ? `<div class="acts"><button type="button" class="btn pri" data-act="aporte" data-id="${esc(mt.id)}">Guardar dinheiro</button><button type="button" class="btn" data-act="meta-editar" data-id="${esc(mt.id)}">Editar</button></div>` : ''}
  </section>`;
}
function simuladorHTML() {
  const ms = mesesOpcoes(); const prox = mAdd(S.month, 1); const eu = S.eu || 'p1';
  return `<section class="card sim"><div><h2 class="ct">Posso comprar?</h2><p class="sub">Simule uma compra parcelada e veja o efeito na sobra de cada mês antes de decidir. Nada é lançado até você confirmar.</p></div>
    <div class="row2"><div class="fld"><label for="sim-valor">Valor</label><input id="sim-valor" type="text" inputmode="decimal" placeholder="Ex.: 2.400,00" autocomplete="off"></div>
    <div class="fld"><span class="lbl">O valor é</span><div class="radios">${pill('sim-vm', 'total', 'Total da compra', 'total')}${pill('sim-vm', 'parcela', 'Da parcela', 'total')}</div></div></div>
    <div class="row3"><div class="fld"><label for="sim-n">Parcelas</label><input id="sim-n" type="number" min="1" max="72" value="10"></div>
    <div class="fld"><label for="sim-mes">1ª parcela em</label><select id="sim-mes">${ms.map((k) => `<option value="${k}"${k === prox ? ' selected' : ''}>${mShort(k)}</option>`).join('')}</select></div>
    <div class="fld"><label for="sim-quem">Quem paga</label><select id="sim-quem"><option value="p1"${eu === 'p1' ? ' selected' : ''}>${esc(nomeP('p1'))}</option><option value="p2"${eu === 'p2' ? ' selected' : ''}>${esc(nomeP('p2'))}</option><option value="casal">Os dois (50/50)</option></select></div></div>
    <div id="sim-res" aria-live="polite"></div>
    <div class="chart" data-chart="sim" tabindex="0" role="img" aria-label="Sobra mensal com a compra simulada"></div>
  </section>`;
}
function lerSim() {
  const v = parseValor($('#sim-valor')?.value); const n = clampInt($('#sim-n')?.value, 1, 72, 10);
  const vm = $('input[name="sim-vm"]:checked')?.value || 'total';
  return { v, n, vm, mes: $('#sim-mes')?.value || mAdd(S.month, 1), quem: $('#sim-quem')?.value || 'p1', parcela: vm === 'total' ? v / n : v };
}
function simAtualizar() {
  const box = $('#sim-res'); const el = $('.chart[data-chart="sim"]'); if (!box || !el) return;
  const sm = lerSim(); const R = cfg().regras;
  if (!(sm.v > 0)) { box.innerHTML = '<p class="hint">Digite o valor para ver o efeito mês a mês.</p>'; CH.sim = null; el.innerHTML = ''; return; }
  const ms = mRange(sm.mes, mAdd(sm.mes, sm.n - 1));
  const h = horizonte(); const fimH = h[h.length - 1];
  if (mDiff(sm.mes, fimH) < 0) { box.innerHTML = `<p class="hint">Não há receitas lançadas a partir de ${mShort(sm.mes)}. Lance as receitas desses meses para simular.</p>`; CH.sim = null; el.innerHTML = ''; return; }
  const vis = mRange(sm.mes, mMin(mAdd(sm.mes, Math.max(sm.n, 6) - 1), fimH));
  const cortado = mDiff(mAdd(sm.mes, sm.n - 1), fimH) < 0;
  const pv = sm.quem; const pj = projecao(pv).filter((x) => mDiff(x.m, sm.mes) >= 1); let saldo = pj.length ? pj[pj.length - 1].saldo : saldoInicial(pv);
  const linhas = vis.map((k) => { const t = totals(k, pv); const extra = ms.includes(k) ? sm.parcela : 0; const sobra = t.sobra - extra; saldo += sobra; return { k, t, extra, sobra, saldo, com: t.rec > 0 ? (t.parcelas + extra) / t.rec : NaN }; });
  const viraNeg = linhas.filter((l) => l.extra && l.sobra < 0);
  const comAlto = linhas.filter((l) => l.extra && l.com > R.limiteParcelas / 100);
  const saldoNeg = linhas.find((l) => l.saldo < 0);
  let nv, titulo, txt;
  if (saldoNeg) { nv = 'crit'; titulo = 'Não cabe'; txt = `O saldo acumulado fica negativo em ${mShort(saldoNeg.k)} (${money(saldoNeg.saldo)}).`; }
  else if (viraNeg.length) { nv = 'warn'; titulo = 'Aperta'; txt = `${viraNeg.map((l) => mShort(l.k)).slice(0, 4).join(', ')} ${viraNeg.length > 1 ? 'ficam' : 'fica'} no vermelho, mas o saldo acumulado cobre.`; }
  else if (comAlto.length) { nv = 'warn'; titulo = 'Cabe, com atenção'; txt = `As parcelas passam de ${R.limiteParcelas}% da renda em ${comAlto.map((l) => mShort(l.k)).slice(0, 3).join(', ')}.`; }
  else { nv = 'good'; titulo = 'Cabe no orçamento'; txt = 'Nenhum mês fica no vermelho e as parcelas ficam dentro do limite.'; }
  const pior = linhas.reduce((a, l) => (!a || l.sobra < a.sobra ? l : a), null);
  box.innerHTML = `<div class="verd">${chip(nv, titulo)}<div><strong>${sm.n} × ${money(sm.parcela)}</strong><span class="sub">${txt} Menor sobra no período: ${money(pior.sobra)} em ${mShort(pior.k)}.${cortado ? ` A simulação vai até ${mShort(fimH)}, último mês com receitas lançadas.` : ''}</span></div></div>
    ${S.canWrite ? `<div class="acts" style="margin-top:10px"><button type="button" class="btn pri" data-act="sim-lancar">Lançar esta compra</button></div>` : ''}`;
  CH.sim = { kind: 'cols', h: 190, data: linhas.map((l) => ({ m: l.k, v: l.sobra, fut: false, sel: false })), tip: (i) => { const l = linhas[i]; return tipLinhas(mLong(l.k), [{ n: 'Sobra sem a compra', v: money(l.t.sobra) }, { n: 'Parcela', v: l.extra ? money(-l.extra) : '—' }, { n: 'Sobra com a compra', v: money(l.sobra), forte: true, cor: l.sobra < 0 ? 'var(--crit)' : 'var(--ent)' }, { n: 'Parcelas na renda', v: pct(l.com, 1) }]); } };
  el.style.setProperty('--ent', `var(--${pv})`);
  drawCols(el, CH.sim);
}

/* ================= ajustes ================= */
VIEWS.ajustes = () => {
  const g = portao(true); if (g) return g;
  const c = cfg(), R = c.regras, ed = S.canWrite ? '' : ' disabled';
  const tip = (p) => ['p1', 'p2'].map((x) => `<option value="${x}"${x === p ? ' selected' : ''}>${esc(nomeP(x))}</option>`).join('');
  const cartoes = c.cartoes.map((k, i) => `<div class="set-r"><div class="fld"><label for="cc-n-${i}">Cartão</label><input id="cc-n-${i}" type="text" value="${esc(k.nome)}" data-cartao="${i}" data-k="nome" maxlength="40"${ed}></div><div class="fld"><label for="cc-t-${i}">Titular (paga a fatura)</label><select id="cc-t-${i}" data-cartao="${i}" data-k="titular"${ed}>${tip(k.titular)}</select></div><div class="fld"><label for="cc-v-${i}">Vence dia</label><input id="cc-v-${i}" type="number" min="1" max="31" value="${esc(k.venc ?? '')}" data-cartao="${i}" data-k="venc"${ed}></div><button type="button" class="btn sm" data-act="rm-cartao" data-i="${i}" aria-label="Remover ${esc(k.nome)}"${ed}>${ic('lixo')}</button></div>`).join('');
  const cats = c.categorias.map((k, i) => `<div class="set-r cat"><div class="fld"><label for="ct-n-${i}">Categoria</label><input id="ct-n-${i}" type="text" value="${esc(k.nome)}" data-cat="${i}" data-k="nome" maxlength="50"${ed}></div><div class="fld"><label for="ct-t-${i}">Tipo</label><select id="ct-t-${i}" data-cat="${i}" data-k="tipo"${ed}>${(k.tipo === 'R' ? ['R'] : ['N', 'D', 'F', 'X']).map((t) => `<option value="${t}"${t === k.tipo ? ' selected' : ''}>${CLASSE[t]}</option>`).join('')}</select></div><button type="button" class="btn sm" data-act="rm-cat" data-i="${i}" aria-label="Remover ${esc(k.nome)}"${ed}>${ic('lixo')}</button></div>`).join('');
  const ca = c.calcAssid; const imp = c.importacao;
  const ms = mesesOpcoes();
  return `<div class="dash">
  <section class="card set"><div><h2 class="ct">Este aparelho</h2><p class="sub">Quem costuma lançar por aqui. Define a pessoa que já vem marcada nos novos lançamentos; fica salvo só neste navegador.</p></div><div class="radios">${['p1', 'p2'].map((p) => `<button type="button" class="btn${S.eu === p ? ' pri' : ''}" data-act="eu" data-p="${p}" aria-pressed="${S.eu === p}"><span class="pc pc-${p}"><i></i></span>${esc(nomeP(p))}</button>`).join('')}</div></section>
  <section class="card set"><div><h2 class="ct">Pessoas</h2><p class="sub">Os nomes aparecem nos filtros, no acerto e nos relatórios.</p></div><div class="row2"><div class="fld"><label for="cfg-p1">Pessoa 1</label><input id="cfg-p1" type="text" maxlength="30" value="${esc(c.pessoas.p1.nome)}" data-cfg="pessoas.p1.nome"${ed}></div><div class="fld"><label for="cfg-p2">Pessoa 2</label><input id="cfg-p2" type="text" maxlength="30" value="${esc(c.pessoas.p2.nome)}" data-cfg="pessoas.p2.nome"${ed}></div></div></section>
  <section class="card set span2"><div><h2 class="ct">Cartões</h2><p class="sub">O titular é quem paga a fatura. O que for do outro no cartão entra no acerto do casal.</p></div><div class="set-l">${cartoes || '<p class="hint">Nenhum cartão cadastrado.</p>'}</div><div><button type="button" class="btn" data-act="add-cartao"${ed}>${ic('mais')} Adicionar cartão</button></div></section>
  <section class="card set"><div><h2 class="ct">Saldos e referências</h2><p class="sub">O saldo inicial é o dinheiro em conta no começo de ${mValid(c.inicio) ? mShort(c.inicio) : 'controle'}; entra no saldo acumulado projetado.</p></div>
    <div class="row2"><div class="fld"><label for="cfg-s1">Saldo inicial · ${esc(nomeP('p1'))}</label><input id="cfg-s1" type="text" inputmode="decimal" value="${dec(c.saldoInicial.p1 || 0)}" data-cfg="saldoInicial.p1" data-tipo="valor"${ed}></div><div class="fld"><label for="cfg-s2">Saldo inicial · ${esc(nomeP('p2'))}</label><input id="cfg-s2" type="text" inputmode="decimal" value="${dec(c.saldoInicial.p2 || 0)}" data-cfg="saldoInicial.p2" data-tipo="valor"${ed}></div></div>
    <div class="row2"><div class="fld"><label for="cfg-ini">Início do controle</label><select id="cfg-ini" data-cfg="inicio"${ed}>${ms.map((k) => `<option value="${k}"${k === c.inicio ? ' selected' : ''}>${mShort(k)}</option>`).join('')}</select></div><div class="fld"><label for="cfg-lim">Limite de parcelas na renda (%)</label><input id="cfg-lim" type="number" min="5" max="80" value="${R.limiteParcelas}" data-cfg="regras.limiteParcelas" data-tipo="int"${ed}></div></div>
    <div class="row3"><div class="fld"><label for="cfg-n">Necessidades até (%)</label><input id="cfg-n" type="number" min="0" max="100" value="${R.necessidades}" data-cfg="regras.necessidades" data-tipo="int"${ed}></div><div class="fld"><label for="cfg-d">Desejos até (%)</label><input id="cfg-d" type="number" min="0" max="100" value="${R.desejos}" data-cfg="regras.desejos" data-tipo="int"${ed}></div><div class="fld"><label for="cfg-f">Guardar ao menos (%)</label><input id="cfg-f" type="number" min="0" max="100" value="${R.futuro}" data-cfg="regras.futuro" data-tipo="int"${ed}></div></div>
    <div class="fld"><label for="cfg-mr">Meses de reserva de emergência</label><input id="cfg-mr" type="number" min="1" max="24" value="${R.mesesReserva}" data-cfg="regras.mesesReserva" data-tipo="int"${ed}><span class="hint">Referência de mercado: 3 a 6 meses de despesas essenciais; 6 a 12 com renda variável.</span></div>
  </section>
  <section class="card set"><div><h2 class="ct">Calculadora de assiduidade</h2><p class="sub">O mesmo cálculo do quadro da planilha: hora com acréscimo do ACT × dias da escala × multiplicador do site, menos o desconto.</p></div>
    <div class="row2"><div class="fld"><label for="ca-base">Salário base</label><input id="ca-base" type="text" inputmode="decimal" value="${dec(ca.base)}" data-calc="base"${ed}></div><div class="fld"><label for="ca-jor">Jornada (h/mês)</label><input id="ca-jor" type="number" min="1" value="${ca.jornada}" data-calc="jornada"${ed}></div></div>
    <div class="row2"><div class="fld"><label for="ca-dias">Escala (dias trabalhados)</label><input id="ca-dias" type="number" min="0" value="${ca.dias}" data-calc="dias"${ed}></div><div class="fld"><label for="ca-site">Multiplicador do site</label><input id="ca-site" type="number" min="0" step="0.5" value="${ca.site}" data-calc="site"${ed}></div></div>
    <div class="row2"><div class="fld"><label for="ca-act">Acréscimo ACT (%)</label><input id="ca-act" type="number" min="0" step="0.5" value="${ca.act}" data-calc="act"${ed}></div><div class="fld"><label for="ca-desc">Desconto (%)</label><input id="ca-desc" type="number" min="0" max="100" step="0.5" value="${ca.desconto}" data-calc="desconto"${ed}></div></div>
    <div class="calc" id="calc-res"></div>
    ${S.canWrite ? `<div class="row2" style="align-items:end"><div class="fld"><label for="ca-mes">Lançar como receita de ${esc(nomeP(ca.pessoa))} em</label><select id="ca-mes">${ms.map((k) => `<option value="${k}"${k === S.month ? ' selected' : ''}>${mShort(k)}</option>`).join('')}</select></div><button type="button" class="btn pri" data-act="calc-lancar">Lançar assiduidade</button></div>` : ''}
  </section>
  <section class="card set span2"><div><h2 class="ct">Categorias</h2><p class="sub">O tipo define a regra 50/30/20: Necessidade, Desejo ou Futuro. “A classificar” fica fora da regra até você decidir.</p></div><div class="set-l">${cats}</div><div class="acts"><button type="button" class="btn" data-act="add-cat" data-t="D"${ed}>${ic('mais')} Categoria de despesa</button><button type="button" class="btn" data-act="add-cat" data-t="R"${ed}>${ic('mais')} Categoria de receita</button></div></section>
  <section class="card set"><div><h2 class="ct">Backup e exportação</h2><p class="sub">Leve os dados para o Excel ou guarde uma cópia de segurança.</p></div><div class="acts"><button type="button" class="btn" data-act="exp-xlsx">${ic('baixar')} Planilha Excel (.xlsx)</button><button type="button" class="btn" data-act="exp-csv">${ic('baixar')} Lançamentos (.csv)</button><button type="button" class="btn" data-act="exp-json">${ic('baixar')} Backup (.json)</button></div>
    ${S.canWrite ? `<div class="acts"><button type="button" class="btn" data-act="restaurar">${ic('subir')} Restaurar backup</button><button type="button" class="btn dng" data-act="apagar">${ic('lixo')} Apagar todos os dados</button></div>` : ''}</section>
  <section class="card set"><div><h2 class="ct">Conta e nuvem</h2><p class="sub">${S.conta?.email ? `Conectado como <b>${esc(S.conta.email)}</b>` : 'Conectado ao Firebase'}${window.Backend?.info?.().projeto ? ` · projeto <code>${esc(window.Backend.info().projeto)}</code>` : ''}. Os dados ficam no Cloud Firestore e também neste aparelho, para abrir sem internet.</p></div><div class="acts"><button type="button" class="btn" data-act="regras">Regras do Firestore</button><button type="button" class="btn" data-act="cfg-firebase">Configuração do Firebase</button><button type="button" class="btn" data-act="sair">Sair</button></div></section>
  <section class="card set"><div><h2 class="ct">Usar a dois, no celular e no computador</h2></div><ol class="passos"><li>Em <b>Regras do Firestore</b>, informe o e-mail Google da outra pessoa, copie as regras e publique no console do Firebase (Firestore Database › Regras).</li><li>Ela abre este mesmo endereço e entra com a conta Google dela. Os dois veem e lançam no mesmo livro-caixa, em tempo real.</li><li>No celular, abra o endereço e use “Instalar app” ou “Adicionar à tela de início”. Sem internet, o app abre e guarda os lançamentos até a conexão voltar.</li></ol>${imp ? `<p class="hint">Dados iniciais importados de ${esc(imp.arquivo)} em ${esc(imp.data)} (${esc(imp.series)} lançamentos). Cada lançamento importado guarda a aba e a linha de origem.</p>` : ''}</section>
  </div>`;
};
function calcValores() {
  const g = (k) => parseValor($(`[data-calc="${k}"]`)?.value);
  const c = { base: g('base'), jornada: g('jornada'), dias: g('dias'), site: g('site'), act: g('act'), desconto: g('desconto') };
  for (const k of Object.keys(c)) if (!Number.isFinite(c[k])) c[k] = 0;
  const hora = c.jornada ? c.base / c.jornada : 0; const horaAct = hora * (1 + c.act / 100); const qtd = c.dias * c.site;
  const bruto = qtd * horaAct; const desc = bruto * c.desconto / 100;
  return { c, hora, horaAct, qtd, bruto, desc, liq: bruto - desc };
}
function calcAtualizar() {
  const el = $('#calc-res'); if (!el) return; const r = calcValores();
  el.innerHTML = `<div><span>1º Valor da hora (${dec(r.c.base)} ÷ ${r.c.jornada})</span><span class="amt">${money(r.hora)}</span></div><div><span>2º Hora com ACT (+${String(r.c.act).replace('.', ',')}%)</span><span class="amt">${money(r.horaAct)}</span></div><div><span>3º Quantidade (${r.c.dias} × ${String(r.c.site).replace('.', ',')})</span><span class="amt">${String(r.qtd).replace('.', ',')}</span></div><div><span>4º Bruto</span><span class="amt">${money(r.bruto)}</span></div><div><span>Desconto (${String(r.c.desconto).replace('.', ',')}%)</span><span class="amt">${money(-r.desc)}</span></div><div class="fim"><span>Valor líquido</span><span class="amt">${money(r.liq)}</span></div>`;
}

/* ================= folhas (formulários) ================= */
function pill(name, value, label, atual, extra = '') { return `<label class="pill"${extra}><input type="radio" name="${name}" id="${name}-${value}" value="${value}"${value === atual ? ' checked' : ''}><span>${label}</span></label>`; }
const radio = (name) => $(`#sheet input[name="${name}"]:checked`)?.value || $(`input[name="${name}"]:checked`)?.value;
function mesesOpcoes() {
  const h = horizonte(); const a = mAdd(mMin(h[0], mNow()), -12), b = mAdd(mMax(h[h.length - 1], mNow()), 24);
  return mRange(a, b);
}
function catOpts(tipo, sel) {
  const cs = cfg().categorias;
  if (tipo === 'receita') return cs.filter((c) => c.tipo === 'R').map((c) => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(c.nome)}</option>`).join('');
  return ['N', 'D', 'F', 'X'].map((t) => { const g = cs.filter((c) => c.tipo === t); return g.length ? `<optgroup label="${CLASSE[t]}">${g.map((c) => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</optgroup>` : ''; }).join('');
}
function abrirFolha(titulo, corpo, rodape) {
  S.opener = document.activeElement;
  const w = $('#sheet');
  w.innerHTML = `<div class="sheet-bg" data-act="fechar"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-t" tabindex="-1"><header class="sh-h"><h2 id="sh-t">${titulo}</h2><button type="button" class="ib" data-act="fechar" aria-label="Fechar">${ic('x')}</button></header><form class="sh-b" id="sh-form" novalidate>${corpo}<p class="err" id="sh-err" role="alert"></p><button type="submit" hidden></button></form><footer class="sh-f">${rodape}</footer></div>`;
  w.hidden = false; document.documentElement.classList.add('locked'); esconderTip();
  setTimeout(() => { const fino = matchMedia('(pointer: fine)').matches; const f = fino ? $('#sheet input[type="text"]:not([disabled]), #sheet select:not([disabled]), #sheet input[type="number"]') : null; (f || $('#sheet .sheet')).focus({ preventScroll: true }); }, 30);
}
function fecharFolha() {
  const w = $('#sheet'); if (w.hidden) return;
  w.hidden = true; w.innerHTML = ''; S.sheet = null; document.documentElement.classList.remove('locked');
  if (S.opener && document.contains(S.opener)) S.opener.focus({ preventScroll: true });
  if (adiada) { adiada = false; agendar(); }
}
const erroFolha = (t) => { const e = $('#sh-err'); if (e) e.textContent = t; };

function rascunhoNovo(extra = {}) {
  const eu = S.eu || (S.pessoa === 'p2' ? 'p2' : 'p1');
  return { tipo: 'despesa', desc: '', valor: null, mes: S.month, pessoa: S.pessoa === 'casal' ? eu : S.pessoa, div: 50, cat: 'mercado', forma: 'pix', cartao: cfg().cartoes[0]?.id || '', pagador: eu, rep: 'unica', np: 10, pa: 1, vm: 'parcela', nm: 12, st: 'prev', obs: '', de: 'p1', para: 'p2', ...extra };
}
function formLanc(d, modo) {
  const opP = (sel) => ['p1', 'p2'].map((x) => `<option value="${x}"${x === sel ? ' selected' : ''}>${esc(nomeP(x))}</option>`).join('');
  const ms = mesesOpcoes(); const cards = cfg().cartoes;
  return `
  <div class="fld"><span class="lbl" id="l-tipo">Tipo</span><div class="radios" role="radiogroup" aria-labelledby="l-tipo">${pill('f-tipo', 'despesa', 'Despesa', d.tipo)}${pill('f-tipo', 'receita', 'Receita', d.tipo)}${pill('f-tipo', 'transf', 'Transferência entre vocês', d.tipo)}</div></div>
  <div class="fld"><label for="f-desc">Descrição</label><input id="f-desc" type="text" maxlength="80" autocomplete="off" value="${esc(d.desc)}" placeholder="Ex.: Mercado, conta de luz, salário"></div>
  <div class="row2"><div class="fld"><label for="f-valor" id="l-valor">Valor</label><input id="f-valor" type="text" inputmode="decimal" autocomplete="off" value="${d.valor != null ? esc(dec(d.valor)) : ''}" placeholder="0,00"><span class="hint">Aceita contas, como 197/2</span></div>
  <div class="fld"><label for="f-mes">${modo === 'novo' ? 'Mês (competência)' : 'Mês editado'}</label><select id="f-mes"${modo === 'novo' ? '' : ' disabled'}>${ms.map((k) => `<option value="${k}"${k === d.mes ? ' selected' : ''}>${mShort(k)}</option>`).join('')}</select></div></div>
  <div class="fld" data-sh="despesa receita"><span class="lbl" id="l-pes">De quem é</span><div class="radios" role="radiogroup" aria-labelledby="l-pes">${pill('f-pessoa', 'p1', `<i></i>${esc(nomeP('p1'))}`, d.pessoa, ' style="--c:var(--p1)"')}${pill('f-pessoa', 'p2', `<i></i>${esc(nomeP('p2'))}`, d.pessoa, ' style="--c:var(--p2)"')}${pill('f-pessoa', 'casal', '<i></i>Dos dois', d.pessoa, ' style="--c:var(--casal)"')}</div></div>
  <div class="fld" data-sh-casal><label for="f-div">Parte de ${esc(nomeP('p1'))} (%)</label><input id="f-div" type="number" min="0" max="100" step="1" value="${d.div ?? 50}"><span class="hint" id="f-div-h"></span></div>
  <div class="row2" data-sh="transf"><div class="fld"><label for="f-de">De</label><select id="f-de">${opP(d.de)}</select></div><div class="fld"><label for="f-para">Para</label><select id="f-para">${opP(d.para)}</select></div></div>
  <div class="fld" data-sh="despesa receita"><label for="f-cat">Categoria</label><select id="f-cat">${catOpts(d.tipo, d.cat)}</select></div>
  <div class="row2" data-sh="despesa"><div class="fld"><label for="f-forma">Como paga</label><select id="f-forma">${FORMAS.map(([v, n]) => `<option value="${v}"${v === d.forma ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
  <div class="fld" data-sh-cartao><label for="f-cartao">Cartão</label><select id="f-cartao">${cards.length ? cards.map((c) => `<option value="${esc(c.id)}"${c.id === d.cartao ? ' selected' : ''}>${esc(c.nome)}</option>`).join('') : '<option value="">Cadastre em Ajustes</option>'}</select></div>
  <div class="fld" data-sh-pagador><label for="f-pagador">Quem paga a conta</label><select id="f-pagador">${opP(d.pagador)}</select></div></div>
  ${modo === 'novo' ? `
  <div class="fld"><span class="lbl" id="l-rep">Repetição</span><div class="radios" role="radiogroup" aria-labelledby="l-rep">${pill('f-rep', 'unica', 'Só este mês', d.rep)}${pill('f-rep', 'parcelada', 'Parcelada', d.rep)}${pill('f-rep', 'mensal', 'Todo mês', d.rep)}</div></div>
  <div class="row3" data-sh-rep="parcelada"><div class="fld"><label for="f-np">Nº de parcelas</label><input id="f-np" type="number" min="2" max="360" value="${d.np}"></div><div class="fld"><label for="f-pa">Parcela atual</label><input id="f-pa" type="number" min="1" max="360" value="${d.pa}"></div><div class="fld"><span class="lbl">O valor é</span><div class="radios">${pill('f-vm', 'parcela', 'Da parcela', d.vm)}${pill('f-vm', 'total', 'Total', d.vm)}</div></div></div>
  <div class="fld" data-sh-rep="mensal"><label for="f-nm">Por quantos meses</label><input id="f-nm" type="number" min="2" max="360" value="${d.nm}"></div>
  <p class="hint" id="f-rep-h"></p>` : `
  <div class="fld"><span class="lbl" id="l-esc">Aplicar o valor a</span><div class="radios" role="radiogroup" aria-labelledby="l-esc">${pill('f-esc', 'mes', `Só ${mShort(d.mes)}`, 'mes')}${pill('f-esc', 'seg', 'Este e os próximos', 'mes')}${pill('f-esc', 'todos', 'Todos os meses', 'mes')}</div></div>
  ${d.rec ? `<div class="fld"><label for="f-fim">Último mês</label><select id="f-fim">${ms.map((k) => `<option value="${k}"${k === d.fim ? ' selected' : ''}>${mShort(k)}</option>`).join('')}</select><span class="hint">Estenda ou encurte esta conta fixa.</span></div>` : ''}
  <p class="hint">${esc(d.resumo || '')}</p>`}
  <div class="fld"><span class="lbl" id="l-st">Situação em ${mShort(d.mes)}</span><div class="radios" role="radiogroup" aria-labelledby="l-st">${pill('f-st', 'prev', 'Previsto', d.st)}${pill('f-st', 'pago', '<span data-lbl-pago>Pago</span>', d.st)}${pill('f-st', 'espera', 'Em espera', d.st)}</div><span class="hint">Em espera fica visível, mas não entra nas contas.</span></div>
  <div class="fld"><label for="f-obs">Observação</label><textarea id="f-obs" rows="2" maxlength="300">${esc(d.obs || '')}</textarea></div>
  ${d.orig ? `<p class="hint">Origem: ${esc(d.orig)}${d.criado ? '' : ''}</p>` : ''}`;
}
function syncLanc() {
  const tipo = radio('f-tipo') || 'despesa'; const pes = radio('f-pessoa'); const forma = $('#f-forma')?.value; const rep = radio('f-rep');
  for (const el of $$('#sheet [data-sh]')) el.hidden = !el.dataset.sh.split(' ').includes(tipo);
  const casal = tipo !== 'transf' && pes === 'casal';
  for (const el of $$('#sheet [data-sh-casal]')) el.hidden = !casal;
  for (const el of $$('#sheet [data-sh-cartao]')) el.hidden = !(tipo === 'despesa' && forma === 'cartao');
  for (const el of $$('#sheet [data-sh-pagador]')) el.hidden = !(tipo === 'despesa' && forma !== 'cartao');
  for (const el of $$('#sheet [data-sh-rep]')) el.hidden = el.dataset.shRep !== rep;
  const cat = $('#f-cat');
  if (cat && cat.dataset.tipo !== (tipo === 'receita' ? 'R' : 'D')) {
    const atual = cat.value; cat.innerHTML = catOpts(tipo, atual); cat.dataset.tipo = tipo === 'receita' ? 'R' : 'D';
    if (!$$('option', cat).some((o) => o.value === atual)) cat.value = tipo === 'receita' ? 'salario' : 'mercado';
  }
  const lp = $('#sheet [data-lbl-pago]'); if (lp) lp.textContent = tipo === 'receita' ? 'Recebido' : 'Pago';
  const v = parseValor($('#f-valor')?.value);
  const dh = $('#f-div-h'); if (dh) { const d = clampInt($('#f-div').value, 0, 100, 50); dh.textContent = Number.isFinite(v) ? `${nomeP('p1')} ${money(v * d / 100)} · ${nomeP('p2')} ${money(v * (100 - d) / 100)}` : ''; }
  const lv = $('#l-valor'); if (lv) lv.textContent = rep === 'parcelada' ? (radio('f-vm') === 'total' ? 'Valor total da compra' : 'Valor da parcela') : rep === 'mensal' ? 'Valor por mês' : 'Valor';
  const rh = $('#f-rep-h');
  if (rh) {
    const mes = $('#f-mes').value;
    if (rep === 'parcelada' && Number.isFinite(v) && v > 0) {
      const np = clampInt($('#f-np').value, 2, 360, 10), pa = clampInt($('#f-pa').value, 1, 360, 1); const q = np - pa + 1;
      const parc = radio('f-vm') === 'total' ? v / np : v;
      rh.textContent = q >= 1 ? `${q} ${q === 1 ? 'parcela' : 'parcelas'} de ${money(parc)} · ${mShort(mes)} a ${mShort(mAdd(mes, q - 1))} · parcela ${pa}/${np} em ${mShort(mes)}` : 'A parcela atual não pode passar do total.';
    } else if (rep === 'mensal' && Number.isFinite(v) && v > 0) { const nm = clampInt($('#f-nm').value, 1, 360, 12); rh.textContent = `${nm} meses de ${money(v)} · ${mShort(mes)} a ${mShort(mAdd(mes, nm - 1))}`; }
    else rh.textContent = '';
  }
}
function lerForm() {
  const g = (id) => $('#' + id);
  return {
    tipo: radio('f-tipo') || 'despesa', desc: (g('f-desc')?.value || '').trim(), valor: parseValor(g('f-valor')?.value), mes: g('f-mes')?.value,
    pessoa: radio('f-pessoa') || 'p1', div: clampInt(g('f-div')?.value, 0, 100, 50), de: g('f-de')?.value || 'p1', para: g('f-para')?.value || 'p2',
    cat: g('f-cat')?.value || 'outros', forma: g('f-forma')?.value || 'outro', cartao: g('f-cartao')?.value || '', pagador: g('f-pagador')?.value || 'p1',
    rep: radio('f-rep') || 'unica', np: clampInt(g('f-np')?.value, 2, 360, 10), pa: clampInt(g('f-pa')?.value, 1, 360, 1), vm: radio('f-vm') || 'parcela',
    nm: clampInt(g('f-nm')?.value, 1, 360, 12), st: radio('f-st') || 'prev', obs: (g('f-obs')?.value || '').trim(), esc: radio('f-esc') || 'mes', fim: g('f-fim')?.value,
  };
}
function validar(f) {
  if (!f.desc) return 'Escreva uma descrição.';
  if (!Number.isFinite(f.valor) || f.valor <= 0) return 'Digite um valor maior que zero, como 318,00 ou 197/2.';
  if (f.tipo === 'transf' && f.de === f.para) return 'Escolha pessoas diferentes em De e Para.';
  if (f.tipo === 'despesa' && f.forma === 'cartao' && !cartaoDe(f.cartao)) return 'Cadastre um cartão em Ajustes ou escolha outra forma de pagamento.';
  if (f.rep === 'parcelada' && f.pa > f.np) return 'A parcela atual não pode passar do total.';
  return '';
}
function camposBase(f) {
  const d = { tipo: f.tipo, desc: f.desc, obs: f.obs };
  if (f.tipo === 'transf') Object.assign(d, { de: f.de, para: f.para, cat: 'transf', forma: 'pix', cartao: null, pessoa: null });
  else {
    d.pessoa = f.pessoa; if (f.pessoa === 'casal') d.div = f.div;
    d.cat = f.cat;
    if (f.tipo === 'despesa') { d.forma = f.forma; d.cartao = f.forma === 'cartao' ? f.cartao : null; if (f.forma !== 'cartao') d.pagador = f.pessoa === 'casal' ? f.pagador : (f.pagador || f.pessoa); }
    else { d.forma = 'outro'; d.cartao = null; }
  }
  return d;
}
function abrirNovo(extra) {
  const d = rascunhoNovo(extra);
  S.sheet = { kind: 'novo' };
  abrirFolha('Novo lançamento', formLanc(d, 'novo'), `<button type="button" class="btn" data-act="fechar">Cancelar</button><button type="button" class="btn pri" data-act="salvar">Salvar</button>`);
  $('#f-cat').dataset.tipo = d.tipo === 'receita' ? 'R' : 'D'; syncLanc();
}
function salvarNovo() {
  const f = lerForm(); const e = validar(f); if (e) return erroFolha(e);
  const v = {}; let parc = null, rec = false;
  if (f.rep === 'parcelada') {
    const q = f.np - f.pa + 1;
    if (f.vm === 'total') { const base = Math.floor(f.valor / f.np * 100) / 100; const prim = r2(f.valor - base * (f.np - 1)); for (let i = 0; i < q; i++) v[mAdd(f.mes, i)] = f.pa + i === 1 ? prim : base; }
    else for (let i = 0; i < q; i++) v[mAdd(f.mes, i)] = f.valor;
    parc = { n: f.pa, de: f.np, ini: f.mes };
  } else if (f.rep === 'mensal') { for (let i = 0; i < f.nm; i++) v[mAdd(f.mes, i)] = f.valor; rec = true; }
  else v[f.mes] = f.valor;
  const st = {}; if (f.st === 'espera') for (const k of Object.keys(v)) st[k] = 'espera'; else if (f.st === 'pago') st[f.mes] = 'pago';
  const doc = { ...camposBase(f), parc, rec, v, st, ord: Date.now(), criado: new Date().toISOString(), por: S.eu || null };
  fecharFolha();
  dbSet('series', 's' + uid(), doc).then(() => toast('Lançamento salvo.')).catch(() => {});
}
function abrirEditar(id, m) {
  const s = S.series.get(id); if (!s) return;
  const ks = mesesDe(s);
  const resumo = ks.length ? `${ks.length} ${ks.length === 1 ? 'mês' : 'meses'} com valor: ${mShort(ks[0])} a ${mShort(ks[ks.length - 1])} · total ${money(ks.reduce((a, k) => a + val(s, k), 0))}` : 'Sem valores lançados.';
  const d = { ...rascunhoNovo(), ...s, valor: val(s, m) || (ks.length ? val(s, ks[ks.length - 1]) : null), mes: m, st: status(s, m), resumo, fim: ks[ks.length - 1] || m,
    pessoa: s.pessoa || 'p1', cartao: s.cartao || cfg().cartoes[0]?.id || '', pagador: s.pagador || pagadorDe(s) || 'p1', de: s.de || 'p1', para: s.para || 'p2' };
  S.sheet = { kind: 'editar', id, m };
  abrirFolha('Editar lançamento', formLanc(d, 'editar'), `<button type="button" class="btn dng esq" data-act="excluir">${ic('lixo')} Excluir</button><button type="button" class="btn" data-act="fechar">Cancelar</button><button type="button" class="btn pri" data-act="salvar">Salvar</button>`);
  $('#f-cat').dataset.tipo = d.tipo === 'receita' ? 'R' : 'D'; syncLanc();
  if (!S.canWrite) { for (const el of $$('#sheet input, #sheet select, #sheet textarea')) el.disabled = true; for (const b of $$('#sheet [data-act="salvar"], #sheet [data-act="excluir"]')) b.hidden = true; }
}
function aplicarEscopo(novo, m, valor, esc) {
  const ks = Object.keys(novo.v).filter((k) => mValid(k) && novo.v[k] != null);
  if (esc === 'seg') { for (const k of ks) if (mDiff(m, k) >= 0) novo.v[k] = valor; }
  else if (esc === 'todos') for (const k of ks) novo.v[k] = valor;
  novo.v[m] = valor;
}
function salvarEdicao() {
  const { id, m } = S.sheet; const s = S.series.get(id); if (!s) return fecharFolha();
  const f = lerForm(); f.mes = m; const e = validar({ ...f, rep: 'unica' }); if (e) return erroFolha(e);
  const novo = clone(s); delete novo.id;
  for (const k of ['pessoa', 'div', 'de', 'para', 'cartao', 'pagador']) delete novo[k];
  Object.assign(novo, camposBase(f));
  novo.v = { ...(s.v || {}) }; novo.st = { ...(s.st || {}) };
  aplicarEscopo(novo, m, f.valor, f.esc);
  if (s.rec && mValid(f.fim)) {
    const ks = Object.keys(novo.v).filter((k) => mValid(k) && novo.v[k] != null).sort(); const ult = ks[ks.length - 1] || m;
    if (mDiff(ult, f.fim) > 0) for (let k = mAdd(ult, 1); mDiff(k, f.fim) >= 0; k = mAdd(k, 1)) novo.v[k] = f.valor;
    else if (mDiff(f.fim, ult) > 0) for (const k of Object.keys(novo.v)) if (mDiff(f.fim, k) > 0) { delete novo.v[k]; delete novo.st[k]; }
  }
  if (f.st === 'prev') delete novo.st[m]; else novo.st[m] = f.st;
  novo.upd = new Date().toISOString();
  fecharFolha();
  dbSet('series', id, novo).then(() => toast('Alterações salvas.')).catch(() => {});
}
function abrirExcluir() {
  const { id, m } = S.sheet; const s = S.series.get(id); if (!s) return;
  const n = mesesDe(s).length;
  S.sheet = { kind: 'excluir', id, m };
  abrirFolha('Excluir lançamento', `<p>O que você quer excluir de <b>${esc(s.desc)}</b>?</p><p class="sub">${n} ${n === 1 ? 'mês tem' : 'meses têm'} valor neste lançamento. Esta ação não pode ser desfeita.</p>`,
    `<button type="button" class="btn" data-act="fechar">Cancelar</button>${n > 1 ? `<button type="button" class="btn dng" data-act="excluir-mes">Só ${mShort(m)}</button>` : ''}<button type="button" class="btn dng" data-act="excluir-tudo">${n > 1 ? 'Todos os meses' : 'Excluir'}</button>`);
}
function excluirMes() {
  const { id, m } = S.sheet; const s = S.series.get(id); fecharFolha(); if (!s) return;
  const novo = clone(s); delete novo.id; if (novo.v) delete novo.v[m]; if (novo.st) delete novo.st[m];
  if (!mesesDe(novo).length) { dbDel('series', id).then(() => toast('Lançamento excluído.')).catch(() => {}); return; }
  dbSet('series', id, novo).then(() => toast(`${mShort(m)} excluído.`)).catch(() => {});
}
function excluirTudo() { const { id } = S.sheet; fecharFolha(); dbDel('series', id).then(() => toast('Lançamento excluído.')).catch(() => {}); }
function abrirCelula(id, m) {
  const s = S.series.get(id); if (!s) return;
  const v = val(s, m); S.sheet = { kind: 'celula', id, m };
  abrirFolha(`${esc(s.desc)} · ${mShort(m)}`, `
    <div class="fld"><label for="c-valor">Valor em ${mShort(m)}${s.pessoa === 'casal' ? ' (total da compra, antes da divisão)' : ''}</label><input id="c-valor" type="text" inputmode="decimal" autocomplete="off" value="${v ? esc(dec(v)) : ''}" placeholder="Deixe vazio para tirar este mês"><span class="hint">Aceita contas, como 197/2</span></div>
    <div class="fld"><span class="lbl">Aplicar a</span><div class="radios">${pill('c-esc', 'mes', `Só ${mShort(m)}`, 'mes')}${pill('c-esc', 'seg', 'Este e os próximos', 'mes')}${pill('c-esc', 'todos', 'Todos os meses', 'mes')}</div></div>
    <div class="fld"><span class="lbl">Situação</span><div class="radios">${pill('c-st', 'prev', 'Previsto', status(s, m))}${pill('c-st', 'pago', s.tipo === 'receita' ? 'Recebido' : 'Pago', status(s, m))}${pill('c-st', 'espera', 'Em espera', status(s, m))}</div></div>
    ${s.orig ? `<p class="hint">Origem: ${esc(s.orig)}</p>` : ''}`,
    `<button type="button" class="btn esq" data-act="cel-completo">Editar tudo</button><button type="button" class="btn" data-act="fechar">Cancelar</button><button type="button" class="btn pri" data-act="salvar">Salvar</button>`);
}
function salvarCelula() {
  const { id, m } = S.sheet; const s = S.series.get(id); if (!s) return fecharFolha();
  const txt = $('#c-valor').value.trim(); const valor = txt ? parseValor(txt) : null;
  if (txt && !(Number.isFinite(valor) && valor > 0)) return erroFolha('Digite um valor maior que zero ou deixe vazio para tirar o mês.');
  const novo = clone(s); delete novo.id; novo.v = { ...(s.v || {}) }; novo.st = { ...(s.st || {}) };
  const esc2 = radio('c-esc') || 'mes'; const st = radio('c-st') || 'prev';
  if (valor == null) { delete novo.v[m]; delete novo.st[m]; }
  else { aplicarEscopo(novo, m, valor, esc2); if (st === 'prev') delete novo.st[m]; else novo.st[m] = st; }
  fecharFolha();
  if (!mesesDe(novo).length) { dbDel('series', id).then(() => toast('Lançamento excluído.')).catch(() => {}); return; }
  dbSet('series', id, novo).then(() => toast('Valor salvo.')).catch(() => {});
}

function abrirMeses() {
  const h = horizonte(); const a = mMin(h[0], mNow()), b = mAdd(mMax(h[h.length - 1], mNow()), 6);
  const anos = new Map(); for (const k of mRange(a, b)) { const y = mParse(k).y; if (!anos.has(y)) anos.set(y, []); anos.get(y).push(k); }
  const p = S.pessoa; S.sheet = { kind: 'meses' };
  const corpo = [...anos.entries()].map(([y, ks]) => `<p class="mg-y">${y}</p><div class="mg">${ks.map((k) => { const t = totals(k, p); const tem = t.rec || t.desp; return `<button type="button" data-act="mes-set" data-m="${k}" aria-pressed="${k === S.month}" class="${k === mNow() ? 'hj' : ''}" aria-label="${mLong(k)}${tem ? `, sobra ${money(t.sobra)}` : ''}">${MES[mParse(k).m - 1]}${tem ? `<small class="${t.sobra < 0 ? 'neg' : ''}">${esc(compact(t.sobra))}</small>` : '<small>—</small>'}</button>`; }).join('')}</div>`).join('');
  abrirFolha('Escolher mês', `<p class="sub">Sobra de ${esc(nomeP(p))} em cada mês. O mês atual tem um traço embaixo.</p>${corpo}`, `<button type="button" class="btn" data-act="mes-hoje-f">Ir para hoje</button><button type="button" class="btn pri" data-act="fechar">Fechar</button>`);
}

/* metas */
function abrirMeta(id) {
  const mt = id ? S.metas.get(id) : null; const d = mt || { nome: '', tipo: 'meta', alvo: null, meses: 6, inicial: 0, prazo: mAdd(mNow(), 12), pessoa: 'casal' };
  S.sheet = { kind: 'meta', id: id || null };
  const ms = mesesOpcoes();
  abrirFolha(mt ? 'Editar meta' : 'Nova meta', `
    <div class="fld"><label for="m-nome">Nome</label><input id="m-nome" type="text" maxlength="60" value="${esc(d.nome)}" placeholder="Ex.: Viagem de férias, troca do carro"></div>
    <div class="fld"><span class="lbl">Tipo</span><div class="radios">${pill('m-tipo', 'meta', 'Valor definido', d.tipo)}${pill('m-tipo', 'reserva', 'Reserva de emergência', d.tipo)}</div></div>
    <div class="row2"><div class="fld" data-mt="meta"><label for="m-alvo">Valor da meta</label><input id="m-alvo" type="text" inputmode="decimal" value="${d.alvo ? esc(dec(d.alvo)) : ''}"></div><div class="fld" data-mt="reserva"><label for="m-meses">Meses de despesas essenciais</label><input id="m-meses" type="number" min="1" max="24" value="${d.meses || 6}"></div>
    <div class="fld"><label for="m-ini">Já guardado</label><input id="m-ini" type="text" inputmode="decimal" value="${esc(dec(d.inicial || 0))}"></div></div>
    <div class="row2"><div class="fld"><label for="m-prazo">Prazo</label><select id="m-prazo">${ms.map((k) => `<option value="${k}"${k === d.prazo ? ' selected' : ''}>${mShort(k)}</option>`).join('')}</select></div><div class="fld"><label for="m-pes">De quem</label><select id="m-pes">${['casal', 'p1', 'p2'].map((p) => `<option value="${p}"${p === (d.pessoa || 'casal') ? ' selected' : ''}>${esc(nomeP(p))}</option>`).join('')}</select></div></div>`,
    `${mt ? `<button type="button" class="btn dng esq" data-act="meta-excluir">${ic('lixo')} Excluir</button>` : ''}<button type="button" class="btn" data-act="fechar">Cancelar</button><button type="button" class="btn pri" data-act="salvar">Salvar</button>`);
  syncMeta();
}
function syncMeta() { const t = radio('m-tipo') || 'meta'; for (const el of $$('#sheet [data-mt]')) el.hidden = el.dataset.mt !== t; }
function salvarMeta() {
  const id = S.sheet.id || 'm' + uid(); const tipo = radio('m-tipo') || 'meta'; const nome = $('#m-nome').value.trim();
  const alvo = parseValor($('#m-alvo').value); const ini = $('#m-ini').value.trim() ? parseValor($('#m-ini').value) : 0;
  if (!nome) return erroFolha('Dê um nome para a meta.');
  if (tipo === 'meta' && !(alvo > 0)) return erroFolha('Digite o valor da meta.');
  if (!Number.isFinite(ini) || ini < 0) return erroFolha('O valor já guardado não pode ser negativo.');
  const ant = S.metas.get(id) || {};
  const doc = { ...ant, nome, tipo, alvo: tipo === 'meta' ? alvo : null, meses: clampInt($('#m-meses').value, 1, 24, 6), inicial: ini, prazo: $('#m-prazo').value, pessoa: $('#m-pes').value, ord: ant.ord || Date.now(), criado: ant.criado || new Date().toISOString() };
  fecharFolha(); dbSet('metas', id, doc).then(() => toast('Meta salva.')).catch(() => {});
}
async function excluirMeta() {
  const id = S.sheet.id; fecharFolha(); if (!id) return;
  try { for (const a of [...S.aportes.values()].filter((x) => x.meta === id)) await dbDel('aportes', a.id); await dbDel('metas', id); toast('Meta excluída.'); } catch { /* erro já avisado */ }
}
function abrirAporte(id) {
  const mt = S.metas.get(id); if (!mt) return; S.sheet = { kind: 'aporte', id };
  const ms = mesesOpcoes();
  abrirFolha(`Guardar em ${esc(mt.nome)}`, `
    <div class="fld"><span class="lbl">Movimento</span><div class="radios">${pill('a-tipo', 'in', 'Guardar', 'in')}${pill('a-tipo', 'out', 'Retirar', 'in')}</div></div>
    <div class="row2"><div class="fld"><label for="a-valor">Valor</label><input id="a-valor" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00"></div><div class="fld"><label for="a-mes">Mês</label><select id="a-mes">${ms.map((k) => `<option value="${k}"${k === S.month ? ' selected' : ''}>${mShort(k)}</option>`).join('')}</select></div></div>
    <div class="fld"><label for="a-obs">Observação</label><input id="a-obs" type="text" maxlength="80" placeholder="Ex.: CDB liquidez diária"></div>`,
    `<button type="button" class="btn" data-act="fechar">Cancelar</button><button type="button" class="btn pri" data-act="salvar">Salvar</button>`);
}
function salvarAporte() {
  const v = parseValor($('#a-valor').value); if (!(v > 0)) return erroFolha('Digite um valor maior que zero.');
  const sinal = radio('a-tipo') === 'out' ? -1 : 1;
  const doc = { meta: S.sheet.id, v: r2(v * sinal), m: $('#a-mes').value, obs: $('#a-obs').value.trim(), criado: new Date().toISOString(), por: S.eu || null };
  fecharFolha(); dbSet('aportes', 'a' + uid(), doc).then(() => toast(sinal > 0 ? 'Valor guardado na meta.' : 'Retirada registrada.')).catch(() => {});
}
function criarReserva() {
  dbSet('metas', 'reserva', { nome: 'Reserva de emergência', tipo: 'reserva', meses: cfg().regras.mesesReserva || 6, inicial: 0, prazo: mAdd(mNow(), 12), pessoa: 'casal', ord: 1, criado: new Date().toISOString() }).then(() => toast('Reserva criada.')).catch(() => {});
}

/* ================= exportação ================= */
function linhasPlanas() {
  const out = [['Mês', 'Descrição', 'Tipo', 'De quem', `Parte ${nomeP('p1')} (%)`, 'Categoria', 'Classe 50/30/20', 'Forma', 'Cartão', 'Parcela', 'Valor', 'Situação', 'Observação', 'Origem']];
  const ss = [...S.series.values()].sort(porOrdem);
  for (const m of horizonte()) for (const s of ss) {
    const v = val(s, m); if (!v) continue;
    const c = catDe(s.cat);
    out.push([mShort(m), s.desc, s.tipo === 'transf' ? 'Transferência' : s.tipo === 'receita' ? 'Receita' : 'Despesa', s.tipo === 'transf' ? `${nomeP(s.de)} → ${nomeP(s.para)}` : nomeP(s.pessoa), s.pessoa === 'casal' ? (s.div ?? 50) : (s.pessoa === 'p1' ? 100 : s.pessoa === 'p2' ? 0 : ''), c.nome, CLASSE[c.tipo] || '', (FORMAS.find((x) => x[0] === s.forma) || ['', ''])[1], cartaoDe(s.cartao)?.nome || '', parcLabel(s, m), r2(v), { pago: 'Pago', espera: 'Em espera', prev: 'Previsto' }[status(s, m)], s.obs || '', s.orig || '']);
  }
  return out;
}
async function baixar(nome, dados, tipoTexto) {
  if (!S.downloads) { if (typeof dados === 'string') mostrarTexto(nome, dados); else toast('Este visualizador não permite baixar arquivos.'); return; }
  try { await S.downloads.save({ filename: nome, data: dados }); toast('Arquivo pronto.'); }
  catch (e) {
    const c = e && e.code;
    if (c === 'declined') return;
    if (c === 'rate_limited') { toast('Aguarde um instante e tente de novo.'); return; }
    if (typeof dados === 'string' && tipoTexto) mostrarTexto(nome, dados); else toast('Não foi possível baixar aqui.');
  }
}
function mostrarTexto(nome, txt) {
  S.sheet = { kind: 'texto' };
  abrirFolha(`Copiar ${esc(nome)}`, `<p class="sub">Este visualizador não baixa arquivos. Copie o conteúdo e cole num arquivo ou no Excel.</p><textarea id="t-txt" class="inp" rows="10" readonly style="font-family:var(--f-num);font-size:12px">${esc(txt.slice(0, 400000))}</textarea>`, `<button type="button" class="btn" data-act="fechar">Fechar</button><button type="button" class="btn pri" data-act="copiar">Copiar</button>`);
}
function exportarCSV() {
  const linhas = linhasPlanas();
  const csv = '﻿' + linhas.map((r) => r.map((c) => { const s = typeof c === 'number' ? String(c).replace('.', ',') : String(c ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(';')).join('\r\n');
  baixar(`livro-caixa-lancamentos-${new Date().toISOString().slice(0, 10)}.csv`, csv, true);
}
function exportarJSON() {
  const dados = { app: 'livro-caixa-do-casal', versao: 1, exportadoEm: new Date().toISOString(), config: S.cfg ? limpo(S.cfg) : null, series: [...S.series.values()], metas: [...S.metas.values()], aportes: [...S.aportes.values()] };
  if (dados.config && JSON.stringify(dados.config.categorias) === JSON.stringify(CATS_PADRAO)) dados.config.categorias = null;
  baixar(`livro-caixa-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(dados, null, 1), true);
}
function carregarXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  const urls = ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'];
  return new Promise((ok, falha) => {
    let i = 0;
    const tenta = () => { const sc = document.createElement('script'); sc.src = urls[i]; sc.async = true; sc.onload = () => (window.XLSX ? ok(window.XLSX) : falha(new Error('xlsx'))); sc.onerror = () => { sc.remove(); i += 1; if (i < urls.length) tenta(); else falha(new Error('cdn')); }; document.head.appendChild(sc); };
    tenta();
  });
}
async function exportarXLSX() {
  toast('Montando a planilha…');
  let X; try { X = await carregarXLSX(); } catch { toast('Não foi possível carregar o gerador de Excel. Use o CSV.'); return; }
  const ms = horizonte(); const wb = X.utils.book_new(); const fmtR = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  const resumo = [['Mês', 'Receitas (casal)', 'Despesas (casal)', 'Sobra (casal)', 'Saldo acumulado (casal)', `Sobra ${nomeP('p1')}`, `Sobra ${nomeP('p2')}`, 'Parcelas de cartão (casal)', 'Acerto do mês']];
  const pc = projecao('casal'), p1 = projecao('p1'), p2 = projecao('p2');
  ms.forEach((m, i) => { const a = acerto(m); resumo.push([mShort(m), r2(pc[i].t.rec), r2(pc[i].t.desp), r2(pc[i].t.sobra), r2(pc[i].saldo), r2(p1[i].t.sobra), r2(p2[i].t.sobra), r2(pc[i].t.parcelas), a.liq > 0.004 ? `${nomeP('p2')} → ${nomeP('p1')} ${dec(a.liq)}` : a.liq < -0.004 ? `${nomeP('p1')} → ${nomeP('p2')} ${dec(-a.liq)}` : '']); });
  const grade = (p) => {
    const rows = [['Lançamento', 'Tipo', 'De quem', 'Categoria', 'Cartão', ...ms.map(mShort), 'Total']];
    for (const s of [...S.series.values()].sort(porOrdem)) {
      const f = s.tipo === 'transf' ? (p === 'casal' ? 0 : (s.para === p ? 1 : s.de === p ? -1 : 0)) : share(s, p); if (!f) continue;
      const vals = ms.map((m) => (val(s, m) && status(s, m) !== 'espera' ? r2(val(s, m) * f) : ''));
      if (!vals.some((x) => x !== '')) continue;
      rows.push([s.desc, s.tipo === 'transf' ? 'Transferência' : s.tipo === 'receita' ? 'Receita' : 'Despesa', s.tipo === 'transf' ? `${nomeP(s.de)} → ${nomeP(s.para)}` : nomeP(s.pessoa), catDe(s.cat).nome, cartaoDe(s.cartao)?.nome || '', ...vals, r2(vals.reduce((a, x) => a + (+x || 0), 0))]);
    }
    const tt = ms.map((m) => totals(m, p));
    rows.push([]); rows.push(['Total de receitas', '', '', '', '', ...tt.map((t) => r2(t.rec)), r2(tt.reduce((a, t) => a + t.rec, 0))]);
    rows.push(['Total de despesas', '', '', '', '', ...tt.map((t) => r2(t.desp)), r2(tt.reduce((a, t) => a + t.desp, 0))]);
    rows.push(['Sobra', '', '', '', '', ...tt.map((t) => r2(t.sobra)), r2(tt.reduce((a, t) => a + t.sobra, 0))]);
    return rows;
  };
  const add = (nome, aoa, larg) => { const ws = X.utils.aoa_to_sheet(aoa); for (const k of Object.keys(ws)) { if (k[0] === '!') continue; const c = ws[k]; if (c.t === 'n' && !/^A/.test(k) && !(nome === 'Lançamentos' && /^E\d/.test(k))) c.z = fmtR; } ws['!cols'] = larg; X.utils.book_append_sheet(wb, ws, nome.slice(0, 31)); };
  add('Resumo', resumo, [{ wch: 9 }, ...Array(8).fill({ wch: 18 })]);
  add('Casal', grade('casal'), [{ wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, ...ms.map(() => ({ wch: 11 })), { wch: 12 }]);
  add(nomeP('p1'), grade('p1'), [{ wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, ...ms.map(() => ({ wch: 11 })), { wch: 12 }]);
  add(nomeP('p2'), grade('p2'), [{ wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, ...ms.map(() => ({ wch: 11 })), { wch: 12 }]);
  add('Lançamentos', linhasPlanas(), [{ wch: 8 }, { wch: 28 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 26 }]);
  const buf = X.write(wb, { bookType: 'xlsx', type: 'array' });
  baixar(`livro-caixa-${new Date().toISOString().slice(0, 10)}.xlsx`, new Uint8Array(buf), false);
}
const qtd = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
async function restaurar(file) {
  let dados; try { dados = JSON.parse(await file.text()); } catch { toast('Arquivo inválido.'); return; }
  if (!dados || dados.app !== 'livro-caixa-do-casal' || !Array.isArray(dados.series)) { toast('Este arquivo não é um backup do Livro-Caixa.'); return; }
  S.sheet = { kind: 'restaurar', dados };
  abrirFolha('Restaurar backup', `<p>Substituir os dados atuais por este backup?</p><p class="sub">Backup de ${esc(String(dados.exportadoEm || '').slice(0, 10))}: ${qtd(dados.series.length, 'lançamento', 'lançamentos')}, ${qtd((dados.metas || []).length, 'meta', 'metas')} e ${qtd((dados.aportes || []).length, 'aporte', 'aportes')}. Os dados de agora serão apagados.</p><p class="hint" id="r-prog"></p>`,
    `<button type="button" class="btn" data-act="fechar">Cancelar</button><button type="button" class="btn dng" data-act="restaurar-ok">Substituir</button>`);
}
async function substituirTudo(dados) {
  const prog = (t) => { const el = $('#r-prog'); if (el) el.textContent = t; };
  const alvo = { series: new Map((dados?.series || []).filter((x) => x && x.id).map((x) => [x.id, x])), metas: new Map((dados?.metas || []).filter((x) => x && x.id).map((x) => [x.id, x])), aportes: new Map((dados?.aportes || []).filter((x) => x && x.id).map((x) => [x.id, x])) };
  const atuais = { series: S.series, metas: S.metas, aportes: S.aportes };
  const ops = [];
  for (const col of ['aportes', 'metas', 'series']) for (const id of atuais[col].keys()) if (!alvo[col].has(id)) ops.push(() => dbDel(col, id));
  for (const col of ['series', 'metas', 'aportes']) for (const [id, d] of alvo[col]) ops.push(() => dbSet(col, id, d));
  if (dados) { if (dados.config) ops.push(() => dbSet('config', 'app', dados.config)); }
  else if (S.cfgDoc) ops.push(() => dbDel('config', 'app'));
  let i = 0;
  for (const op of ops) { i += 1; prog(`Gravando ${i} de ${ops.length}…`); try { await op(); } catch { prog('Parou no meio. Tente de novo em alguns segundos.'); return false; } }
  return true;
}
function abrirApagar() {
  S.sheet = { kind: 'apagar' };
  abrirFolha('Apagar todos os dados', `<p>Apagar <b>todos</b> os lançamentos, metas e ajustes deste livro-caixa?</p><p class="sub">Isso vale para os dois. Baixe um backup antes, se quiser guardar uma cópia. Digite APAGAR para confirmar.</p><div class="fld"><label for="ap-c">Confirmação</label><input id="ap-c" type="text" autocomplete="off"></div><p class="hint" id="r-prog"></p>`,
    `<button type="button" class="btn" data-act="fechar">Cancelar</button><button type="button" class="btn dng" data-act="apagar-ok">Apagar tudo</button>`);
}

/* ================= interação ================= */
let toastT = null;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2600); }
async function toggleStatus(id, m) {
  const s = S.series.get(id); if (!s) return;
  const nxt = status(s, m) === 'pago' ? null : 'pago';
  try { await dbUpd('series', id, { st: { [m]: nxt } }); } catch { /* aviso já mostrado */ }
}
const ACTS = {
  nav: (el) => { S.view = el.dataset.v; store.set('view', S.view); try { history.replaceState(null, '', '#' + S.view); } catch { /* sem histórico */ } render(); window.scrollTo({ top: 0 }); $('#view').focus({ preventScroll: true }); },
  mes: (el) => { S.month = mAdd(S.month, +el.dataset.d); render(); },
  'mes-hoje': () => { S.month = mNow(); render(); },
  'mes-hoje-f': () => { S.month = mNow(); fecharFolha(); render(); },
  'mes-pick': () => abrirMeses(),
  'mes-set': (el) => { S.month = el.dataset.m; fecharFolha(); render(); },
  pessoa: (el) => { S.pessoa = el.dataset.p; store.set('pessoa', S.pessoa); render(); },
  sub: (el) => { S.sub[el.dataset.k] = el.dataset.v; store.set('sub', S.sub); render(); },
  filtro: (el) => { S.filtro = el.dataset.f; for (const b of $$('[data-act="filtro"]')) b.setAttribute('aria-pressed', String(b === el)); $('#lista').innerHTML = listaHTML(); },
  eu: (el) => { S.eu = el.dataset.p; store.set('eu', S.eu); render(); toast(`Neste aparelho: ${nomeP(S.eu)}.`); },
  tabela: (el) => { const id = el.dataset.id; S.tabelas[id] = !S.tabelas[id]; const t = $(`#tbl-${id}`); if (t) t.hidden = !S.tabelas[id]; el.setAttribute('aria-expanded', String(!!S.tabelas[id])); el.textContent = S.tabelas[id] ? 'Ocultar tabela' : 'Ver tabela'; },
  novo: () => abrirNovo(),
  editar: (el) => abrirEditar(el.dataset.id, el.dataset.m || S.month),
  cel: (el) => abrirCelula(el.dataset.id, el.dataset.m),
  'cel-completo': () => { const { id, m } = S.sheet; fecharFolha(); abrirEditar(id, m); },
  ck: (el) => toggleStatus(el.dataset.id, el.dataset.m || S.month),
  acerto: (el) => { const m = el.dataset.m; saveCfg({ acertos: { [m]: !cfg().acertos?.[m] } }).then(() => toast(cfg().acertos?.[m] ? 'Acerto marcado como feito.' : 'Acerto reaberto.')).catch(() => {}); },
  'ir-faturas': () => { S.view = 'lanc'; S.sub.lanc = 'faturas'; render(); window.scrollTo({ top: 0 }); },
  'ir-lanc': () => { S.view = 'lanc'; S.sub.lanc = 'lista'; S.filtro = 'prev'; render(); window.scrollTo({ top: 0 }); },
  fechar: () => fecharFolha(),
  salvar: () => {
    const k = S.sheet?.kind;
    if (k === 'novo') salvarNovo(); else if (k === 'editar') salvarEdicao(); else if (k === 'celula') salvarCelula();
    else if (k === 'meta') salvarMeta(); else if (k === 'aporte') salvarAporte();
  },
  excluir: () => abrirExcluir(),
  'excluir-mes': () => excluirMes(),
  'excluir-tudo': () => excluirTudo(),
  'meta-nova': () => abrirMeta(null),
  'meta-editar': (el) => abrirMeta(el.dataset.id),
  'meta-excluir': () => excluirMeta(),
  'meta-reserva': () => criarReserva(),
  aporte: (el) => abrirAporte(el.dataset.id),
  'sim-lancar': () => { const sm = lerSim(); if (!(sm.v > 0)) return; abrirNovo({ tipo: 'despesa', desc: '', valor: sm.vm === 'total' ? sm.v : sm.parcela, rep: 'parcelada', np: Math.max(2, sm.n), pa: 1, vm: sm.vm, mes: sm.mes, pessoa: sm.quem, forma: cfg().cartoes.length ? 'cartao' : 'pix', cat: 'compras' }); },
  'calc-lancar': () => {
    const r = calcValores(); const m = $('#ca-mes').value; const p = cfg().calcAssid.pessoa || 'p2';
    if (!(r.liq > 0)) { toast('Preencha os campos da calculadora.'); return; }
    const s = [...S.series.values()].find((x) => x.tipo === 'receita' && x.cat === 'assiduidade' && x.pessoa === p);
    if (s) dbUpd('series', s.id, { v: { [m]: r2(r.liq) } }).then(() => toast(`Assiduidade de ${mShort(m)} lançada: ${money(r.liq)}.`)).catch(() => {});
    else dbSet('series', 's' + uid(), { tipo: 'receita', desc: 'Assiduidade', pessoa: p, cat: 'assiduidade', forma: 'outro', cartao: null, parc: null, rec: false, v: { [m]: r2(r.liq) }, st: {}, obs: 'Calculada na calculadora de assiduidade.', ord: Date.now(), criado: new Date().toISOString() }).then(() => toast('Assiduidade lançada.')).catch(() => {});
  },
  'add-cartao': () => {
    const cs = clone(cfg().cartoes); const usadas = new Set(cs.map((c) => c.cor)); let cor = 1; while (usadas.has(cor) && cor < 5) cor += 1;
    cs.push({ id: 'c' + uid(), nome: `Cartão ${cs.length + 1}`, titular: S.eu || 'p1', venc: null, cor: usadas.has(cor) ? 0 : cor });
    saveCfg({ cartoes: cs }).then(() => toast('Cartão adicionado. Ajuste o nome e o titular.')).catch(() => {});
  },
  'rm-cartao': (el) => {
    const cs = clone(cfg().cartoes); const c = cs[+el.dataset.i]; if (!c) return;
    const n = [...S.series.values()].filter((s) => s.cartao === c.id).length;
    if (n) { toast(`${n} lançamentos usam ${c.nome}. Mude-os de cartão antes de remover.`); return; }
    cs.splice(+el.dataset.i, 1); saveCfg({ cartoes: cs }).then(() => toast('Cartão removido.')).catch(() => {});
  },
  'add-cat': (el) => { const cs = clone(cfg().categorias); cs.push({ id: 'c' + uid(), nome: el.dataset.t === 'R' ? 'Nova receita' : 'Nova categoria', tipo: el.dataset.t }); saveCfg({ categorias: cs }).then(() => toast('Categoria criada. Ajuste o nome.')).catch(() => {}); },
  'rm-cat': (el) => {
    const cs = clone(cfg().categorias); const c = cs[+el.dataset.i]; if (!c) return;
    const n = [...S.series.values()].filter((s) => s.cat === c.id).length;
    if (n) { toast(`${n} lançamentos usam “${c.nome}”. Troque a categoria deles antes.`); return; }
    if (c.id === 'outros') { toast('“A classificar” é usada como padrão e não pode ser removida.'); return; }
    cs.splice(+el.dataset.i, 1); saveCfg({ categorias: cs }).then(() => toast('Categoria removida.')).catch(() => {});
  },
  'exp-json': () => exportarJSON(),
  'exp-csv': () => exportarCSV(),
  'exp-xlsx': () => exportarXLSX(),
  restaurar: () => $('#f-restore').click(),
  'restaurar-ok': async (el) => { el.disabled = true; const ok = await substituirTudo(S.sheet.dados); if (ok) { fecharFolha(); toast('Backup restaurado.'); } else el.disabled = false; },
  apagar: () => abrirApagar(),
  'apagar-ok': async (el) => { if ($('#ap-c').value.trim().toUpperCase() !== 'APAGAR') { erroFolha('Digite APAGAR para confirmar.'); return; } el.disabled = true; const ok = await substituirTudo(null); if (ok) { fecharFolha(); toast('Dados apagados.'); } else el.disabled = false; },
  sair: () => { if (window.Backend?.sair) window.Backend.sair(); },
  regras: () => { if (window.Backend?.mostrarRegras) window.Backend.mostrarRegras(); },
  'cfg-firebase': () => { if (window.Backend?.trocarConfig) window.Backend.trocarConfig(); },
  copiar: () => { const t = $('#t-txt'); if (!t) return; const p = navigator.clipboard?.writeText(t.value); if (p) p.then(() => toast('Copiado.'), () => { t.select(); toast('Selecionado: use copiar do teclado.'); }); else { t.select(); toast('Selecionado: use copiar do teclado.'); } },
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled && ACTS[el.dataset.act]) { e.preventDefault(); ACTS[el.dataset.act](el, e); return; }
  const ch = e.target.closest('.chart[data-chart]');
  if (ch) {
    const sp = CH[ch.dataset.chart]; const i = idxDoPonteiro(ch, e); if (i == null || !sp) return;
    if (sp.pick && sp.data[i]) { S.month = sp.data[i].m; render(); return; }
    mostrarTip(ch, i, e.clientX, e.clientY);
  } else if (tipAtual) esconderTip();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!$('#sheet').hidden) { fecharFolha(); return; } esconderTip(); }
  const ch = e.target.closest && e.target.closest('.chart[data-chart]');
  if (ch && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ')) {
    const sp = CH[ch.dataset.chart]; if (!sp || !sp.data) return; e.preventDefault();
    let i = tipAtual && tipAtual.el === ch ? tipAtual.i : Math.max(0, sp.data.findIndex((x) => x.sel));
    if (e.key === 'ArrowLeft') i = Math.max(0, i - 1); else if (e.key === 'ArrowRight') i = Math.min(sp.data.length - 1, i + 1);
    else if (sp.pick) { S.month = sp.data[i].m; render(); $(`.chart[data-chart="${ch.dataset.chart}"]`)?.focus(); return; }
    mostrarTip(ch, i);
  }
  if (e.key === 'Enter' && e.target.closest && e.target.closest('#sh-form') && e.target.tagName === 'INPUT') { e.preventDefault(); ACTS.salvar(); }
});
document.addEventListener('focusin', (e) => { const ch = e.target.closest && e.target.closest('.chart[data-chart]'); if (ch && CH[ch.dataset.chart]?.data) { const sp = CH[ch.dataset.chart]; mostrarTip(ch, Math.max(0, sp.data.findIndex((x) => x.sel))); } });
document.addEventListener('focusout', (e) => { if (e.target.closest && e.target.closest('.chart[data-chart]')) esconderTip(); });
document.addEventListener('submit', (e) => { e.preventDefault(); ACTS.salvar(); });
let buscaT = null;
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'busca') { S.busca = t.value; clearTimeout(buscaT); buscaT = setTimeout(() => { const l = $('#lista'); if (l) l.innerHTML = listaHTML(); }, 120); return; }
  if (t.closest('#sheet')) { if (S.sheet?.kind === 'novo' || S.sheet?.kind === 'editar') syncLanc(); if (S.sheet?.kind === 'meta') syncMeta(); return; }
  if (t.id && t.id.startsWith('sim-')) { simAtualizar(); return; }
  if (t.dataset.calc) calcAtualizar();
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'f-restore') { const f = t.files && t.files[0]; t.value = ''; if (f) restaurar(f); return; }
  if (t.closest('#sheet')) { if (S.sheet?.kind === 'novo' || S.sheet?.kind === 'editar') syncLanc(); if (S.sheet?.kind === 'meta') syncMeta(); return; }
  if (t.id && t.id.startsWith('sim-')) { simAtualizar(); return; }
  if (!S.canWrite) return;
  if (t.dataset.cfg) {
    let v = t.value;
    if (t.dataset.tipo === 'valor') { v = parseValor(v || '0'); if (!Number.isFinite(v)) { toast('Valor inválido.'); return; } }
    else if (t.dataset.tipo === 'int') { v = clampInt(v, +t.min || 0, +t.max || 100, 0); }
    else if (typeof v === 'string') { v = v.trim(); if (!v) { toast('Este campo não pode ficar vazio.'); return; } }
    const patch = {}; let o = patch; const ks = t.dataset.cfg.split('.'); ks.forEach((k, i) => { if (i === ks.length - 1) o[k] = v; else { o[k] = {}; o = o[k]; } });
    saveCfg(patch).then(() => toast('Ajuste salvo.')).catch(() => {});
    return;
  }
  if (t.dataset.cartao !== undefined) {
    const cs = clone(cfg().cartoes); const c = cs[+t.dataset.cartao]; if (!c) return;
    const k = t.dataset.k; c[k] = k === 'venc' ? (t.value ? clampInt(t.value, 1, 31, null) : null) : t.value.trim() || c[k];
    saveCfg({ cartoes: cs }).then(() => toast('Cartão salvo.')).catch(() => {});
    return;
  }
  if (t.dataset.cat !== undefined) {
    const cs = clone(cfg().categorias); const c = cs[+t.dataset.cat]; if (!c) return;
    c[t.dataset.k] = t.value.trim() || c[t.dataset.k];
    saveCfg({ categorias: cs }).then(() => toast('Categoria salva.')).catch(() => {});
    return;
  }
  if (t.dataset.calc) {
    const r = calcValores();
    saveCfg({ calcAssid: { base: r.c.base, jornada: r.c.jornada, dias: r.c.dias, site: r.c.site, act: r.c.act, desconto: r.c.desconto } }).catch(() => {});
  }
});
let rsT = null;
addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => { esconderTip(); desenharGraficos(); if (S.view === 'metas' && S.sub.metas === 'simular') simAtualizar(); }, 150); });

/* ================= início ================= */
let iniciado = false;
function iniciar(dados) {
  if (iniciado) return; iniciado = true;
  const v = store.get('view', 'painel'); if (VIEWS[v]) S.view = v;
  const p = store.get('pessoa', 'casal'); if (['casal', 'p1', 'p2'].includes(p)) S.pessoa = p;
  const eu = store.get('eu', null); if (eu === 'p1' || eu === 'p2') S.eu = eu;
  const sub = store.get('sub', null); if (sub && typeof sub === 'object') Object.assign(S.sub, sub);
  if (dados && typeof dados === 'object') {
    if (VIEWS[dados.view]) S.view = dados.view;
    if (mValid(dados.month)) S.month = dados.month;
    if (['casal', 'p1', 'p2'].includes(dados.pessoa)) S.pessoa = dados.pessoa;
    if (dados.sub && typeof dados.sub === 'object') Object.assign(S.sub, dados.sub);
  }
  const h = location.hash.replace('#', '');
  if (VIEWS[h]) S.view = h;
  if (h === 'novo') S.abrirNovo = true;
  S.semInternet = navigator.onLine === false;
  addEventListener('online', () => { S.semInternet = false; render(); });
  addEventListener('offline', () => { S.semInternet = true; render(); });
  render();
  conectar();
}
if (window.LCC_TESTE) Object.assign(window.LCC_TESTE, { S, normCfg, totals, acerto, share, parcLabel, parseValor, projecao, faturas, liberacoes, parcelamentos, reservaAlvo, mAdd, mDiff, money });
else iniciar({});
})();
