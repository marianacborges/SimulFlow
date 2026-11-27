// Store: modelo em memória + persistência por adaptador (localStorage por padrão).
// As telas só LEEM do store; toda gravação passa por js/data/acoes/* (validação,
// permissão, auditoria) dentro de store.transacao(), que é atômica: se algo falhar,
// nada é gravado.
import { uid, agoraISO, clonar } from '../core/util.js';

export const VERSAO_DADOS = 1;

export const COLECOES = [
  'usuarios', 'obras', 'pedidos', 'etapas', 'atribuicoes', 'ciclos', 'itens', 'ops', 'fas',
  'materiais', 'eventos', 'auditoria', 'tiposEnsaio', 'ensaios', 'extras', 'efetivo',
];

export function configPadrao() {
  return {
    politicas: { quantidade: 'opcional', efetivo: 'opcional' },
    dashboardMaxDias: null,
    contadores: { fa: 0 },
  };
}

function estadoVazio() {
  const e = { versao: VERSAO_DADOS, config: configPadrao() };
  for (const c of COLECOES) e[c] = [];
  return e;
}

export function criarStore(adaptador) {
  let estado = estadoVazio();
  let emTransacao = 0;
  let sujo = false;
  const ouvintes = new Set();

  function notificar() {
    for (const fn of ouvintes) { try { fn(); } catch (e) { console.error(e); } }
  }

  function persistir() {
    adaptador.gravar(estado);
  }

  function normalizar(dados) {
    const e = estadoVazio();
    for (const c of COLECOES) e[c] = Array.isArray(dados?.[c]) ? dados[c] : [];
    // O cadastro de usuários não guarda mais e-mail: descarta o de versões anteriores.
    e.usuarios = e.usuarios.map(u => { if (!u || !('email' in u)) return u; const { email, ...resto } = u; return resto; });
    e.config = { ...configPadrao(), ...(dados?.config || {}) };
    e.config.politicas = { ...configPadrao().politicas, ...(dados?.config?.politicas || {}) };
    e.config.contadores = { ...configPadrao().contadores, ...(dados?.config?.contadores || {}) };
    return e;
  }

  const store = {
    adaptador,
    carregar() {
      const lido = adaptador.ler();
      estado = lido ? normalizar(lido) : estadoVazio();
      return !!lido;
    },
    vazio() {
      return COLECOES.filter(c => c !== 'usuarios' && c !== 'auditoria').every(c => estado[c].length === 0);
    },
    todos(colecao) {
      return estado[colecao] || [];
    },
    obter(colecao, id) {
      if (!id) return undefined;
      return (estado[colecao] || []).find(r => r.id === id);
    },
    achar(colecao, fn) {
      return (estado[colecao] || []).find(fn);
    },
    filtrar(colecao, fn) {
      return (estado[colecao] || []).filter(fn);
    },
    get config() {
      return estado.config;
    },
    inserir(colecao, registro) {
      exigirTransacao();
      const novo = { id: registro.id || uid(), criadoEm: registro.criadoEm || agoraISO(), ...registro };
      estado[colecao].push(novo);
      sujo = true;
      return novo;
    },
    atualizar(colecao, id, parcial) {
      exigirTransacao();
      const r = store.obter(colecao, id);
      if (!r) throw new Error('Registro não encontrado');
      Object.assign(r, parcial, { atualizadoEm: agoraISO() });
      sujo = true;
      return r;
    },
    definirConfig(parcial) {
      exigirTransacao();
      Object.assign(estado.config, parcial);
      sujo = true;
    },
    /** Executa fn de forma atômica: em caso de erro, o estado volta ao anterior. */
    transacao(fn) {
      const fotografia = emTransacao === 0 ? clonar(estado) : null;
      emTransacao++;
      try {
        const r = fn(store);
        if (r && typeof r.then === 'function') throw new Error('Transações devem ser síncronas');
        emTransacao--;
        if (emTransacao === 0 && sujo) { persistir(); sujo = false; notificar(); }
        return r;
      } catch (e) {
        emTransacao--;
        if (fotografia) { estado = fotografia; sujo = false; }
        throw e;
      }
    },
    assinar(fn) {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    },
    /** Recarrega do adaptador (ex.: outra aba do navegador gravou). */
    recarregar() {
      store.carregar();
      notificar();
    },
    /**
     * Mescla contas vindas de fora (planilha) sem mexer nas datas: por login, vale o registro mais novo
     * (atualizadoEm, ou criadoEm). Devolve quantas mudaram.
     */
    mesclarUsuarios(lista) {
      const ts = u => String(u?.atualizadoEm || u?.criadoEm || '');
      const chave = u => String(u?.login || '').trim().toLowerCase();
      let mudou = 0;
      for (const r of Array.isArray(lista) ? lista : []) {
        if (!r?.id || !chave(r) || !r.credencial) continue;
        if ('email' in r) { r = { ...r }; delete r.email; }
        const i = estado.usuarios.findIndex(u => chave(u) === chave(r) || u.id === r.id);
        if (i < 0) { estado.usuarios.push(clonar(r)); mudou++; }
        else if (ts(r) > ts(estado.usuarios[i])) { estado.usuarios[i] = clonar(r); mudou++; }
      }
      if (mudou) { persistir(); notificar(); }
      return mudou;
    },
    exportar() {
      return { formato: 'simulflow-backup', versao: VERSAO_DADOS, exportadoEm: agoraISO(), dados: clonar(estado) };
    },
    /** Valida e substitui todos os dados. */
    importar(pacote) {
      const dados = validarBackup(pacote);
      estado = normalizar(dados);
      persistir();
      notificar();
    },
    substituir(dados) {
      estado = normalizar(dados);
      persistir();
      notificar();
    },
    estadoBruto() {
      return estado;
    },
  };

  function exigirTransacao() {
    if (emTransacao === 0) throw new Error('Gravação fora de transação');
  }

  return store;
}

export function validarBackup(pacote) {
  if (!pacote || typeof pacote !== 'object') throw new Error('Arquivo inválido');
  if (pacote.formato !== 'simulflow-backup' || typeof pacote.dados !== 'object') throw new Error('Este arquivo não é um backup do SimulFlow');
  if (Number(pacote.versao) > VERSAO_DADOS) throw new Error('Backup de uma versão mais nova do SimulFlow');
  for (const c of COLECOES) {
    if (pacote.dados[c] !== undefined && !Array.isArray(pacote.dados[c])) throw new Error(`Coleção "${c}" inválida no backup`);
  }
  if (!Array.isArray(pacote.dados.usuarios) || !pacote.dados.usuarios.some(u => u.host && u.ativo)) {
    throw new Error('O backup precisa conter ao menos um usuário host ativo');
  }
  return pacote.dados;
}
