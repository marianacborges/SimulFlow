// Página avulsa do celular (leitura.html): só o leitor de tags, sem o restante do sistema.
// Autentica pelo token de acesso do aparelho (perfil leitor, planejamento ou admin).
// Configuração em um toque: leitura.html#url=<URL do app da Web>&token=<token> (o link é gerado em Presença › Conexão).
import { html, campo, ic, toast } from '../core/ui.js';
import { conexao, salvarConexao, limparConexao, testarConexao, chamar } from './conexao.js';
import { montarLeitor } from './leitor.js';

const raiz = document.getElementById('leitura');

async function lerLinkDeConfiguracao() {
  if (!location.hash.includes('token=')) return;
  const p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search); // tira o token do endereço
  try {
    const c = await testarConexao(p.get('url'), p.get('token'));
    salvarConexao(c);
    toast(`Aparelho configurado: ${c.nome}`);
  } catch (e) {
    toast('Não foi possível usar o link: ' + e.message, 'erro');
  }
}

function telaConfigurar(mensagem = '') {
  raiz.innerHTML = String(html`<section class="panel leitor-config"><h1>Configurar este celular</h1>
    <p class="muted">Abra o link enviado pelo Planejamento ou informe a URL do app da Web e o token deste aparelho.</p>
    <form data-config class="auth-form">${campo('URL do app da Web', html`<input name="url" required placeholder="https://script.google.com/macros/s/…/exec">`, { obrig: true })}
      ${campo('Token de acesso', html`<input name="token" required autocomplete="off" placeholder="sf_…">`, { obrig: true })}
      <p role="alert" class="error">${mensagem}</p><button class="btn primario full" type="submit">${ic('link')}<span>Testar e salvar</span></button></form></section>`);
  raiz.querySelector('[data-config]').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.currentTarget;
    const btn = f.querySelector('button');
    btn.disabled = true;
    try { salvarConexao(await testarConexao(f.url.value, f.token.value)); iniciar(); } catch (err) { f.querySelector('[role=alert]').textContent = err.message; } finally { btn.disabled = false; }
  });
}

async function iniciar() {
  const con = conexao();
  if (!con) return telaConfigurar();
  raiz.innerHTML = '<div data-host></div><div class="leitura-rodape" data-rodape></div>';
  const rodape = raiz.querySelector('[data-rodape]');
  montarLeitor(raiz.querySelector('[data-host]'), {
    titulo: 'Leitura de presença',
    subtitulo: `Aparelho: ${con.nome} (${con.perfil})`,
    enviar: async (codigo, origem) => (await chamar('leitura', { codigo, origem })).leitura,
  });
  rodape.innerHTML = String(html`<p class="muted small" data-turno>Consultando a planilha…</p>
    <button type="button" class="btn ghost sm" data-trocar>${ic('settings')}<span>Trocar conexão deste aparelho</span></button>`);
  rodape.querySelector('[data-trocar]').addEventListener('click', () => {
    if (confirm('Apagar a conexão deste aparelho? Será preciso o link ou o token de novo.')) { limparConexao(); telaConfigurar(); }
  });
  try {
    const st = await chamar('status');
    rodape.querySelector('[data-turno]').textContent = `Turno ${st.turno.inicio}–${st.turno.fim} (${st.turno.fuso}) · Planilha de hoje ${st.hoje.aberto ? 'aberta' : 'fechada — leituras vão para "após o fechamento"'}.`;
  } catch (e) {
    if (e.status === 401) return telaConfigurar('O token deste aparelho foi revogado ou é inválido.');
    rodape.querySelector('[data-turno]').textContent = 'Sem contato com a planilha agora: ' + e.message;
  }
}

await lerLinkDeConfiguracao();
iniciar();
