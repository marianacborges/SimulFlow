// Filtros do topo do Dashboard: Período, Operação (etapa de produção) e Status (agrupado).
// Regras puras: recebem o store e os filtros e devolvem funções que dizem se uma OP, FA ou item entra.
import { hoje, somarDias } from '../core/util.js';
import { opAtrasada, faAtrasada } from './regras.js';

export const PERIODOS_DASH = [
  { v: '', t: 'Todo o período' }, { v: 'diario', t: 'Diário (hoje)' }, { v: 'semanal', t: 'Semanal (últimos 7 dias)' }, { v: 'mensal', t: 'Mensal (últimos 30 dias)' },
];
export const STATUS_DASH = [
  { v: '', t: 'Todos os status' }, { v: 'andamento', t: 'Em andamento' }, { v: 'concluida', t: 'Concluída' }, { v: 'pendente', t: 'Pendente' }, { v: 'interrompida', t: 'Interrompida' },
];
const DIAS = { diario: 1, semanal: 7, mensal: 30 };

/** Diário = hoje · Semanal = últimos 7 dias · Mensal = últimos 30 dias (sempre até hoje). */
export function intervaloDash(periodo, dia = hoje()) {
  const n = DIAS[periodo];
  return n ? { inicio: somarDias(dia, 1 - n), fim: dia } : null;
}

/**
 * Status agrupado da OP:
 * Concluída → concluída · Parada → interrompida ·
 * Aguardando material/qualidade ou atrasada (prazo vencido) → pendente · demais → em andamento.
 */
export function grupoStatusOP(op, dia = hoje()) {
  if (op.status === 'Concluída') return 'concluida';
  if (op.status === 'Parada') return 'interrompida';
  if (op.status === 'Atrasada' || String(op.status).startsWith('Aguardando') || opAtrasada(op, dia)) return 'pendente';
  return 'andamento';
}

/** Status agrupado da FA: Concluída → concluída · Cancelada → interrompida · Aberta ou atrasada → pendente · Em andamento → em andamento. */
export function grupoStatusFA(fa, dia = hoje()) {
  if (fa.status === 'Concluída') return 'concluida';
  if (fa.status === 'Cancelada') return 'interrompida';
  if (fa.status === 'Aberta' || faAtrasada(fa, dia)) return 'pendente';
  return 'andamento';
}

const dia10 = v => (v ? String(v).slice(0, 10) : '');
const cruza = (ini, fim, p) => (!ini || ini <= p.fim) && (!fim || fim >= p.inicio);
// Enquanto não terminou, a execução vai até hoje (mesmo com o prazo vencido).
const fimExecucao = (prazo, dia) => (prazo && prazo > dia ? prazo : dia);

/** OP em execução no período: o intervalo início → término cruza o período. */
export function opNoPeriodo(op, intervalo, dia = hoje()) {
  if (!intervalo) return true;
  const fim = op.status === 'Concluída' ? (dia10(op.concluidaEm) || dia10(op.atualizadoEm) || op.prazo) : fimExecucao(op.prazo, dia);
  return cruza(op.inicio || dia10(op.criadoEm), fim, intervalo);
}

/** FA em execução no período: da abertura até a conclusão/cancelamento (ou até hoje, se ainda aberta). */
export function faNoPeriodo(fa, intervalo, dia = hoje()) {
  if (!intervalo) return true;
  const encerrada = fa.status === 'Concluída' || fa.status === 'Cancelada';
  const fim = encerrada ? (dia10(fa.concluidaEm) || dia10(fa.atualizadoEm) || fa.prazo) : fimExecucao(fa.prazo, dia);
  return cruza(dia10(fa.criadoEm), fim, intervalo);
}

/** Nomes das etapas de produção (Soldagem, Montagem, Pintura…) das obras ativas, sem repetir. */
export function opcoesOperacao(store) {
  const nomes = new Set();
  for (const e of store.todos('etapas')) {
    const obra = store.obter('obras', e.obraId);
    if (!e.arquivado && !obra?.arquivado && e.nome) nomes.add(e.nome);
  }
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Monta os testes de cada registro para os filtros { periodo, operacao, status }.
 * Operação: OPs com algum item nessa etapa; FAs ligadas a esses itens ou a essas OPs; itens da etapa.
 * Itens atrasados contam como "pendente" e estão em execução hoje (entram em qualquer período).
 */
export function criarFiltroDash(store, filtros = {}, dia = hoje()) {
  const { periodo = '', operacao = '', status = '' } = filtros;
  const intervalo = intervaloDash(periodo, dia);
  let itensEtapa = null, opsEtapa = null;
  if (operacao) {
    const lista = store.filtrar('itens', i => !i.arquivado && store.obter('etapas', i.etapaId)?.nome === operacao);
    itensEtapa = new Set(lista.map(i => i.id));
    opsEtapa = new Set(lista.map(i => i.opNumero).filter(Boolean));
  }
  const op = o => (!status || grupoStatusOP(o, dia) === status) && opNoPeriodo(o, intervalo, dia) && (!opsEtapa || opsEtapa.has(o.numero));
  const fa = f => (!status || grupoStatusFA(f, dia) === status) && faNoPeriodo(f, intervalo, dia) &&
    (!itensEtapa || (f.itemIds || []).some(id => itensEtapa.has(id)) || (!!f.opId && opsEtapa.has(store.obter('ops', f.opId)?.numero)));
  const itemAtrasado = i => (!status || status === 'pendente') && (!itensEtapa || itensEtapa.has(i.id));
  return { op, fa, itemAtrasado, intervalo, ativo: !!(periodo || operacao || status) };
}

/** Texto curto do que está filtrado, para o resumo da caixa recolhida. */
export function resumoFiltrosDash(filtros = {}) {
  const partes = [];
  if (filtros.periodo) partes.push(PERIODOS_DASH.find(p => p.v === filtros.periodo)?.t);
  if (filtros.operacao) partes.push('Operação: ' + filtros.operacao);
  if (filtros.status) partes.push(STATUS_DASH.find(s => s.v === filtros.status)?.t);
  return partes.filter(Boolean).join(' · ');
}
