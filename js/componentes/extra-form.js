// Formulários de etapa adicional (retrabalho, correção de NC, outro) — Programação e Qualidade.
import { html, campo, seletor, modal, toast } from '../core/ui.js';
import { config } from '../core/config.js';
import { hoje } from '../core/util.js';
import { opcoesUsuarios } from './comuns.js';
import { TIPOS_EXTRA, observacaoObrigatoria } from '../data/regras.js';

export function formExtra(ctx, item, origem = null) {
  const { store } = ctx;
  const etapas = store.filtrar('etapas', e => [item.obraId, item.subprojetoId].includes(e.obraId) && !e.arquivado);
  modal({
    titulo: `Criar etapa adicional · ${item.codigo}`, descricao: origem ? `Retrabalho sugerido pelo laudo ${origem.codigo}` : 'Programação original preservada', largo: true,
    corpo: html`<div class="form-grid">${campo('Tipo', seletor('tipo', TIPOS_EXTRA, origem ? 'retrabalho' : 'outro'))}
      ${campo('Ensaio de origem (opcional)', seletor('origemId', [{ v: '', t: 'Sem vínculo' }, ...store.filtrar('ensaios', e => e.itemId === item.id).map(e => ({ v: e.id, t: `${e.codigo} · ${e.status}` }))], origem?.id || ''))}
      ${campo('Motivo', html`<textarea name="motivo" required>${origem ? `Reprovação do laudo ${origem.codigo}: ${origem.pendencia}` : ''}</textarea>`, { obrig: true, full: true })}
      ${campo('Etapa de execução (opcional)', seletor('etapaId', [{ v: '', t: 'Sem etapa' }, ...etapas.map(e => ({ v: e.id, t: e.nome }))], ''))}
      ${campo('Quantidade prevista', html`<input name="previsto" type="number" min="0.001" step="any" required>`, { obrig: true })}
      ${campo('Data prevista', html`<input name="prazo" type="date" required value="${hoje()}">`, { obrig: true })}
      ${campo('Responsável', seletor('responsavelId', opcoesUsuarios(store), '', 'required'), { obrig: true })}
      ${campo('Análise de causa (opcional)', html`<textarea name="analise"></textarea>`, { full: true })}</div>`,
    onOk: d => { ctx.acoes.programacao.criarExtra({ ...d, itemId: item.id }); toast('Etapa adicional criada'); },
  });
}

export function formAtualizarExtra(ctx, extra) {
  const item = ctx.store.obter('itens', extra.itemId);
  const politica = ctx.store.config.politicas.quantidade;
  modal({
    titulo: `Atualizar etapa adicional · ${item?.codigo}`, descricao: `${extra.tipo} · ${extra.motivo}`,
    corpo: html`<div class="form-grid">${campo('Quantidade realizada (total)', html`<input name="realizado" type="number" min="0" max="${extra.previsto}" step="any" required value="${extra.realizado}">`, { obrig: true })}
      ${campo('Turno', seletor('turno', config.app.turnos, config.app.turnos[0]), { obrig: true })}
      <label class="toggle" style="grid-column:1/-1"><input type="checkbox" name="semObservacao"> Não vou deixar observação</label>
      ${campo('Observação', html`<textarea name="nota" data-obs></textarea>`, { full: true })}
      ${campo('Análise de causa (opcional)', html`<textarea name="analise">${extra.analise || ''}</textarea>`, { full: true })}</div>`,
    aoMontar: form => {
      const chk = form.querySelector('[name=semObservacao]'), obs = form.querySelector('[data-obs]');
      const at = () => { obs.disabled = chk.checked; obs.required = !chk.checked && observacaoObrigatoria(politica, Number(form.querySelector('[name=realizado]').value), extra.realizado, extra.prazo < hoje()); };
      form.addEventListener('input', at); chk.addEventListener('change', at); at();
    },
    onOk: d => { ctx.acoes.programacao.atualizarExtra({ id: extra.id, ...d }); toast('Etapa adicional atualizada'); },
  });
}

