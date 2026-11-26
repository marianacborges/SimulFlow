// Leitor de presença por NFC (Web NFC — Chrome no Android, página em HTTPS).
// Botão "Iniciar leitura" (a Web NFC só começa após um toque), Wake Lock para manter a tela ligada,
// vibração e som curto, debounce da mesma tag e "Simular leitura" para testar sem tag.
import { html, ic, raw, esc } from '../core/ui.js';

export function normalizarTag(codigo) {
  return String(codigo ?? '').trim().replace(/:/g, '').toUpperCase();
}

export function suporteNfc() {
  if (typeof window === 'undefined') return { ok: false, motivo: 'sem-janela' };
  if (!window.isSecureContext) return { ok: false, motivo: 'https', mensagem: 'A leitura NFC exige HTTPS. Abra o sistema por um endereço https://.' };
  if (!('NDEFReader' in window)) return { ok: false, motivo: 'navegador', mensagem: 'Este navegador não suporta Web NFC. Use o Google Chrome no Android (versão 89 ou mais nova). Para testar sem a tag, use "Simular leitura".' };
  return { ok: true };
}

const ERROS_NFC = {
  NotAllowedError: 'Permissão de NFC negada. Toque em "Iniciar leitura" e escolha Permitir. Se já negou, libere em: Chrome › ⋮ › Configurações › Configurações do site › NFC.',
  NotReadableError: 'O NFC está desligado ou ocupado. Ative o NFC nas configurações do Android (Conexões › NFC) e toque em "Iniciar leitura" de novo.',
  NotSupportedError: 'Este aparelho não tem NFC compatível com a Web NFC.',
  SecurityError: 'A leitura NFC exige HTTPS e a página aberta em primeiro plano.',
  InvalidStateError: 'A leitura já está em andamento.',
};

export function mensagemErroNfc(e) {
  return ERROS_NFC[e?.name] || 'Não foi possível iniciar a leitura NFC: ' + (e?.message || e);
}

/**
 * Monta o leitor dentro de `el`.
 * opcoes.enviar(codigo, origem) → Promise<resultado da leitura> ({ ok, resultado, mensagem, colaborador, horario, ... })
 * Retorna { destruir() }.
 */
export function montarLeitor(el, { enviar, ignorarSegundos = 3, titulo = 'Leitura de presença', subtitulo = '' }) {
  let leitor = null, controle = null, trava = null, ativo = false, audio = null;
  const recentes = new Map();
  const ultimas = [];

  el.innerHTML = String(html`<section class="leitor">
    <div class="leitor-topo"><h2>${titulo}</h2>${subtitulo ? html`<p class="muted small">${subtitulo}</p>` : ''}</div>
    <div class="leitor-aviso" role="note">${ic('alert')} Mantenha esta página aberta e a tela ligada enquanto estiver lendo os cartões.</div>
    <p class="leitor-suporte small" data-suporte></p>
    <button type="button" class="btn primario leitor-botao" data-iniciar>${ic('nfc', 22)}<span>Iniciar leitura</span></button>
    <div class="leitor-resultado neutro" data-resultado aria-live="assertive"><strong>Pronto</strong><span>Toque em "Iniciar leitura" e aproxime o cartão do celular.</span></div>
    <form class="leitor-simular" data-simular><label class="field"><span class="field-label">Testar sem a tag</span>
      <input name="codigo" autocomplete="off" placeholder="Matrícula ou código da tag (ex.: 04:A1:B2)"></label>
      <button type="submit" class="btn outline">${ic('play')}<span>Simular leitura</span></button></form>
    <h3>Últimas leituras</h3><ul class="leitor-ultimas" data-ultimas><li class="muted">Nenhuma leitura nesta sessão.</li></ul>
  </section>`);

  const $ = s => el.querySelector(s);
  const suporte = suporteNfc();
  $('[data-suporte]').textContent = suporte.ok ? 'NFC disponível neste navegador.' : suporte.mensagem;
  if (suporte.ok && navigator.permissions?.query) {
    navigator.permissions.query({ name: 'nfc' }).then(s => {
      const txt = { granted: 'Permissão de NFC concedida.', denied: 'Permissão de NFC negada — libere nas configurações do site.', prompt: 'O Chrome vai pedir permissão para usar o NFC.' }[s.state];
      if (txt) $('[data-suporte]').textContent = 'NFC disponível. ' + txt;
    }).catch(() => {});
  }

  function prepararAudio() {
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch { audio = null; }
  }

  function bip(freq, inicio, duracao = 0.16) {
    if (!audio) return;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    const t0 = audio.currentTime + inicio;
    g.gain.setValueAtTime(0.25, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duracao);
    o.connect(g).connect(audio.destination);
    o.start(t0); o.stop(t0 + duracao + 0.02);
  }

  function sinal(tipo) {
    const vib = { ok: 200, aviso: [90, 60, 90], erro: [300, 100, 300] }[tipo];
    try { navigator.vibrate?.(vib); } catch { /* sem vibração */ }
    if (tipo === 'ok') bip(880, 0);
    else if (tipo === 'aviso') { bip(660, 0, 0.1); bip(660, 0.15, 0.1); }
    else { bip(220, 0, 0.18); bip(180, 0.25, 0.25); }
  }

  function mostrar(classe, titulo, detalhe = '', extras = '') {
    const r = $('[data-resultado]');
    r.className = 'leitor-resultado ' + classe;
    r.innerHTML = String(html`<strong>${titulo}</strong>${detalhe ? html`<span>${detalhe}</span>` : ''}${raw(extras)}`);
    r.classList.remove('pulsar'); void r.offsetWidth; r.classList.add('pulsar');
  }

  function registrarNaLista(classe, texto) {
    ultimas.unshift({ classe, texto, hora: new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
    ultimas.length = Math.min(ultimas.length, 15);
    $('[data-ultimas]').innerHTML = ultimas.map(u => `<li class="${u.classe}"><span>${esc(u.hora)}</span> ${esc(u.texto)}</li>`).join('');
  }

  async function processar(codigoBruto, origem) {
    const codigo = origem === 'simulacao' ? String(codigoBruto ?? '').trim() : normalizarTag(codigoBruto);
    if (!codigo) {
      mostrar('erro', 'Tag sem número de série', 'Esta tag não informa o número de série. Use outra tag ou cartão.');
      sinal('erro');
      return;
    }
    const chave = normalizarTag(codigo);
    const ultima = recentes.get(chave);
    if (ultima && Date.now() - ultima < ignorarSegundos * 1000) return; // mesma tag ainda encostada
    recentes.set(chave, Date.now());
    mostrar('neutro', 'Registrando…', origem === 'simulacao' ? 'Simulação: ' + codigo : 'Tag ' + chave);
    try {
      const r = await enviar(codigo, origem);
      const c = r.colaborador || {};
      if (r.resultado === 'registrado') {
        const avisos = [r.foraTurno ? '<span class="badge amber">fora do turno</span>' : '', r.aposFechamento ? '<span class="badge amber">após o fechamento</span>' : ''].join(' ');
        const classe = r.foraTurno || r.aposFechamento ? 'aviso' : 'ok';
        mostrar(classe, c.nome, `Matrícula ${c.matricula} · ${c.funcao} · ${r.data.split('-').reverse().join('/')} ${r.horario}`, avisos ? `<div class="leitor-selos">${avisos}</div>` : '');
        sinal(classe);
        registrarNaLista(classe, `${c.nome} (${c.matricula}) registrado${r.foraTurno ? ' — fora do turno' : ''}${r.aposFechamento ? ' — após o fechamento' : ''}`);
      } else if (r.resultado === 'duplicado') {
        mostrar('aviso', c.nome, `${r.mensagem}. Nada foi registrado de novo.`);
        sinal('aviso');
        registrarNaLista('aviso', `${c.nome}: ${r.mensagem.toLowerCase()}`);
      } else {
        const titulo = r.resultado === 'desconhecida' ? 'Tag não cadastrada' : r.mensagem || 'Leitura recusada';
        mostrar('erro', titulo, r.resultado === 'desconhecida' ? `Código ${r.codigo || chave}. Cadastre a tag em Colaboradores.` : (c.nome ? `${c.nome} (${c.matricula})` : ''));
        sinal('erro');
        registrarNaLista('erro', `${titulo}${r.codigo ? ' — ' + r.codigo : c.nome ? ' — ' + c.nome : ''}`);
      }
    } catch (e) {
      recentes.delete(chave);
      mostrar('erro', 'Leitura NÃO registrada', e.message);
      sinal('erro');
      registrarNaLista('erro', 'Falha: ' + e.message);
    }
  }

  async function manterTelaLigada() {
    if (!('wakeLock' in navigator)) {
      $('[data-suporte]').textContent += ' Este navegador não mantém a tela ligada sozinho: desative o bloqueio automático de tela.';
      return;
    }
    try { trava = await navigator.wakeLock.request('screen'); } catch { /* bateria fraca ou aba em segundo plano */ }
  }

  const aoVoltar = () => { if (ativo && document.visibilityState === 'visible') manterTelaLigada(); };
  document.addEventListener('visibilitychange', aoVoltar);

  function atualizarBotao() {
    const b = $('[data-iniciar]');
    b.innerHTML = String(html`${ic(ativo ? 'pause' : 'nfc', 22)}<span>${ativo ? 'Parar leitura' : 'Iniciar leitura'}</span>`);
    b.classList.toggle('ativo', ativo);
  }

  async function iniciar() {
    prepararAudio();
    const s = suporteNfc();
    if (!s.ok) { mostrar('erro', 'Leitura NFC indisponível', s.mensagem); sinal('erro'); return; }
    try {
      controle = new AbortController();
      leitor = new NDEFReader();
      leitor.onreading = ev => processar(ev.serialNumber, 'nfc');
      leitor.onreadingerror = () => { mostrar('erro', 'Não foi possível ler a tag', 'Aproxime o cartão de novo e mantenha parado por um instante.'); sinal('erro'); };
      await leitor.scan({ signal: controle.signal });
      ativo = true;
      await manterTelaLigada();
      atualizarBotao();
      mostrar('neutro', 'Leitura ativa', 'Aproxime o cartão da parte de trás do celular.');
    } catch (e) {
      ativo = false;
      atualizarBotao();
      mostrar('erro', 'Leitura não iniciada', mensagemErroNfc(e));
      sinal('erro');
    }
  }

  function parar() {
    try { controle?.abort(); } catch { /* já parado */ }
    try { trava?.release(); } catch { /* já liberada */ }
    controle = null; leitor = null; trava = null; ativo = false;
    atualizarBotao();
  }

  $('[data-iniciar]').addEventListener('click', () => { if (ativo) { parar(); mostrar('neutro', 'Leitura parada', 'Toque em "Iniciar leitura" para continuar.'); } else iniciar(); });
  $('[data-simular]').addEventListener('submit', e => {
    e.preventDefault();
    prepararAudio();
    const campo = e.currentTarget.codigo;
    const v = campo.value.trim();
    if (!v) { campo.focus(); return; }
    recentes.delete(normalizarTag(v));
    processar(v, 'simulacao');
    campo.value = '';
  });

  return {
    destruir() { parar(); document.removeEventListener('visibilitychange', aoVoltar); },
    ativo: () => ativo,
  };
}

/** Lê uma única tag (para preencher o código no cadastro). Resolve com o código normalizado. */
export async function lerUmaTag(tempoLimiteMs = 20000) {
  const s = suporteNfc();
  if (!s.ok) throw new Error(s.mensagem);
  const controle = new AbortController();
  const leitor = new NDEFReader();
  return new Promise((resolve, reject) => {
    const limite = setTimeout(() => { controle.abort(); reject(new Error('Nenhuma tag lida em 20 segundos')); }, tempoLimiteMs);
    leitor.onreading = ev => { clearTimeout(limite); controle.abort(); resolve(normalizarTag(ev.serialNumber)); };
    leitor.onreadingerror = () => { /* continua tentando até o limite */ };
    leitor.scan({ signal: controle.signal }).catch(e => { clearTimeout(limite); reject(new Error(mensagemErroNfc(e))); });
  });
}
