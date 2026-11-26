// Cálculos puros do Dashboard filtrado (período, status, obra, etapa, tipo de ensaio).
import { hoje, somarDias, numero, dataHora } from '../core/util.js';
import { percentual, statusItem, gargalo, motivosBloqueio, STATUS_ITEM, STATUS_EXTRA } from './regras.js';

export const STATUS_ENSAIO_FILTRO = ['solicitado', 'em execução', 'aguardando NII', 'aguardando NIII', 'aprovado', 'reprovado'];
export const statusRotulo = s => s === 'aguardando NII' ? 'aguardando verificação NII' : s === 'aguardando NIII' ? 'aguardando verificação NIII' : s;
export { STATUS_ITEM, STATUS_EXTRA };

const dataBR = v => v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—';

/** Atalhos de período. "ciclo" = união dos ciclos ativos hoje (ou hoje, se não houver). */
export function periodo(preset, ciclos, dia = hoje(), obras = []) {
  if (preset === 'hoje') return { inicio: dia, fim: dia };
  if (preset === '7' || preset === '30') return { inicio: somarDias(dia, 1 - Number(preset)), fim: dia };
  const ativos = ciclos.filter(c => c.inicio <= dia && c.fim >= dia && c.status !== 'encerrado' && (!obras.length || obras.includes(c.obraId)));
  return ativos.length ? { inicio: ativos.map(c => c.inicio).sort()[0], fim: ativos.map(c => c.fim).sort().at(-1) } : { inicio: dia, fim: dia };
}

export function filtrosPadrao(ciclos, dia = hoje()) {
  return { ...periodo('ciclo', ciclos, dia), statusItem: [], statusEnsaio: [], statusExtra: [], obras: [], etapa: '', tipo: '', preset: 'ciclo' };
}

export function erroPeriodo(f, maxDias = null) {
  const ok = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
  if (!ok(f.inicio) || !ok(f.fim)) return 'Informe as duas datas válidas.';
  if (f.fim < f.inicio) return 'Data final não pode ser anterior à data inicial.';
  const dias = (Date.parse(f.fim) - Date.parse(f.inicio)) / 86400000 + 1;
  if (maxDias && dias > maxDias) return `O período ultrapassa o limite configurado de ${maxDias} dias.`;
  return '';
}

const diaDe = v => String(v).includes('T') ? hoje(new Date(v)) : String(v).slice(0, 10);
export const noPeriodo = (v, f) => !!v && diaDe(v) >= f.inicio && diaDe(v) <= f.fim;
const sel = (lista, v) => !lista.length || lista.includes(v);

/**
 * Monta indicadores, alertas, movimentações e atrasos fora do período.
 * d = { obras, etapas, ciclos, itens, ensaios, tipos, extras, eventos, auditoria } — já restritos às obras autorizadas.
 */
export function montarPainel(d, f, dia = hoje(), agora = Date.now()) {
  const nomeObra = id => d.obras.find(o => o.id === id)?.nome || 'Obra';
  const status = i => statusItem(i, d.ciclos.find(c => c.id === i.cicloId), d.ensaios, dia, d.extras, agora);
  const obrasAtivas = new Set(d.obras.filter(o => !o.arquivado && !o.parentId).map(o => o.id));
  const escopo = i => !i.arquivado && obrasAtivas.has(i.obraId) && sel(f.obras, i.obraId) && (!f.etapa || i.etapaId === f.etapa) && sel(f.statusItem, status(i)) &&
    (!f.tipo || d.ensaios.some(e => e.itemId === i.id && e.tipoId === f.tipo)) &&
    (!f.statusEnsaio.length || d.ensaios.some(e => e.itemId === i.id && sel(f.statusEnsaio, e.status) && (!f.tipo || e.tipoId === f.tipo))) &&
    (!f.statusExtra.length || d.extras.some(x => x.itemId === i.id && sel(f.statusExtra, x.status)));
  const noEscopo = d.itens.filter(escopo);
  const ids = new Set(noEscopo.map(i => i.id));
  const itens = noEscopo.filter(i => noPeriodo(i.prazo, f));
  const ensaios = d.ensaios.filter(e => ids.has(e.itemId) && (!f.tipo || e.tipoId === f.tipo) && sel(f.statusEnsaio, e.status) && noPeriodo(e.solicitadoEm, f));
  const extras = d.extras.filter(x => ids.has(x.itemId) && sel(f.statusExtra, x.status) && (!f.etapa || !x.etapaId || x.etapaId === f.etapa) && noPeriodo(x.prazo, f));
  const avancos = itens.map(i => percentual(i, extras));
  const foraDoPeriodo = noEscopo.filter(i => i.prazo < dia && percentual(i, d.extras) < 100 && !noPeriodo(i.prazo, f));

  const entidade = id => {
    const e = d.ensaios.find(x => x.id === id), x = d.extras.find(y => y.id === id);
    const i = d.itens.find(y => y.id === (e?.itemId || x?.itemId || id));
    return { i, e, x };
  };
  const combina = id => {
    const { i, e, x } = entidade(id);
    if (!i || !ids.has(i.id)) return false;
    if (e) return sel(f.statusEnsaio, e.status) && (!f.tipo || e.tipoId === f.tipo);
    if (x) return sel(f.statusExtra, x.status);
    return true;
  };

  const alertas = d.eventos.filter(ev => (ev.ensaioId || ev.itemId) && noPeriodo(ev.em, f) && combina(ev.ensaioId || ev.itemId)).map(ev => {
    const i = d.itens.find(x => x.id === ev.itemId), e = d.ensaios.find(x => x.id === ev.ensaioId);
    return {
      id: ev.id, data: ev.em, tipo: e?.status === 'reprovado' ? 'Reprovação' : /gargalo/i.test(ev.descricao) ? 'Gargalo' : 'Bloqueio',
      obra: nomeObra(ev.obraId || i?.obraId), obraId: ev.obraId || i?.obraId, entidade: e?.codigo || i?.codigo || '—',
      status: statusRotulo(e?.status || (i ? status(i) : '—')), ator: '', detalhe: ev.descricao,
    };
  });

  const movimentos = d.auditoria.filter(a => ['item', 'ensaio', 'extra'].includes(a.entidade) && noPeriodo(a.em, f) && combina(a.entidadeId)).map(a => {
    const { i, e, x } = entidade(a.entidadeId);
    const partes = [a.acao];
    if (a.depois && a.antes) {
      for (const [k, rot] of [['realizado', 'Quantidade realizada'], ['status', 'Status'], ['etapaId', 'Etapa']]) {
        if (a.depois[k] !== undefined && a.depois[k] !== a.antes[k]) {
          const v = val => k === 'etapaId' ? (d.etapas.find(s => s.id === val)?.nome || 'Sem etapa') : (typeof val === 'number' ? numero(val) : (val || '—'));
          partes.push(`${rot}: ${v(a.antes[k])} para ${v(a.depois[k])}`);
        }
      }
    }
    if (a.nota) partes.push(a.nota);
    if (a.turno) partes.push('Turno: ' + a.turno);
    return {
      id: a.id, data: a.em, tipo: a.acao, obra: nomeObra(i?.obraId), obraId: i?.obraId, entidade: e?.codigo || (x ? 'Etapa adicional · ' : '') + (i?.codigo || '—'),
      status: statusRotulo(e?.status || x?.status || (i ? status(i) : '—')), ator: a.ator, detalhe: partes.join(' | '),
    };
  });

  const ciclosDoPeriodo = d.ciclos.filter(c => itens.some(i => i.cicloId === c.id));
  const metas = ciclosDoPeriodo.map(c => `${nomeObra(c.obraId)}: ${numero(c.meta)}%`).join(' | ');
  const indicadores = [
    { rotulo: 'Atingimento', valor: (avancos.length ? numero(avancos.reduce((a, b) => a + b, 0) / avancos.length) : '0') + '%', detalhe: metas ? 'Meta: ' + metas : 'Sem meta no período', icone: 'target', cor: 'blue' },
    { rotulo: 'Itens em atraso', valor: String(itens.filter(i => percentual(i, extras) < 100 && (i.prazo < dia || status(i) === 'em atraso')).length), detalhe: 'Prazo ou avanço abaixo do esperado', icone: 'alert', cor: 'amber' },
    { rotulo: 'Ensaios em gargalo', valor: String(ensaios.filter(e => gargalo(e, d.tipos.find(t => t.id === e.tipoId), agora)).length), detalhe: 'Somente limites configurados', icone: 'flask', cor: 'cyan' },
    { rotulo: 'Bloqueios', valor: String(itens.filter(i => motivosBloqueio(i, d.ensaios, d.extras, agora).length).length), detalhe: 'Dependências atuais dos itens do período', icone: 'lock', cor: 'red' },
    { rotulo: 'Retrabalho em aberto', valor: String(extras.filter(x => x.tipo === 'retrabalho' && ['aberta', 'em andamento'].includes(x.status)).length), detalhe: 'Etapas adicionais não concluídas', icone: 'wrench', cor: 'blue' },
  ];
  const resumo = `Período: ${dataBR(f.inicio)} a ${dataBR(f.fim)} | Status de itens: ${f.statusItem.join(', ') || 'todos'} | Status de ensaios: ${f.statusEnsaio.map(statusRotulo).join(', ') || 'todos'} | Status de etapas adicionais: ${f.statusExtra.join(', ') || 'todos'} | Obra: ${f.obras.map(nomeObra).join(', ') || 'todas autorizadas'} | Etapa: ${d.etapas.find(e => e.id === f.etapa)?.nome || 'todas'} | Tipo de ensaio: ${d.tipos.find(t => t.id === f.tipo)?.nome || 'todos'}`;
  const atrasos = foraDoPeriodo.map(i => ({ id: i.id, data: i.prazo, tipo: 'Atraso fora do período', obra: nomeObra(i.obraId), obraId: i.obraId, entidade: i.codigo, status: status(i), ator: '', detalhe: 'Data prevista fora do período; ainda pendente na data atual.' }));
  return { indicadores, alertas, movimentos, atrasos, resumo, itens, ensaios, extras, geradoEm: dataHora(new Date().toISOString()) };
}
