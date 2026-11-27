// Simulação mínima dos serviços do Google Apps Script (SpreadsheetApp, Utilities, LockService...)
// para rodar os arquivos .gs no Node: usada pelos testes e pelo emulador (node tools/simulflow.js emular-planilha).
// Imita a conversão automática do Google Planilhas: em células sem formato texto ("@"),
// "2026-11-26" vira data, "00123" vira número 123 e "TRUE" vira booleano.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PASTA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ARQUIVOS_GS = ['Config.gs', 'Dominio.gs', 'Planilha.gs', 'Resumo.gs', 'Api.gs', 'Menu.gs'];

function formatar(data, fuso, padrao) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(data)).map(x => [x.type, x.value]));
  const mapa = { yyyy: p.year, MM: p.month, dd: p.day, HH: String(Number(p.hour) % 24).padStart(2, '0'), mm: p.minute, ss: p.second };
  return padrao.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (m, lit) => (lit !== undefined ? lit : mapa[m]));
}

function criarServicos(DataCtx, estado) {
  class Protecao {
    constructor() { this.descricao = ''; }
    setDescription(d) { this.descricao = d; return this; }
    addEditor() { return this; }
    removeEditors() { return this; }
    getEditors() { return []; }
    canDomainEdit() { return true; }
    setDomainEdit() { return this; }
  }

  class Intervalo {
    constructor(aba, linha, coluna, nLinhas, nColunas) { Object.assign(this, { aba, linha, coluna, nLinhas, nColunas }); }
    celulas(fn) {
      for (let i = 0; i < this.nLinhas; i++) for (let j = 0; j < this.nColunas; j++) fn(this.linha + i, this.coluna + j, i, j);
    }
    getValues() {
      const out = Array.from({ length: this.nLinhas }, () => Array(this.nColunas).fill(''));
      this.celulas((r, c, i, j) => { const cel = this.aba.celulas.get(`${r},${c}`); out[i][j] = cel ? cel.v : ''; });
      return out;
    }
    getValue() { return this.getValues()[0][0]; }
    setValues(vals) {
      if (vals.length !== this.nLinhas || vals.some(l => l.length !== this.nColunas)) throw new Error(`Dimensões incorretas: esperado ${this.nLinhas}x${this.nColunas}`);
      this.celulas((r, c, i, j) => {
        const cel = this.aba.celulas.get(`${r},${c}`) || {};
        let v = vals[i][j];
        if (cel.fmt !== '@' && typeof v === 'string') {
          if (/^\d{4}-\d{2}-\d{2}$/.test(v)) v = new DataCtx(v + 'T12:00:00Z');
          else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
          else if (/^(TRUE|FALSE)$/i.test(v)) v = v.toUpperCase() === 'TRUE';
        }
        this.aba.celulas.set(`${r},${c}`, { ...cel, v });
        this.aba.ultimaLinha = Math.max(this.aba.ultimaLinha, v === '' ? 0 : r);
      });
      this.aba.maxLinhas = Math.max(this.aba.maxLinhas, this.linha + this.nLinhas - 1);
      return this;
    }
    setValue(v) { return this.setValues([[v]]); }
    setNumberFormat(f) {
      this.celulas((r, c) => { const cel = this.aba.celulas.get(`${r},${c}`) || { v: '' }; this.aba.celulas.set(`${r},${c}`, { ...cel, fmt: f }); });
      return this;
    }
    setFontWeight() { return this; }
    setFormula(f) { const cel = this.aba.celulas.get(`${this.linha},${this.coluna}`) || { v: '' }; this.aba.celulas.set(`${this.linha},${this.coluna}`, { ...cel, formula: f }); return this; }
    getFormula() { return this.aba.celulas.get(`${this.linha},${this.coluna}`)?.formula || ''; }
  }

  class Aba {
    constructor(nome) { this.nome = nome; this.celulas = new Map(); this.ultimaLinha = 0; this.maxLinhas = 1000; this.protecoes = []; this.congeladas = 0; }
    getName() { return this.nome; }
    getLastRow() { return this.ultimaLinha; }
    getMaxRows() { return this.maxLinhas; }
    getRange(linha, coluna, nLinhas = 1, nColunas = 1) {
      if (typeof linha !== 'number' || linha < 1 || coluna < 1 || nLinhas < 1 || nColunas < 1) throw new Error('Intervalo inválido');
      return new Intervalo(this, linha, coluna, nLinhas, nColunas);
    }
    setFrozenRows(n) { this.congeladas = n; return this; }
    deleteColumn(col) {
      const novas = new Map();
      for (const [k, cel] of this.celulas) {
        const [r, c] = k.split(',').map(Number);
        if (c !== col) novas.set(`${r},${c > col ? c - 1 : c}`, cel);
      }
      this.celulas = novas;
      return this;
    }
    protect() { const p = new Protecao(); this.protecoes.push(p); return p; }
    getProtections() { return this.protecoes; }
    /** Auxiliar de teste: linhas como arrays (sem cabeçalho). */
    _linhas() { return this.ultimaLinha < 2 ? [] : this.getRange(2, 1, this.ultimaLinha - 1, 12).getValues(); }
  }

  class Planilha {
    constructor() { this.abas = []; this.fuso = 'America/Sao_Paulo'; }
    getSheetByName(n) { return this.abas.find(a => a.nome === n) || null; }
    insertSheet(n, indice) { if (this.getSheetByName(n)) throw new Error('Aba já existe: ' + n); const a = new Aba(n); if (indice === 0) this.abas.unshift(a); else this.abas.push(a); return a; }
    getSheets() { return this.abas; }
    getId() { return 'planilha-falsa'; }
    getUrl() { return 'https://docs.google.com/spreadsheets/d/planilha-falsa/edit'; }
    setSpreadsheetTimeZone(f) { this.fuso = f; }
    getSpreadsheetTimeZone() { return this.fuso; }
  }

  const planilha = estado.planilha || new Planilha();
  estado.planilha = planilha;
  const propriedades = new Map();
  const gatilhos = estado.gatilhos || (estado.gatilhos = []);

  return {
    planilha,
    globais: {
      SpreadsheetApp: {
        getActiveSpreadsheet: () => planilha,
        openById: () => planilha,
        flush: () => {},
        ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
        getUi: () => ({ alert: () => {}, prompt: () => ({ getSelectedButton: () => 'CANCEL', getResponseText: () => '' }), ButtonSet: {}, Button: { OK: 'OK', YES: 'YES' }, createMenu: () => { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => {} }; return m; } }),
      },
      Utilities: {
        formatDate: formatar,
        DigestAlgorithm: { SHA_256: 'sha256' },
        Charset: { UTF_8: 'utf8' },
        computeDigest: (alg, texto) => [...crypto.createHash(alg).update(String(texto), 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)),
        getUuid: () => crypto.randomUUID(),
      },
      LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
      ContentService: {
        MimeType: { JSON: 'application/json' },
        createTextOutput: s => ({ conteudo: s, tipo: 'text/plain', setMimeType(t) { this.tipo = t; return this; }, getContent() { return this.conteudo; } }),
      },
      PropertiesService: { getScriptProperties: () => ({ getProperty: k => propriedades.get(k) ?? null, setProperty: (k, v) => propriedades.set(k, v) }) },
      Session: { getEffectiveUser: () => ({ getEmail: () => 'dono@exemplo.com' }), getActiveUser: () => ({ getEmail: () => 'dono@exemplo.com' }) },
      ScriptApp: {
        getProjectTriggers: () => gatilhos.map(g => ({ getHandlerFunction: () => g.funcao, _g: g })),
        deleteTrigger: t => { const i = gatilhos.indexOf(t._g); if (i >= 0) gatilhos.splice(i, 1); },
        newTrigger: funcao => ({ timeBased: () => ({ everyMinutes: n => ({ create: () => { gatilhos.push({ funcao, minutos: n }); } }) }) }),
      },
      Logger: { log: () => {} },
      MailApp: {
        sendEmail: o => { if (estado.falharEmail) throw new Error('Cota de e-mail esgotada'); (estado.emails || (estado.emails = [])).push(o); },
        getRemainingDailyQuota: () => 100,
      },
    },
  };
}

/**
 * Carrega os .gs num contexto isolado. Retorna helpers:
 *  - relogio.definir('2026-11-26T08:00:00-03:00')
 *  - api(acao, dados, token) → resposta JSON do doPost
 *  - criarToken(nome, perfil) → token em texto claro
 */
export function carregarAppsScript({ agora = new Date(), estado = {}, relogioReal = false, arquivos = ARQUIVOS_GS } = {}) {
  const ctx = vm.createContext({ console });
  const DataCtx = vm.runInContext('Date', ctx);
  const { planilha, globais } = criarServicos(DataCtx, estado);
  Object.assign(ctx, globais);
  for (const arq of arquivos) vm.runInContext(fs.readFileSync(path.join(PASTA, arq), 'utf8'), ctx, { filename: arq });
  // Relógio fixo (testes) ou real com deslocamento opcional (emulador).
  let atual = new Date(agora);
  let deslocamento = 0;
  ctx.agoraAtual = () => new DataCtx(relogioReal ? Date.now() + deslocamento : atual.getTime());
  const relogio = {
    definir: v => { if (relogioReal) deslocamento = new Date(v).getTime() - Date.now(); else atual = new Date(v); },
    real: () => { deslocamento = 0; },
    agora: () => new Date(relogioReal ? Date.now() + deslocamento : atual.getTime()),
  };
  const api = (acao, dados = {}, token) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ acao, token, ...dados }) } }).getContent());
  const criarToken = (nome, perfil) => ctx.comTrava(() => ctx.criarAcesso(ctx.criarRepo(), nome, perfil)).token;
  return { ctx, planilha, relogio, api, criarToken, estado };
}
