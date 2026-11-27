// Adaptador de persistência na planilha Google (aba "Dados" do Apps Script).
// Mesma interface do adaptador local { ler, gravar, limpar, observarExterno }, para o store continuar
// síncrono: as telas trabalham sobre uma CÓPIA LOCAL (localStorage) e as mudanças vão para a planilha
// em segundo plano, por uma FILA que sobrevive a recarregar a página e a ficar sem internet.
//
// - gravar(estado): compara cada registro com a última versão conhecida e coloca na fila só o que mudou;
// - observarExterno(cb): a cada 15 s (e ao voltar para a janela) busca o que outros computadores mudaram;
// - conflito: vale a última gravação de cada registro; o que ainda está na fila deste computador não é
//   sobrescrito pelo que chega da planilha (será enviado em seguida).

const K_COPIA = 'simulflow.dados.planilha';
const K_META = 'simulflow.dados.planilha.meta';
const K_FILA = 'simulflow.dados.planilha.fila';
const SEP = '\u0001';
const ESPERAS = [2000, 5000, 15000, 30000, 60000];

const chave = (colecao, id) => colecao + SEP + id;

/** Mapa chave → JSON de todos os registros do estado (config como um registro só). */
export function indexarEstado(estado) {
  const m = new Map();
  if (!estado) return m;
  for (const [colecao, valor] of Object.entries(estado)) {
    if (colecao === 'config') { if (valor) m.set(chave('config', 'config'), JSON.stringify(valor)); continue; }
    if (!Array.isArray(valor)) continue;
    for (const r of valor) if (r && r.id) m.set(chave(colecao, r.id), JSON.stringify(r));
  }
  return m;
}

/** Diferenças entre o índice anterior e o estado novo: [{ colecao, id, registro|null }]. */
export function diferencas(base, estado) {
  const novo = indexarEstado(estado);
  const out = [];
  for (const [k, json] of novo) if (base.get(k) !== json) { const [colecao, id] = k.split(SEP); out.push({ colecao, id, registro: JSON.parse(json) }); }
  for (const k of base.keys()) if (!novo.has(k)) { const [colecao, id] = k.split(SEP); out.push({ colecao, id, registro: null }); }
  return { mudancas: out, indice: novo };
}

/** Aplica uma mudança vinda da planilha num estado (in-place). */
function aplicar(estado, { colecao, id, registro }) {
  if (colecao === 'config') { if (registro) estado.config = registro; return; }
  const lista = estado[colecao] || (estado[colecao] = []);
  const i = lista.findIndex(r => r.id === id);
  if (registro === null) { if (i >= 0) lista.splice(i, 1); }
  else if (i >= 0) lista[i] = registro;
  else lista.push(registro);
}

/**
 * opcoes:
 *  - url: URL da planilha (a cópia local é descartada se mudar de planilha)
 *  - chamar(acao, dados) → Promise<resposta> (lança erro com .status em falha)
 *  - armazenamento: localStorage (ou um objeto com getItem/setItem/removeItem nos testes)
 *  - intervaloMs: consulta de mudanças (padrão 15 s); agendar: setTimeout (testes podem trocar)
 */
export function criarAdaptadorPlanilha({ url = '', chamar, armazenamento = globalThis.localStorage, intervaloMs = 15000, agendar = setTimeout, cancelar = clearTimeout } = {}) {
  const lerJSON = (k, padrao) => { try { const v = armazenamento.getItem(k); return v ? JSON.parse(v) : padrao; } catch { return padrao; } };
  const gravarJSON = (k, v) => { try { armazenamento.setItem(k, JSON.stringify(v)); } catch { throw new Error('Armazenamento do navegador cheio: não foi possível guardar a cópia local dos dados.'); } };

  let meta = lerJSON(K_META, null);
  let copia = lerJSON(K_COPIA, null);
  let fila = lerJSON(K_FILA, []);
  if (!meta || meta.url !== url) { meta = { url, versao: 0, geracao: '' }; copia = null; fila = []; }
  let base = indexarEstado(copia);
  // A base é o que a planilha já tem; a cópia inclui o que ainda está na fila.
  for (const m of fila) base.delete(chave(m.colecao, m.id));

  let estado = { situacao: 'ok', pendentes: fila.length, mensagem: '' };
  const ouvintesEstado = new Set();
  let enviando = false, substituindo = false, tentativa = 0, timerEnvio = null, timerConsulta = null, aoMudarExterno = null, consultando = false;

  function salvar() {
    gravarJSON(K_COPIA, copia);
    gravarJSON(K_META, meta);
    gravarJSON(K_FILA, fila);
  }

  function situacao(s, mensagem = '') {
    estado = { situacao: s, pendentes: fila.length, mensagem };
    for (const fn of ouvintesEstado) { try { fn(estado); } catch (e) { console.error(e); } }
  }

  function enfileirar(mudancas) {
    if (!mudancas.length) return;
    const pos = new Map(fila.map((m, i) => [chave(m.colecao, m.id), i]));
    for (const m of mudancas) {
      const k = chave(m.colecao, m.id);
      if (pos.has(k)) fila[pos.get(k)] = m; else { pos.set(k, fila.length); fila.push(m); }
    }
  }

  async function enviar() {
    if (substituindo) return;
    if (enviando || !fila.length) { if (!fila.length && estado.situacao !== 'erro') situacao('ok'); return; }
    enviando = true;
    cancelar(timerEnvio); timerEnvio = null;
    const lote = fila.slice();
    situacao('sincronizando');
    try {
      await chamar('dados.gravar', { geracao: meta.geracao, mudancas: lote });
      // Tira da fila só o que não mudou de novo enquanto enviava.
      const enviados = new Map(lote.map(m => [chave(m.colecao, m.id), JSON.stringify(m.registro)]));
      fila = fila.filter(m => enviados.get(chave(m.colecao, m.id)) !== JSON.stringify(m.registro));
      for (const m of lote) { const k = chave(m.colecao, m.id); if (m.registro === null) base.delete(k); else base.set(k, JSON.stringify(m.registro)); }
      tentativa = 0;
      salvar();
      enviando = false;
      if (fila.length) return enviar();
      situacao('ok');
    } catch (e) {
      enviando = false;
      if (e.status === 409) { situacao('erro', 'Os dados da planilha foram substituídos em outro computador. Recarregue a página.'); return; }
      if (e.status === 401 || e.status === 403) { situacao('erro', e.message); return; }
      situacao('offline', 'Sem conexão com a planilha — as alterações estão guardadas neste computador e serão enviadas.');
      const espera = ESPERAS[Math.min(tentativa++, ESPERAS.length - 1)];
      timerEnvio = agendar(() => enviar(), espera);
    }
  }

  async function carregarTudo() {
    const r = await chamar('dados.tudo', {});
    const remoto = r.estado || {};
    base = indexarEstado(remoto);
    copia = remoto;
    meta = { url, versao: r.versao || 0, geracao: r.geracao || '' };
    // O que ainda estava na fila é reaplicado por cima (e enviado depois).
    for (const m of fila) aplicar(copia, m);
    salvar();
    return r;
  }

  /** Busca o que mudou em outros computadores. Devolve true se algo foi aplicado. */
  async function consultar() {
    if (consultando) return false;
    consultando = true;
    try {
      const r = await chamar('dados.mudancas', { desde: meta.versao, geracao: meta.geracao });
      if (r.recarregar) {
        fila = [];
        await carregarTudo();
        situacao('ok', 'Os dados da planilha foram substituídos em outro computador e foram recarregados.');
        return true;
      }
      const naFila = new Set(fila.map(m => chave(m.colecao, m.id)));
      let mudou = false;
      for (const m of r.mudancas || []) {
        const k = chave(m.colecao, m.id);
        const json = m.registro === null ? undefined : JSON.stringify(m.registro);
        if (m.registro === null) base.delete(k); else base.set(k, json);
        if (naFila.has(k)) continue;
        aplicar(copia, m);
        mudou = true;
      }
      meta.versao = Math.max(meta.versao, r.versao || 0);
      salvar();
      if (estado.situacao === 'offline') situacao(fila.length ? 'sincronizando' : 'ok');
      if (fila.length && !enviando) enviar();
      return mudou;
    } catch (e) {
      if (e.status === 401 || e.status === 403) situacao('erro', e.message);
      else if (estado.situacao !== 'erro') situacao('offline', 'Sem conexão com a planilha — mostrando a última cópia deste computador.');
      return false;
    } finally {
      consultando = false;
    }
  }

  function agendarConsulta() {
    cancelar(timerConsulta);
    timerConsulta = agendar(async () => {
      if (await consultar()) aoMudarExterno?.();
      agendarConsulta();
    }, intervaloMs);
  }

  return {
    nome: 'planilha',

    /** Primeira carga: busca tudo da planilha. Sem internet, segue com a cópia local (se houver). */
    async iniciar() {
      try {
        const r = await carregarTudo();
        const vazia = !Object.entries(r.estado || {}).some(([c, v]) => c !== 'config' && Array.isArray(v) && v.length);
        if (fila.length) enviar();
        return { online: true, vazia };
      } catch (e) {
        if (copia && !(e.status === 401 || e.status === 403)) {
          situacao('offline', 'Sem conexão com a planilha — mostrando a última cópia deste computador.');
          if (fila.length) enviar();
          return { online: false, vazia: false };
        }
        throw e;
      }
    },

    ler() {
      return copia ? JSON.parse(JSON.stringify(copia)) : null;
    },

    gravar(novo) {
      const { mudancas } = diferencas(indexarEstado(copia), novo);
      copia = JSON.parse(JSON.stringify(novo));
      if (!mudancas.length) return;
      enfileirar(mudancas);
      salvar();
      situacao('sincronizando');
      enviar();
    },

    /** Troca todos os dados (importar backup, limpar dados, primeira carga). */
    substituir(novo) {
      const enviado = JSON.parse(JSON.stringify(novo));
      copia = JSON.parse(JSON.stringify(novo));
      fila = []; // o que estava pendente foi substituído
      substituindo = true;
      salvar();
      situacao('sincronizando');
      return chamar('dados.substituir', { estado: enviado }).then(r => {
        base = indexarEstado(enviado);
        meta = { url, versao: r.versao || 0, geracao: r.geracao || '' };
      }).catch(e => {
        // Sem permissão para substituir (ou sem internet): manda como mudanças comuns,
        // sem sobrescrever o que foi alterado depois (já está na fila).
        const depois = fila;
        fila = [];
        enfileirar(diferencas(base, enviado).mudancas);
        enfileirar(depois);
        if (e.status === 403) situacao('sincronizando', 'Este computador não tem acesso admin: os dados serão enviados registro a registro.');
      }).finally(() => {
        substituindo = false;
        salvar();
        if (fila.length) enviar(); else situacao('ok');
      });
    },

    limpar() {
      for (const k of [K_COPIA, K_META, K_FILA]) { try { armazenamento.removeItem(k); } catch { /* sem acesso */ } }
      copia = null; fila = []; base = new Map(); meta = { url, versao: 0, geracao: '' };
    },

    observarExterno(callback) {
      aoMudarExterno = callback;
      agendarConsulta();
      const aoVoltar = () => { if (globalThis.document?.visibilityState === 'visible') consultar().then(m => m && callback()); };
      globalThis.document?.addEventListener?.('visibilitychange', aoVoltar);
      const aoReconectar = () => { enviar(); consultar().then(m => m && callback()); };
      globalThis.addEventListener?.('online', aoReconectar);
      return () => {
        cancelar(timerConsulta); aoMudarExterno = null;
        globalThis.document?.removeEventListener?.('visibilitychange', aoVoltar);
        globalThis.removeEventListener?.('online', aoReconectar);
      };
    },

    // ---- para a interface e os testes ----
    consultar,
    enviar,
    pendentes: () => fila.length,
    estadoSincronia: () => estado,
    aoMudarEstado(fn) { ouvintesEstado.add(fn); fn(estado); return () => ouvintesEstado.delete(fn); },
  };
}
