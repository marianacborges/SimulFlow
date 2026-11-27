// Adaptador da planilha (js/data/adapters/planilha.js) contra o Apps Script real rodando no Google falso:
// dois "computadores" com o mesmo store, fila sem internet, mudanças remotas e substituição.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarAppsScript } from '../apps-script/testes/google-falso.js';
import { criarAdaptadorPlanilha, diferencas, indexarEstado } from '../js/data/adapters/planilha.js';
import { criarStore } from '../js/data/store.js';

function memoria() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}

function rede(g, token) {
  const r = { fora: false, chamadas: [] };
  r.chamar = async (acao, dados = {}) => {
    r.chamadas.push(acao);
    if (r.fora) { const e = new Error('Sem conexão com a planilha Google'); e.status = 'rede'; throw e; }
    const j = g.api(acao, dados, token);
    if (!j.ok) { const e = new Error(j.erro); e.status = j.status; throw e; }
    return j;
  };
  return r;
}

const agendarManual = () => { const t = []; return { agendar: (fn, ms) => { t.push({ fn, ms }); return t.length; }, cancelar: () => {}, timers: t }; };
const esperar = () => new Promise(r => setTimeout(r, 0));

async function computador(g, token, armazenamento = memoria()) {
  const net = rede(g, token);
  const relogio = agendarManual();
  const ad = criarAdaptadorPlanilha({ url: 'https://exemplo/exec', chamar: net.chamar, armazenamento, agendar: relogio.agendar, cancelar: relogio.cancelar });
  const ini = await ad.iniciar();
  const store = criarStore(ad);
  store.carregar();
  return { ad, store, net, ini, armazenamento, relogio };
}

test('diferenças: só o que mudou, exclusões e config', () => {
  const base = indexarEstado({ ops: [{ id: 'a', x: 1 }, { id: 'b', x: 2 }], config: { p: 1 } });
  const { mudancas } = diferencas(base, { ops: [{ id: 'a', x: 1 }, { id: 'c', x: 3 }], config: { p: 2 } });
  assert.deepEqual(mudancas.map(m => `${m.colecao}:${m.id}:${m.registro === null ? 'x' : 'ok'}`).sort(), ['config:config:ok', 'ops:b:x', 'ops:c:ok']);
});

test('dois computadores: o que um grava o outro recebe; a cópia local permite abrir sem internet', async () => {
  const g = carregarAppsScript({ agora: '2026-11-27T09:00:00-03:00' });
  const tokA = g.criarToken('PC A', 'admin'), tokB = g.criarToken('PC B', 'sistema');
  const A = await computador(g, tokA);
  assert.equal(A.ini.vazia, true);
  A.store.transacao(s => s.inserir('ops', { id: 'op-1', numero: 'OP-1', status: 'Em andamento' }));
  await esperar();
  assert.equal(A.ad.pendentes(), 0);
  const B = await computador(g, tokB);
  assert.equal(B.ini.vazia, false);
  assert.equal(B.store.obter('ops', 'op-1').numero, 'OP-1');
  // B altera; A recebe na próxima consulta.
  B.store.transacao(s => s.atualizar('ops', 'op-1', { status: 'Concluída' }));
  await esperar();
  assert.equal(await A.ad.consultar(), true);
  A.store.recarregar();
  assert.equal(A.store.obter('ops', 'op-1').status, 'Concluída');
  // A sem internet: a gravação fica na fila e a tela já mostra a mudança.
  A.net.fora = true;
  A.store.transacao(s => s.inserir('fas', { id: 'fa-1', numero: 'FA-001' }));
  await esperar();
  assert.equal(A.ad.pendentes(), 1);
  assert.equal(A.ad.estadoSincronia().situacao, 'offline');
  assert.ok(A.relogio.timers.length > 0, 'agendou nova tentativa');
  // Recarregar a página sem internet: abre com a cópia local, inclusive a FA pendente.
  const A2 = await computador(g, tokA, A.armazenamento);
  assert.equal(A2.ini.online, true); // A2 tem rede própria (online)
  const offline = rede(g, tokA); offline.fora = true;
  const ad3 = criarAdaptadorPlanilha({ url: 'https://exemplo/exec', chamar: offline.chamar, armazenamento: A.armazenamento, ...agendarManual() });
  assert.equal((await ad3.iniciar()).online, false);
  assert.equal(criarStore(ad3).carregar(), true);
  // Volta a internet: a fila é enviada e B recebe a FA.
  A.net.fora = false;
  await A.ad.enviar();
  assert.equal(A.ad.pendentes(), 0);
  await B.ad.consultar(); B.store.recarregar();
  assert.equal(B.store.obter('fas', 'fa-1').numero, 'FA-001');
});

test('mudança remota não apaga o que ainda está na fila local', async () => {
  const g = carregarAppsScript({ agora: '2026-11-27T09:00:00-03:00' });
  const tokA = g.criarToken('PC A', 'admin'), tokB = g.criarToken('PC B', 'sistema');
  const A = await computador(g, tokA);
  A.store.transacao(s => s.inserir('ops', { id: 'op-1', numero: 'OP-1', produto: 'Eixo' }));
  await esperar();
  const B = await computador(g, tokB);
  A.net.fora = true;
  A.store.transacao(s => s.atualizar('ops', 'op-1', { produto: 'Eixo A' }));
  B.store.transacao(s => s.atualizar('ops', 'op-1', { produto: 'Eixo B' }));
  await esperar();
  A.net.fora = false;
  await A.ad.consultar(); A.store.recarregar();
  assert.equal(A.store.obter('ops', 'op-1').produto, 'Eixo A', 'a alteração local pendente continua valendo');
  await A.ad.enviar();
  await B.ad.consultar(); B.store.recarregar();
  assert.equal(B.store.obter('ops', 'op-1').produto, 'Eixo A', 'vale a última gravação');
});

test('substituir (importar/limpar): admin troca tudo; os outros recarregam; sem admin vai registro a registro', async () => {
  const g = carregarAppsScript({ agora: '2026-11-27T09:00:00-03:00' });
  const tokA = g.criarToken('PC A', 'admin'), tokB = g.criarToken('PC B', 'sistema');
  const A = await computador(g, tokA);
  A.store.substituir({ ops: [{ id: 'op-1', numero: 'OP-1' }, { id: 'op-2', numero: 'OP-2' }], usuarios: [{ id: 'u1', login: 'host' }] });
  await esperar(); await esperar();
  const B = await computador(g, tokB);
  assert.equal(B.store.todos('ops').length, 2);
  A.store.substituir({ ops: [{ id: 'op-9', numero: 'OP-9' }], usuarios: [{ id: 'u1', login: 'host' }] });
  await esperar(); await esperar();
  assert.equal(await B.ad.consultar(), true);
  B.store.recarregar();
  assert.deepEqual(B.store.todos('ops').map(o => o.numero), ['OP-9']);
  // B (sistema) não pode substituir: as mudanças vão como gravações comuns.
  B.store.substituir({ ops: [], usuarios: [{ id: 'u1', login: 'host' }] });
  await esperar(); await esperar(); await esperar();
  assert.equal(B.ad.pendentes(), 0);
  await A.ad.consultar(); A.store.recarregar();
  assert.deepEqual(A.store.todos('ops'), []);
});
