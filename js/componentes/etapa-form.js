// Formulário de etapa/frente de trabalho (usado em Produção e Programação).
import { html, campo, seletor, modal, toast } from '../core/ui.js';
import { config } from '../core/config.js';
import { formCamposExtras, opcoesUsuarios } from './comuns.js';

export function formEtapa(ctx, obraId, etapa = null) {
  const { store } = ctx;
  const raiz = store.obter('obras', obraId);
  const subs = raiz?.escopoEtapas === 'subprojeto' ? store.filtrar('obras', o => o.parentId === obraId && !o.arquivado) : [];
  modal({
    titulo: etapa ? `Etapa · ${etapa.nome}` : 'Nova etapa', descricao: 'Frente de trabalho com um responsável. Itens são atribuídos às etapas para acompanhamento.',
    corpo: html`<div class="form-grid">
      ${campo('Nome da etapa', html`<input name="nome" required value="${etapa?.nome || ''}" placeholder="Soldagem, Montagem, Pintura…">`, { obrig: true })}
      ${campo('Área / UO', html`<input name="area" list="areas-etapa" value="${etapa?.area || 'Produção'}"><datalist id="areas-etapa">${config.app.areas.map(a => html`<option value="${a}">`)}</datalist>`)}
      ${campo('Responsável (usuário)', seletor('responsavelId', opcoesUsuarios(store, { vazio: 'Outro (informar nome)' }), etapa?.responsavelId || ''))}
      ${campo('Nome do responsável', html`<input name="responsavelNome" value="${etapa?.responsavelId ? '' : etapa?.responsavelNome || ''}" placeholder="Ex.: Equipe de soldagem">`)}
      ${!etapa && subs.length ? campo('Etapa pertence a', seletor('obraId', [{ v: obraId, t: 'Obra' }, ...subs.map(s => ({ v: s.id, t: s.nome }))], obraId)) : ''}
      ${formCamposExtras('etapa', etapa?.campos)}</div>`,
    onOk: d => { ctx.acoes.etapas.salvarEtapa({ ...d, id: etapa?.id, obraId: d.obraId || obraId }); toast('Etapa salva'); },
  });
}
