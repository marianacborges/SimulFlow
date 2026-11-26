// Ensaios: solicitação, execução, verificação NII → NIII, cancelamento e tipos/limites.
import { exigir, exigirTexto, auditar, notificar, autorizar } from './base.js';
import { regrasAcesso, ehHost } from '../../core/permissoes.js';
import { STATUS_ENSAIO_ABERTO } from '../regras.js';

export function salvarTipo(store, u, { id, nome, limites = {} }) {
  autorizar(store, u, ehHost(u), 'limites de ensaio', { entidade: 'tipoEnsaio', entidadeId: id || null }, 'Configuração exclusiva do host');
  return store.transacao(() => {
    const n = exigirTexto(nome, 'o tipo de ensaio');
    exigir(!store.achar('tiposEnsaio', t => t.nome.toLowerCase() === n.toLowerCase() && t.id !== id), 'Tipo de ensaio já cadastrado');
    const lim = {};
    for (const s of STATUS_ENSAIO_ABERTO) {
      const v = limites[s];
      if (v === '' || v === null || v === undefined) { lim[s] = null; continue; }
      const num = Number(v);
      exigir(Number.isFinite(num) && num > 0, 'Informe limites positivos ou deixe vazio');
      lim[s] = num;
    }
    const anterior = id ? store.obter('tiposEnsaio', id) : null;
    const reg = anterior ? store.atualizar('tiposEnsaio', id, { nome: n, limites: lim }) : store.inserir('tiposEnsaio', { nome: n, limites: lim });
    auditar(store, u, { acao: 'Limites de ensaio', entidade: 'tipoEnsaio', entidadeId: reg.id, antes: anterior, depois: reg });
    return reg;
  });
}

function profissional(store, id, funcao) {
  const p = store.obter('usuarios', id);
  return p && p.ativo && (p.host || (p.funcoes || []).includes(funcao));
}

export function solicitarEnsaio(store, u, dados) {
  autorizar(store, u, regrasAcesso.solicitarEnsaio(u), 'solicitar ensaio', { entidade: 'item', entidadeId: dados.itemId || null });
  return store.transacao(() => {
    const item = store.obter('itens', dados.itemId);
    exigir(item && !item.arquivado, 'Item arquivado ou inexistente');
    exigir(!store.obter('obras', item.obraId)?.arquivado, 'Obra inexistente ou arquivada');
    exigir(store.obter('tiposEnsaio', dados.tipoId), 'Selecione o tipo de ensaio');
    const codigo = exigirTexto(dados.codigo, 'o código do laudo');
    exigir(!store.achar('ensaios', e => e.codigo.toLowerCase() === codigo.toLowerCase()), 'Código de laudo já cadastrado');
    exigir(profissional(store, dados.inspetorId, 'inspetor') && profissional(store, dados.niiId, 'nii') && profissional(store, dados.niiiId, 'niii'),
      'Selecione profissionais ativos com a função de cada nível');
    const agora = new Date().toISOString();
    const reg = store.inserir('ensaios', {
      obraId: item.obraId, itemId: item.id, tipoId: dados.tipoId, codigo, inspetorId: dados.inspetorId,
      status: 'solicitado', solicitadoEm: agora, executadoEm: null, statusDesde: agora, pendencia: '', cancelamento: '',
      nii: { verificadorId: dados.niiId, status: 'pendente', nota: '', em: null, por: '' },
      niii: { verificadorId: dados.niiiId, status: 'pendente', nota: '', em: null, por: '' },
    });
    notificar(store, u, { ref: item.codigo, tipo: 'ensaio', descricao: `Item ${item.codigo} bloqueado: laudo ${codigo} solicitado`, origem: 'Qualidade', destinatarios: ['Produção', 'PCP'], obraId: item.obraId, itemId: item.id, ensaioId: reg.id, destinatarioId: item.responsavelId });
    auditar(store, u, { acao: 'Ensaio solicitado', entidade: 'ensaio', entidadeId: reg.id, obraId: item.obraId, depois: reg });
    return reg;
  });
}

export function executarEnsaio(store, u, { id }) {
  const e = store.obter('ensaios', id);
  autorizar(store, u, regrasAcesso.executarEnsaio(u, e), 'execução de ensaio', { entidade: 'ensaio', entidadeId: id, obraId: e?.obraId });
  return store.transacao(() => {
    exigir(e && ['solicitado', 'em execução'].includes(e.status), 'Não é possível pular etapas');
    const antes = { status: e.status };
    const agora = new Date().toISOString();
    const status = e.status === 'solicitado' ? 'em execução' : 'aguardando NII';
    store.atualizar('ensaios', id, { status, statusDesde: agora, executadoEm: status === 'aguardando NII' ? agora : e.executadoEm });
    auditar(store, u, { acao: 'Execução de ensaio', entidade: 'ensaio', entidadeId: id, obraId: e.obraId, antes, depois: { status } });
  });
}

/** Decisão NII ou NIII (na ordem). Reprovação exige observação e gera alerta de retrabalho. */
export function verificarEnsaio(store, u, { id, decisao, nota = '' }) {
  const e = store.obter('ensaios', id);
  autorizar(store, u, regrasAcesso.verificarEnsaio(u, e), 'verificação de ensaio', { entidade: 'ensaio', entidadeId: id, obraId: e?.obraId });
  return store.transacao(() => {
    exigir(e, 'Ensaio não encontrado');
    const nivel = e.status === 'aguardando NII' ? 'nii' : e.status === 'aguardando NIII' ? 'niii' : '';
    exigir(nivel && ['aprovado', 'reprovado'].includes(decisao), 'Verificação fora da ordem obrigatória');
    if (nivel === 'niii') exigir(e.nii?.status === 'aprovado', 'NII precisa aprovar antes de NIII');
    const obs = String(nota || '').trim();
    if (decisao === 'reprovado') exigir(obs, 'Reprovação exige observação');
    exigir(e[nivel].status === 'pendente', 'Verificação já concluída');
    const agora = new Date().toISOString();
    const registro = { ...e[nivel], status: decisao, nota: obs, em: agora, por: u.nome, porId: u.id };
    const status = decisao === 'reprovado' ? 'reprovado' : nivel === 'nii' ? 'aguardando NIII' : 'aprovado';
    const antes = { status: e.status };
    store.atualizar('ensaios', id, { [nivel]: registro, status, pendencia: decisao === 'reprovado' ? obs : '', statusDesde: agora });
    if (decisao === 'reprovado') {
      const item = store.obter('itens', e.itemId);
      notificar(store, u, { ref: item?.codigo, tipo: 'ensaio', descricao: `Retrabalho necessário: item ${item?.codigo}, laudo ${e.codigo}. ${obs}`, origem: 'Qualidade', destinatarios: ['Produção', 'PCP'], prioridade: 'Alta', obraId: e.obraId, itemId: e.itemId, ensaioId: e.id, destinatarioId: item?.responsavelId });
    }
    auditar(store, u, { acao: 'Verificação ' + nivel.toUpperCase(), entidade: 'ensaio', entidadeId: id, obraId: e.obraId, antes, depois: { status, decisao }, nota: obs });
  });
}

export function cancelarEnsaio(store, u, { id, nota }) {
  autorizar(store, u, regrasAcesso.cancelarEnsaio(u), 'cancelar ensaio', { entidade: 'ensaio', entidadeId: id });
  return store.transacao(() => {
    const e = store.obter('ensaios', id);
    exigir(e && e.status !== 'cancelado', 'Ensaio já cancelado');
    const obs = exigirTexto(nota, 'a justificativa de cancelamento');
    store.atualizar('ensaios', id, { status: 'cancelado', cancelamento: obs, statusDesde: new Date().toISOString() });
    auditar(store, u, { acao: 'Ensaio cancelado', entidade: 'ensaio', entidadeId: id, obraId: e.obraId, antes: { status: e.status }, depois: { status: 'cancelado' }, nota: obs });
  });
}
