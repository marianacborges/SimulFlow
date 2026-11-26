// Regras de negócio puras (sem DOM e sem store): usadas pelas telas, pelas ações e pelos testes.
import { hoje, diasEntre, limitar, combinaTexto } from '../core/util.js';

// ---------------- Itens / Programação ----------------

export const STATUS_ITEM = ['não iniciado', 'em andamento', 'em atraso', 'concluído', 'bloqueado'];
export const STATUS_ENSAIO = ['solicitado', 'em execução', 'aguardando NII', 'aguardando NIII', 'aprovado', 'reprovado', 'cancelado'];
export const STATUS_ENSAIO_ABERTO = ['solicitado', 'em execução', 'aguardando NII', 'aguardando NIII'];
export const STATUS_EXTRA = ['aberta', 'em andamento', 'concluída', 'cancelada'];
export const TIPOS_EXTRA = ['retrabalho', 'correção de não conformidade', 'outro'];

function extrasAtivos(item, extras = []) {
  return extras.filter(e => e.itemId === item.id && e.status !== 'cancelada');
}

/** Avanço = (realizado + realizado das etapas adicionais ativas) / (previsto + previsto delas) × 100. */
export function percentual(item, extras = []) {
  const ativos = extrasAtivos(item, extras);
  const previsto = Number(item.previsto || 0) + ativos.reduce((s, e) => s + Number(e.previsto || 0), 0);
  const realizado = Number(item.realizado || 0) + ativos.reduce((s, e) => s + Number(e.realizado || 0), 0);
  const p = previsto > 0 ? limitar(realizado / previsto * 100, 0, 100) : 0;
  // Laudo reprovado limita o avanço a 99% até um novo laudo aprovado (regra dos componentes do protótipo).
  return item.laudo?.status === 'Reprovado' ? Math.min(p, 99) : p;
}

/** Avanço esperado hoje: interpolação linear do início do ciclo até o prazo do item. */
export function esperado(item, ciclo, dia = hoje()) {
  if (!ciclo || !item.prazo) return null;
  const duracao = diasEntre(ciclo.inicio, item.prazo);
  return duracao > 0 ? limitar(diasEntre(ciclo.inicio, dia) / duracao * 100, 0, 100) : 100;
}

export function horasNoStatus(ensaio, agora = Date.now()) {
  return Math.max(0, (agora - Date.parse(ensaio.statusDesde)) / 3600000);
}

/** Gargalo: status em aberto há mais horas que o limite configurado (sem limite = nunca é gargalo). */
export function gargalo(ensaio, tipo, agora = Date.now()) {
  const limite = Number(tipo?.limites?.[ensaio.status]) || 0;
  return STATUS_ENSAIO_ABERTO.includes(ensaio.status) && limite > 0 && horasNoStatus(ensaio, agora) > limite;
}

export function motivosBloqueio(item, ensaios = [], extras = [], agora = Date.now()) {
  const doItem = ensaios.filter(e => e.itemId === item.id);
  return [
    ...doItem.filter(e => !['aprovado', 'cancelado'].includes(e.status))
      .map(e => `Laudo ${e.codigo}: ${e.status} há ${horasNoStatus(e, agora).toFixed(1).replace('.', ',')} h${e.pendencia ? ' · ' + e.pendencia : ''}`),
    ...extras.filter(x => x.itemId === item.id && x.tipo === 'retrabalho' && ['aberta', 'em andamento'].includes(x.status) &&
      doItem.some(e => e.id === x.origemId && e.status === 'reprovado'))
      .map(x => 'Retrabalho em aberto: ' + x.motivo),
  ];
}

/** Status calculado do item (prioridade: bloqueado, concluído, em atraso, em andamento, não iniciado). */
export function statusItem(item, ciclo, ensaios = [], dia = hoje(), extras = [], agora = Date.now()) {
  if (motivosBloqueio(item, ensaios, extras, agora).length) return 'bloqueado';
  const p = percentual(item, extras);
  if (p >= 100) return 'concluído';
  const esp = esperado(item, ciclo, dia);
  if ((item.prazo && item.prazo < dia) || (esp !== null && p < esp)) return 'em atraso';
  return p > 0 ? 'em andamento' : 'não iniciado';
}

export function itemAtrasado(item, ciclo, extras = [], dia = hoje()) {
  const p = percentual(item, extras);
  const esp = esperado(item, ciclo, dia);
  return p < 100 && ((item.prazo && item.prazo < dia) || (esp !== null && p < esp));
}

export function diasAtraso(item, dia = hoje()) {
  return item.prazo ? Math.max(0, diasEntre(item.prazo, dia)) : 0;
}

/** Atingimento = média aritmética dos avanços dos itens. */
export function atingimento(itens, extras = []) {
  return itens.length ? itens.reduce((s, i) => s + percentual(i, extras), 0) / itens.length : 0;
}

export function resumoRetrabalho(extras) {
  const concluidas = extras.filter(e => e.status === 'concluída' && e.concluidaEm);
  const mediaHoras = concluidas.length
    ? concluidas.reduce((s, e) => s + (Date.parse(e.concluidaEm) - Date.parse(e.criadoEm)) / 3600000, 0) / concluidas.length : 0;
  const motivos = {};
  for (const e of extras) motivos[e.motivo] = (motivos[e.motivo] || 0) + 1;
  return {
    total: extras.length,
    abertas: extras.filter(e => e.tipo === 'retrabalho' && ['aberta', 'em andamento'].includes(e.status)).length,
    mediaHoras,
    motivos: Object.entries(motivos).sort((a, b) => b[1] - a[1]),
  };
}

export function statusExtra(previsto, realizado) {
  return realizado >= previsto ? 'concluída' : realizado > 0 ? 'em andamento' : 'aberta';
}

/** Ciclo padrão de 21 dias; outra duração exige justificativa. */
export function cicloValido(inicio, fim, justificativa = '') {
  const dias = diasEntre(inicio, fim);
  return Number.isFinite(dias) && dias > 0 && (dias === 21 || String(justificativa).trim().length > 0);
}

export function quantidadeValida(previsto, realizado) {
  return Number.isFinite(previsto) && Number.isFinite(realizado) && previsto > 0 && realizado >= 0 && realizado <= previsto;
}

/** Fluxo do ensaio: solicitado → em execução → aguardando NII → aguardando NIII → aprovado (reprovação em NII/NIII). */
export function proximoStatusEnsaio(status, decisao) {
  if (status === 'solicitado') return 'em execução';
  if (status === 'em execução') return 'aguardando NII';
  if (['aguardando NII', 'aguardando NIII'].includes(status) && decisao === 'reprovado') return 'reprovado';
  if (status === 'aguardando NII' && decisao === 'aprovado') return 'aguardando NIII';
  if (status === 'aguardando NIII' && decisao === 'aprovado') return 'aprovado';
  return null;
}

/** Política de observação: opcional, sempre, ou condicional (redução ou atraso). */
export function observacaoObrigatoria(politica, novo, anterior, atrasado, semObservacao = false) {
  return !semObservacao && (politica === 'sempre' || (politica === 'condicional' && (novo < anterior || atrasado)));
}

/** 100% só com laudo Aprovado; laudo Reprovado limita a 99%. */
export function podeConcluir(item) {
  return item.laudo?.status === 'Aprovado';
}

// ---------------- Ordens de Produção ----------------

export function progressoOP(op) {
  return op.planejado > 0 ? Math.round(op.produzido / op.planejado * 100) : 0;
}

export function opAtrasada(op, dia = hoje()) {
  return op.status !== 'Concluída' && !!op.prazo && op.prazo < dia;
}

/** Status exibido: vencida e não concluída aparece como "Atrasada". */
export function statusExibidoOP(op, dia = hoje()) {
  return opAtrasada(op, dia) ? 'Atrasada' : op.status;
}

/**
 * Máquina de estados da OP (porta de sf_order_action do protótipo).
 * tipo: produção | parada | inspeção | retomada | atualização
 * Retorna { status, produzido, destinatarios, descricao, origem, prioridade } ou lança erro.
 */
export function transicaoOP(op, tipo, { quantidade = 0, motivo = '', nota = '' } = {}) {
  const nota_ = String(nota || '').trim();
  let status = op.status, produzido = op.produzido, destinatarios, descricao, origem = 'Produção', prioridade = 'Normal';
  if (tipo === 'produção') {
    const q = Number(quantidade);
    if (!Number.isFinite(q) || q <= 0 || op.produzido + q > op.planejado) throw new Error('Quantidade inválida');
    if (['Concluída', 'Aguardando qualidade', 'Parada', 'Aguardando material'].includes(op.status)) throw new Error('Ordem indisponível para produção');
    produzido = op.produzido + q;
    if (produzido === op.planejado) { status = 'Aguardando qualidade'; destinatarios = ['Qualidade']; }
    else { status = 'Em andamento'; destinatarios = ['PCP']; }
    descricao = `${q} unidades produzidas. ${nota_}`.trim();
  } else if (tipo === 'parada') {
    if (op.status === 'Concluída') throw new Error('Ordem concluída');
    if (!nota_) throw new Error('Informe as observações da ocorrência');
    const falta = motivo === 'Falta de matéria-prima';
    status = falta ? 'Aguardando material' : 'Parada';
    destinatarios = falta ? ['PCP', 'Almoxarifado'] : ['PCP', 'Produção'];
    descricao = `${motivo}. ${nota_}`;
    prioridade = 'Alta';
  } else if (tipo === 'inspeção') {
    if (op.status !== 'Aguardando qualidade') throw new Error('Ordem não está aguardando inspeção');
    if (!['Aprovada', 'Reprovada'].includes(motivo)) throw new Error('Informe o resultado da inspeção');
    if (!nota_) throw new Error('Informe o resultado e as observações');
    status = motivo === 'Aprovada' ? 'Concluída' : 'Parada';
    destinatarios = ['PCP', 'Produção', 'Projetos'];
    descricao = `Inspeção ${motivo.toLowerCase()}. ${nota_}`;
    origem = 'Qualidade';
  } else if (tipo === 'retomada') {
    if (!['Parada', 'Aguardando material'].includes(op.status)) throw new Error('Ordem não está parada');
    if (!nota_) throw new Error('Informe a providência tomada');
    status = op.produzido === op.planejado ? 'Aguardando qualidade' : 'Em andamento';
    destinatarios = ['PCP', 'Produção'];
    descricao = `Produção liberada. ${nota_}`;
    origem = 'Almoxarifado';
  } else if (tipo === 'atualização') {
    if (!nota_) throw new Error('Informe a atualização');
    destinatarios = ['PCP', 'Projetos'];
    descricao = nota_;
    origem = 'Projetos';
  } else {
    throw new Error('Ação inválida');
  }
  return { status, produzido, destinatarios, descricao, origem, prioridade };
}

export function camposBuscaOP(op, obra) {
  if (!op) return [];
  return [op.numero, op.faFicha, op.produto, obra?.nome, obra?.contrato, op.responsavel, op.setor, op.status, opAtrasada(op) ? 'Atrasada' : ''];
}

export function combinaOP(op, obra, consulta) {
  return combinaTexto(consulta, camposBuscaOP(op, obra));
}

// ---------------- FAs ----------------

export function faAtrasada(fa, dia = hoje()) {
  return !['Concluída', 'Cancelada'].includes(fa.status) && !!fa.prazo && fa.prazo < dia;
}

export function statusExibidoFA(fa, dia = hoje()) {
  return faAtrasada(fa, dia) ? 'Atrasada' : fa.status;
}

const TRANSICOES_FA = {
  'Aberta': ['Em andamento', 'Concluída', 'Cancelada'],
  'Em andamento': ['Aberta', 'Concluída', 'Cancelada'],
  'Concluída': ['Em andamento'],
  'Cancelada': ['Aberta'],
};

export function transicaoFAValida(de, para) {
  return (TRANSICOES_FA[de] || []).includes(para);
}

export function proximosStatusFA(de) {
  return TRANSICOES_FA[de] || [];
}

// ---------------- Hierarquia ----------------

/** Ids do registro e de todos os descendentes (para arquivar em cascata). */
export function ramo(registros, id, chavePai = 'parentId') {
  const ids = [id];
  for (let i = 0; i < ids.length; i++) for (const r of registros) if (r[chavePai] === ids[i] && !ids.includes(r.id)) ids.push(r.id);
  return ids;
}

export function concluidosDoPedido(itens, pedidoId, extras = []) {
  const lista = itens.filter(i => i.pedidoId === pedidoId && !i.arquivado);
  return { feitos: lista.filter(i => percentual(i, extras) >= 100).length, total: lista.length };
}

export function pedidosPorData(pedidos) {
  return pedidos.slice().sort((a, b) => (a.dataEntrega || '').localeCompare(b.dataEntrega || '') || String(a.numero).localeCompare(String(b.numero)));
}
