// Programação: ciclos tri-semanais, efetivo por turno, etapas adicionais, políticas e configurações.
import { exigir, exigirTexto, exigirNumero, exigirData, auditar, autorizar, obraRaiz } from './base.js';
import { regrasAcesso, ehHost } from '../../core/permissoes.js';
import { config } from '../../core/config.js';
import { cicloValido, itemAtrasado, observacaoObrigatoria, statusExtra, TIPOS_EXTRA } from '../regras.js';
import { hoje } from '../../core/util.js';

export function salvarCiclo(store, u, dados) {
  autorizar(store, u, regrasAcesso.criarCiclo(u), 'ciclo', { entidade: 'ciclo', entidadeId: dados.id || null, obraId: dados.obraId || null });
  return store.transacao(() => {
    const anterior = dados.id ? store.obter('ciclos', dados.id) : null;
    const obraId = anterior ? anterior.obraId : dados.obraId;
    const obra = store.obter('obras', obraId);
    exigir(obra && !obra.arquivado && !obra.parentId, 'Obra inválida');
    const inicio = exigirData(dados.inicio, 'o início do ciclo');
    const fim = exigirData(dados.fim, 'o fim do ciclo');
    const justificativa = String(dados.justificativa || '').trim();
    exigir(cicloValido(inicio, fim, justificativa), 'Ciclo deve ter 21 dias ou justificativa de ajuste');
    const meta = exigirNumero(dados.meta, 'a meta (%)', { min: 0, max: 100 });
    const status = ['planejado', 'em andamento', 'encerrado'].includes(dados.status) ? dados.status : 'planejado';
    if (anterior) {
      for (const i of store.filtrar('itens', x => x.cicloId === anterior.id && !x.arquivado)) {
        exigir(i.prazo > inicio && i.prazo <= fim, `O item ${i.codigo} ficaria fora do ciclo; mova-o antes`);
      }
    }
    const valores = { inicio, fim, justificativa, meta, status };
    const reg = anterior ? store.atualizar('ciclos', anterior.id, valores) : store.inserir('ciclos', { ...valores, obraId });
    auditar(store, u, { acao: anterior ? 'Ciclo alterado' : 'Ciclo cadastrado', entidade: 'ciclo', entidadeId: reg.id, obraId, antes: anterior, depois: reg });
    return reg;
  });
}

/** Efetivo do turno: um registro por etapa + turno + dia (novo lançamento substitui). */
export function registrarEfetivo(store, u, { etapaId, dia, turno, previstos, disponiveis, nota = '', semObservacao = false }) {
  const etapa = store.obter('etapas', etapaId);
  autorizar(store, u, regrasAcesso.efetivo(u, etapa), 'efetivo', { entidade: 'etapa', entidadeId: etapaId, obraId: etapa ? obraRaiz(store, etapa.obraId)?.id : null });
  return store.transacao(() => {
    exigir(etapa && !etapa.arquivado, 'Etapa inválida');
    const obra = obraRaiz(store, etapa.obraId);
    exigir(obra && !obra.arquivado, 'Obra inexistente ou arquivada');
    exigir(config.app.turnos.includes(turno), 'Informe o turno');
    const d = exigirData(dia, 'a data');
    const prev = exigirNumero(previstos, 'os profissionais previstos', { min: 0, inteiro: true });
    const disp = exigirNumero(disponiveis, 'os profissionais disponíveis', { min: 0, inteiro: true });
    const existente = store.achar('efetivo', f => f.etapaId === etapaId && f.turno === turno && f.dia === d);
    const atrasada = store.filtrar('itens', i => i.etapaId === etapaId && !i.arquivado)
      .some(i => itemAtrasado(i, store.obter('ciclos', i.cicloId), store.todos('extras')));
    let obs = String(nota || '').trim();
    if (semObservacao) obs = 'Usuário marcou: não vou deixar observação';
    else if (observacaoObrigatoria(store.config.politicas.efetivo, disp, existente ? existente.disponiveis : disp, atrasada) && !obs) throw new Error('Observação obrigatória para esta atualização');
    const valores = { obraId: obra.id, etapaId, dia: d, turno, previstos: prev, disponiveis: disp, nota: obs, atorId: u.id };
    const reg = existente ? store.atualizar('efetivo', existente.id, valores) : store.inserir('efetivo', valores);
    auditar(store, u, { acao: 'Efetivo por turno', entidade: 'etapa', entidadeId: etapaId, obraId: obra.id, antes: existente ? { previstos: existente.previstos, disponiveis: existente.disponiveis } : null, depois: { previstos: prev, disponiveis: disp, dia: d }, nota: obs, turno });
    return reg;
  });
}

const POLITICAS = ['opcional', 'sempre', 'condicional'];

export function definirPolitica(store, u, { tipo, politica }) {
  autorizar(store, u, ehHost(u), 'política de observação', {}, 'Configuração exclusiva do host');
  return store.transacao(() => {
    exigir(['quantidade', 'efetivo'].includes(tipo) && POLITICAS.includes(politica), 'Política inválida');
    const antes = { ...store.config.politicas };
    store.definirConfig({ politicas: { ...store.config.politicas, [tipo]: politica } });
    auditar(store, u, { acao: 'Política de observação', entidade: 'config', antes, depois: store.config.politicas });
  });
}

export function definirLimiteDashboard(store, u, { dias }) {
  autorizar(store, u, ehHost(u), 'limite do Dashboard', {}, 'Configuração exclusiva do host');
  return store.transacao(() => {
    const valor = dias === '' || dias === null || dias === undefined ? null : exigirNumero(dias, 'o limite de dias', { min: 1, inteiro: true });
    const antes = { maxDias: store.config.dashboardMaxDias };
    store.definirConfig({ dashboardMaxDias: valor });
    auditar(store, u, { acao: 'Limite de consulta do Dashboard', entidade: 'config', antes, depois: { maxDias: valor } });
  });
}

export function registrarExportacao(store, u, { filtros, resumo, obraIds }) {
  return store.transacao(() => auditar(store, u, { acao: 'Dashboard exportado em PDF', entidade: 'dashboard', depois: { filtros, resumo, obraIds }, nota: 'Exportação do Dashboard de acompanhamento' }));
}

// ---------------- Etapas adicionais (retrabalho, correção de NC, outro) ----------------

export function criarExtra(store, u, dados) {
  const item = store.obter('itens', dados.itemId);
  autorizar(store, u, regrasAcesso.criarExtra(u), 'etapa adicional', { entidade: 'item', entidadeId: dados.itemId, obraId: item?.obraId }, 'Sem permissão para criar etapa adicional');
  return store.transacao(() => {
    exigir(item && !item.arquivado && !store.obter('obras', item.obraId)?.arquivado, 'Item inexistente ou arquivado');
    const tipo = TIPOS_EXTRA.includes(dados.tipo) ? dados.tipo : 'outro';
    const motivo = exigirTexto(dados.motivo, 'o motivo');
    const responsavel = store.obter('usuarios', dados.responsavelId);
    exigir(responsavel?.ativo, 'Responsável ativo obrigatório');
    const origemId = dados.origemId || null;
    if (origemId) exigir(store.achar('ensaios', e => e.id === origemId && e.itemId === item.id), 'Ensaio de origem inválido');
    const etapaId = dados.etapaId || null;
    if (etapaId) {
      const e = store.obter('etapas', etapaId);
      exigir(e && [item.obraId, item.subprojetoId].includes(e.obraId), 'Etapa de execução inválida');
    }
    const reg = store.inserir('extras', {
      itemId: item.id, obraId: item.obraId, tipo, motivo, origemId, etapaId,
      previsto: exigirNumero(dados.previsto, 'a quantidade prevista', { min: 0.001 }), realizado: 0,
      prazo: exigirData(dados.prazo, 'a data prevista'), responsavelId: responsavel.id, criadoPor: u.id,
      status: 'aberta', analise: String(dados.analise || '').trim(), concluidaEm: null, cancelamento: '',
    });
    auditar(store, u, { acao: 'Etapa adicional criada', entidade: 'extra', entidadeId: reg.id, obraId: item.obraId, depois: reg });
    return reg;
  });
}

export function atualizarExtra(store, u, { id, realizado, turno, nota = '', semObservacao = false, analise }) {
  const x = store.obter('extras', id);
  autorizar(store, u, regrasAcesso.atualizarExtra(u, x), 'etapa adicional', { entidade: 'extra', entidadeId: id, obraId: x?.obraId }, 'Sem permissão para esta etapa adicional');
  return store.transacao(() => {
    exigir(x, 'Etapa adicional não encontrada');
    exigir(x.status !== 'cancelada', 'Etapa cancelada é somente leitura');
    const item = store.obter('itens', x.itemId);
    exigir(item && !item.arquivado, 'Item inexistente ou arquivado');
    exigir(config.app.turnos.includes(turno), 'Informe o turno');
    const novo = exigirNumero(realizado, 'a quantidade realizada', { min: 0 });
    exigir(novo <= x.previsto, `A quantidade realizada não pode passar de ${x.previsto}`);
    let obs = String(nota || '').trim();
    if (semObservacao) obs = 'Usuário marcou: não vou deixar observação';
    else if (observacaoObrigatoria(store.config.politicas.quantidade, novo, x.realizado, x.prazo < hoje()) && !obs) throw new Error('Observação obrigatória para esta atualização');
    const status = statusExtra(x.previsto, novo);
    const antes = { realizado: x.realizado, status: x.status };
    store.atualizar('extras', id, {
      realizado: novo, status, analise: analise !== undefined ? String(analise).trim() : x.analise,
      concluidaEm: status === 'concluída' ? (x.concluidaEm || new Date().toISOString()) : null,
    });
    auditar(store, u, { acao: 'Etapa adicional atualizada', entidade: 'extra', entidadeId: id, obraId: x.obraId, antes, depois: { realizado: novo, status }, nota: obs, turno });
  });
}

export function cancelarExtra(store, u, { id, nota }) {
  const x = store.obter('extras', id);
  autorizar(store, u, regrasAcesso.atualizarExtra(u, x), 'cancelar etapa adicional', { entidade: 'extra', entidadeId: id, obraId: x?.obraId }, 'Sem permissão para esta etapa adicional');
  return store.transacao(() => {
    exigir(x && x.status !== 'cancelada', 'Etapa cancelada é somente leitura');
    const obs = exigirTexto(nota, 'a justificativa de cancelamento');
    store.atualizar('extras', id, { status: 'cancelada', cancelamento: obs });
    auditar(store, u, { acao: 'Etapa adicional cancelada', entidade: 'extra', entidadeId: id, obraId: x.obraId, antes: { status: x.status }, depois: { status: 'cancelada' }, nota: obs });
  });
}
