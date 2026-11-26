// Etapas/frentes de trabalho (ex.: Soldagem, Montagem, Pintura), cada uma com um responsável.
import { exigir, exigirTexto, auditar, autorizar, camposDoForm, obraRaiz } from './base.js';
import { regrasAcesso, ehHost } from '../../core/permissoes.js';

export function salvarEtapa(store, u, dados) {
  const anterior = dados.id ? store.obter('etapas', dados.id) : null;
  autorizar(store, u, regrasAcesso.editarEtapas(u), 'etapa', { entidade: 'etapa', entidadeId: dados.id || null, obraId: dados.obraId || anterior?.obraId || null });
  return store.transacao(() => {
    if (anterior) exigir(!anterior.arquivado, 'Etapa arquivada');
    const obraId = anterior ? anterior.obraId : dados.obraId;
    const obra = store.obter('obras', obraId);
    exigir(obra && !obra.arquivado, 'Informe obra e nome da etapa');
    if (obra.parentId) {
      const raiz = obraRaiz(store, obra.id);
      exigir(raiz.escopoEtapas === 'subprojeto', 'Etapas por sub-projeto não habilitadas nesta obra');
    }
    const responsavelId = dados.responsavelId || null;
    if (responsavelId) exigir(store.obter('usuarios', responsavelId)?.ativo, 'Responsável deve ser um usuário ativo');
    const valores = {
      nome: exigirTexto(dados.nome, 'o nome da etapa'),
      area: String(dados.area || '').trim(),
      responsavelId,
      responsavelNome: responsavelId ? store.obter('usuarios', responsavelId).nome : String(dados.responsavelNome || '').trim(),
      campos: { ...(anterior?.campos || {}), ...camposDoForm(dados) },
    };
    let reg;
    if (anterior) {
      reg = store.atualizar('etapas', anterior.id, valores);
      if ((anterior.responsavelId || null) !== responsavelId) trocarResponsavel(store, reg, anterior.responsavelId, responsavelId);
    } else {
      const ordem = store.filtrar('etapas', e => e.obraId === obraId).length;
      reg = store.inserir('etapas', { ...valores, obraId, ordem, arquivado: false, responsavelDesde: new Date().toISOString() });
      if (responsavelId) store.inserir('atribuicoes', { etapaId: reg.id, responsavelId, inicio: new Date().toISOString(), fim: null });
    }
    auditar(store, u, { acao: anterior ? 'Edição de etapa' : 'Etapa cadastrada', entidade: 'etapa', entidadeId: reg.id, obraId: obraRaiz(store, obraId)?.id, antes: anterior, depois: reg });
    return reg;
  });
}

function trocarResponsavel(store, etapa, anteriorId, novoId) {
  const agora = new Date().toISOString();
  const aberta = store.achar('atribuicoes', a => a.etapaId === etapa.id && !a.fim);
  if (!aberta && anteriorId) store.inserir('atribuicoes', { etapaId: etapa.id, responsavelId: anteriorId, inicio: etapa.responsavelDesde || etapa.criadoEm, fim: agora });
  else if (aberta) store.atualizar('atribuicoes', aberta.id, { fim: agora });
  if (novoId) store.inserir('atribuicoes', { etapaId: etapa.id, responsavelId: novoId, inicio: agora, fim: null });
  store.atualizar('etapas', etapa.id, { responsavelDesde: agora });
}

/** Alterar responsável pela tela de Configurações (host) — fecha a atribuição anterior. */
export function alterarResponsavel(store, u, { id, responsavelId }) {
  autorizar(store, u, ehHost(u) || regrasAcesso.editarEtapas(u), 'responsável da etapa', { entidade: 'etapa', entidadeId: id });
  return store.transacao(() => {
    const e = store.obter('etapas', id);
    exigir(e && !e.arquivado, 'Etapa ou responsável inválido');
    const novo = store.obter('usuarios', responsavelId);
    exigir(novo?.ativo, 'Etapa ou responsável inválido');
    const antes = { responsavelId: e.responsavelId, responsavelNome: e.responsavelNome };
    trocarResponsavel(store, e, e.responsavelId, responsavelId);
    store.atualizar('etapas', id, { responsavelId, responsavelNome: novo.nome });
    auditar(store, u, { acao: 'Responsável da etapa alterado', entidade: 'etapa', entidadeId: id, obraId: obraRaiz(store, e.obraId)?.id, antes, depois: { responsavelId, responsavelNome: novo.nome } });
  });
}

/** Sobe/desce a etapa na ordem do quadro de Produção. */
export function reordenarEtapa(store, u, { id, delta }) {
  autorizar(store, u, regrasAcesso.editarEtapas(u), 'ordem de etapa', { entidade: 'etapa', entidadeId: id });
  return store.transacao(() => {
    const e = store.obter('etapas', id);
    exigir(e, 'Etapa não encontrada');
    const irmas = store.filtrar('etapas', x => x.obraId === e.obraId && !x.arquivado).sort((a, b) => a.ordem - b.ordem);
    const i = irmas.findIndex(x => x.id === id);
    const j = i + Number(delta);
    if (j < 0 || j >= irmas.length) return;
    [irmas[i], irmas[j]] = [irmas[j], irmas[i]];
    irmas.forEach((x, k) => { if (x.ordem !== k) store.atualizar('etapas', x.id, { ordem: k }); });
    auditar(store, u, { acao: 'Ordem das etapas alterada', entidade: 'etapa', entidadeId: id, obraId: obraRaiz(store, e.obraId)?.id });
  });
}
