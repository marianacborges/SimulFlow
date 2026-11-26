// Roteamento por hash: #/<aba>/<param1>/<param2>?chave=valor
// Cada aba é um módulo em js/abas/<modulo> registrado em config/abas.json.
import { config } from './config.js';
import { pode } from './permissoes.js';
import { html, cabecalho, botao } from './ui.js';
import { publicar } from './eventos.js';

export function lerHash(hash = location.hash) {
  const [caminho, busca = ''] = hash.replace(/^#\/?/, '').split('?');
  const partes = caminho.split('/').filter(Boolean).map(decodeURIComponent);
  return { aba: partes[0] || '', params: partes.slice(1), query: Object.fromEntries(new URLSearchParams(busca)) };
}

async function carregarModulo(modulo) {
  // No HTML empacotado (tools/simulflow.js empacotar) os módulos ficam num registro global.
  const registro = globalThis.__SIMULFLOW_ABAS__;
  if (registro && registro[modulo]) return registro[modulo];
  const m = await import(`../abas/${modulo}`);
  return m.default;
}

/**
 * criarRoteador({ container, contexto }) — contexto() devolve { usuario, store, acoes, ... }.
 */
export function criarRoteador({ container, contexto }) {
  let atual = null; // { id, mod, ctx }
  let gerado = 0;

  function abasPermitidas(u) {
    return config.abas.filter(a => a.visivel !== false && pode(u, a.id));
  }

  function semAcesso(titulo, texto) {
    container.innerHTML = String(html`<main class="page"><div class="denied">${cabecalho(titulo, '')}<p>${texto}</p>${botao('Voltar ao início', { acao: 'ir-inicio', icone: 'home' })}</div></main>`);
    container.querySelector('[data-acao="ir-inicio"]')?.addEventListener('click', () => navegar('#/'));
  }

  function desmontar() {
    if (atual?.mod?.onUnmount) { try { atual.mod.onUnmount(container, atual.ctx); } catch (e) { console.error(e); } }
    atual = null;
  }

  function desenhar() {
    if (!atual) return;
    // Preserva o foco e o cursor do campo ativo (ex.: busca) entre re-renderizações.
    const ativo = document.activeElement;
    const chave = ativo && container.contains(ativo) ? ativo.dataset?.k : null;
    const cursor = chave && 'selectionStart' in ativo ? [ativo.selectionStart, ativo.selectionEnd] : null;
    try {
      atual.mod.render(container, atual.ctx);
    } catch (e) {
      console.error(e);
      container.innerHTML = String(html`<main class="page"><div class="denied"><h1>Erro ao exibir a aba</h1><p>${e.message}</p></div></main>`);
    }
    if (chave) {
      const el = container.querySelector(`[data-k="${CSS.escape(chave)}"]`);
      if (el) { el.focus(); if (cursor && el.setSelectionRange) try { el.setSelectionRange(...cursor); } catch { /* tipo sem cursor */ } }
    }
  }

  async function rotear() {
    const meu = ++gerado;
    const base = contexto();
    const u = base.usuario;
    const { aba: idPedido, params, query } = lerHash();
    const permitidas = abasPermitidas(u);
    const id = idPedido || permitidas[0]?.id;
    if (!id) { desmontar(); semAcesso('Sem abas liberadas', 'Solicite ao host a liberação de pelo menos uma aba.'); return; }
    const aba = config.abas.find(a => a.id === id);
    if (!aba) { desmontar(); semAcesso('Aba não encontrada', `A aba "${id}" não está registrada em config/abas.json.`); return; }
    if (!pode(u, id)) { desmontar(); semAcesso('Acesso não autorizado', 'Solicite ao host a liberação desta aba.'); publicar('aba', { id, titulo: aba.titulo }); return; }
    if (atual?.id !== id) {
      desmontar();
      let mod;
      try { mod = await carregarModulo(aba.modulo); } catch (e) {
        console.error(e);
        semAcesso('Erro ao carregar a aba', `Não foi possível carregar js/abas/${aba.modulo}: ${e.message}`);
        return;
      }
      if (meu !== gerado) return;
      const ctx = { ...base, aba, params, query, rerender: desenhar, navegar };
      atual = { id, mod, ctx };
      try { mod.onMount?.(container, ctx); } catch (e) { console.error(e); }
    }
    Object.assign(atual.ctx, contexto(), { aba, params, query });
    publicar('aba', { id, titulo: aba.titulo, params });
    desenhar();
    if (!document.activeElement || document.activeElement === document.body) container.querySelector('h1')?.focus?.();
  }

  function navegar(hash) {
    if (location.hash === hash) rotear(); else location.hash = hash;
  }

  window.addEventListener('hashchange', rotear);
  return {
    iniciar: rotear,
    atualizar: () => { if (atual) { Object.assign(atual.ctx, contexto()); desenhar(); } },
    navegar,
    parar: () => { window.removeEventListener('hashchange', rotear); desmontar(); },
    abaAtual: () => atual?.id,
  };
}
