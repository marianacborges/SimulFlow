// Aba "Presença operacional": conta os colaboradores presentes no dia (leitura de tag NFC pelo celular),
// com os dados numa planilha Google (Apps Script). Rotas:
//   #/presenca/planilha · #/presenca/leitura · #/presenca/colaboradores · #/presenca/historico[/AAAA-MM-DD] · #/presenca/conexao
import { html, raw, cabecalho, subabas, botao, badge, campo, seletor, modal, janela, toast, confirmar, busca, filtro, vazio, delegar, stat, ic } from '../core/ui.js';
import { config } from '../core/config.js';
import { combinaTexto } from '../core/util.js';
import { baixar } from '../core/exportar.js';
import { gerarXlsx, TIPO_XLSX } from '../core/xlsx.js';
import { controleEstado } from '../componentes/comuns.js';
import { conexao, salvarConexao, limparConexao, chamar, testarConexao, podePlanejar, ehAdminPlanilha, linkCelular } from '../presenca/conexao.js';
import { montarLeitor, lerUmaTag, suporteNfc, dadosDoTexto } from '../presenca/leitor.js';
import { colaboradoresDoCSV, gerarCSV, MODELO_CSV } from '../presenca/csv.js';

const estado = { plan: { busca: '', campo: 'hora', dir: 'asc' }, col: { busca: '', ativos: '' }, hist: { busca: '' } };
const dados = { hoje: null, colaboradores: null, historico: null, dias: {}, acessos: null };
const carga = { andamento: new Set(), erro: {}, em: {} };
let ctxAtual = null, secaoAtual = '', timer = null, desligar = null;
let hostLeitor = null, leitor = null, chaveLeitor = '';

const TIPOS_FECHAMENTO = { automatico: 'automático às 16:40', tardio: 'tardio', manual: 'manual' };
const dataBR = d => (d ? d.split('-').reverse().join('/') : '');
// Datas e horas sempre no fuso do turno (America/Sao_Paulo), qualquer que seja o fuso do aparelho.
const fuso = () => config.app.presenca?.fuso || 'America/Sao_Paulo';
const dataHora = iso => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: fuso(), day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const horaAgora = d => (d ? d.toLocaleTimeString('pt-BR', { timeZone: fuso(), hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');

// ---------------- carga de dados ----------------

async function carregar(chave, acao, req, aplicar) {
  if (carga.andamento.has(chave)) return;
  carga.andamento.add(chave);
  try {
    const r = await chamar(acao, req);
    aplicar(r);
    carga.erro[chave] = '';
    carga.em[chave] = new Date();
  } catch (e) {
    carga.erro[chave] = e.message;
  } finally {
    carga.andamento.delete(chave);
    ctxAtual?.rerender();
  }
}

const recarregarHoje = () => carregar('hoje', 'hoje', {}, r => { dados.hoje = r.planilha; });
const recarregarColaboradores = () => carregar('colaboradores', 'colaboradores.listar', {}, r => { dados.colaboradores = r.colaboradores; });
const recarregarHistorico = () => carregar('historico', 'historico.listar', {}, r => { dados.historico = r.historico; });
const recarregarDia = data => carregar('dia:' + data, 'historico.dia', { data }, r => { dados.dias[data] = r.planilha; });
const recarregarAcessos = () => carregar('acessos', 'acessos.listar', {}, r => { dados.acessos = r.acessos; });

/** Dispara a carga uma vez (sem repetir em caso de erro; o botão Atualizar tenta de novo). */
function garantir(chave, fn, valor) {
  if (valor == null && !carga.andamento.has(chave) && !carga.erro[chave]) fn();
}

function limparCache() {
  Object.assign(dados, { hoje: null, colaboradores: null, historico: null, dias: {}, acessos: null });
  carga.erro = {};
}

// ---------------- pedaços de tela ----------------

function semConexao() {
  return html`${cabecalho('Presença operacional', 'Colaboradores presentes no dia, lidos por tag NFC no celular.')}
    <div class="panel"><h2>Conecte este aparelho à planilha Google</h2>
      <p class="muted" style="margin:8px 0 14px">Os registros de presença ficam numa planilha Google com o script do SimulFlow. Informe a URL do app da Web e o token de acesso deste aparelho.</p>
      <a class="btn primario" href="#/presenca/conexao">${ic('link')}<span>Configurar conexão</span></a></div>`;
}

function soPlanejamento(con) {
  return html`${cabecalho('Presença operacional', '')}<div class="panel"><h2>Acesso de leitor</h2>
    <p class="muted" style="margin:8px 0 14px">Este aparelho está conectado como <strong>${con.nome}</strong> (perfil leitor): ele só registra leituras. A planilha do dia, o cadastro e o histórico são do Planejamento.</p>
    <a class="btn primario" href="#/presenca/leitura">${ic('nfc')}<span>Ir para a leitura</span></a></div>`;
}

function erroCarga(chave, rotulo, acao) {
  return carga.erro[chave] ? html`<div class="warning-band erro-band">${rotulo}: ${carga.erro[chave]} ${botao('Tentar de novo', { acao, v: 'outline', tam: 'sm', icone: 'restore' })}</div>` : '';
}

function ordenar(lista) {
  const { campo, dir } = estado.plan;
  const chave = x => (campo === 'hora' ? x.registradoEm || x.dataHora : String(x[campo] ?? '')).toString();
  return lista.slice().sort((a, b) => chave(a).localeCompare(chave(b), 'pt-BR', { numeric: true }) * (dir === 'asc' ? 1 : -1));
}

function cabecalhoOrdenavel(campoTab, rotulo) {
  const { campo, dir } = estado.plan;
  const seta = campo === campoTab ? (dir === 'asc' ? ' ▲' : ' ▼') : '';
  return html`<th><button type="button" class="th-ordem" data-acao="ordenar" data-campo="${campoTab}" aria-label="Ordenar por ${rotulo}">${rotulo}${seta}</button></th>`;
}

function tabelaPresentes(lista) {
  return html`<div class="table-scroll"><table><thead><tr>${cabecalhoOrdenavel('nome', 'Nome')}${cabecalhoOrdenavel('matricula', 'Matrícula')}${cabecalhoOrdenavel('funcao', 'Função')}${cabecalhoOrdenavel('hora', 'Data/Hora')}</tr></thead><tbody>
    ${lista.map(x => html`<tr><td><strong>${x.nome}</strong></td><td>${x.matricula}</td><td>${x.funcao}</td><td>${x.dataHora}${x.foraTurno ? html` ${badge('fora do turno', 'amber')}` : ''}${x.origem === 'simulacao' ? html` <span class="subline">simulação</span>` : ''}</td></tr>`)}
    </tbody></table></div>${lista.length ? '' : vazio('Nenhum registro para os filtros selecionados.')}`;
}

/** Planilha de um dia (hoje ou histórico). */
function viewDia(ctx, p, { hoje }) {
  const con = conexao();
  const f = estado.plan;
  const filtra = l => ordenar(l.filter(x => combinaTexto(f.busca, [x.nome, x.matricula, x.funcao, x.dataHora])));
  const presentes = filtra(p.presentes);
  const apos = filtra(p.aposFechamento);
  const ausentes = p.ausentes.filter(x => combinaTexto(f.busca, [x.nome, x.matricula, x.funcao])).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const funcoes = Object.entries(p.contadores.porFuncao).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
  const situacao = p.aberto
    ? html`${badge('Aberta', 'green')} Planilha aberta · fecha automaticamente às ${p.turno.fim}`
    : html`${badge('Fechada', 'neutral')} Fechada em ${dataHora(p.fechadoEm)} (${TIPOS_FECHAMENTO[p.tipoFechamento] || p.tipoFechamento}${p.fechadoPor && p.tipoFechamento === 'manual' ? ' por ' + p.fechadoPor : ''})`;
  const acoes = html`${hoje ? botao('Atualizar', { acao: 'atualizar-hoje', v: 'outline', icone: 'restore' }) : html`<a class="btn outline" href="#/presenca/historico">${ic('arrowLeft')}<span>Histórico</span></a>`}
    ${botao('CSV', { acao: 'exportar', dados: { formato: 'csv', data: p.data }, v: 'outline', icone: 'download' })}
    ${botao('XLSX', { acao: 'exportar', dados: { formato: 'xlsx', data: p.data }, v: 'outline', icone: 'sheet' })}
    ${con?.planilhaUrl ? html`<a class="btn outline" href="${con.planilhaUrl}" target="_blank" rel="noopener">${ic('file')}<span>Google Planilhas</span></a>` : ''}
    ${hoje && p.aberto && ehAdminPlanilha(con) && ctx.pode('presenca', true) ? botao('Fechar turno agora', { acao: 'fechar-turno', v: 'perigo', icone: 'lock' }) : ''}`;
  return html`${cabecalho(hoje ? 'Presença operacional' : `Planilha de ${dataBR(p.data)}`, hoje ? `Planilha do dia · ${dataBR(p.data)}` : 'Somente leitura (snapshot do fechamento)', acoes)}
    <div class="status-strip"><span>${situacao}</span><span class="muted">Turno administrativo ${p.turno.inicio}–${p.turno.fim} (${p.turno.fuso})</span>
      ${hoje ? html`<span>${carga.erro.hoje ? html`<span class="red">Sem atualização: ${carga.erro.hoje}</span>` : html`<i class="live-dot"></i> Ao vivo · atualizado às ${horaAgora(carga.em.hoje)}`}</span>` : ''}</div>
    <div class="stats">${stat({ rotulo: 'Presentes', valor: p.contadores.presentes, icone: 'users', cor: 'green', rodape: hoje && p.aberto ? 'Efetivo disponível agora' : 'Na planilha do dia' })}
      ${stat({ rotulo: 'Cadastrados ativos', valor: p.contadores.ativos, icone: 'clipboard', rodape: 'Colaboradores ativos no cadastro' })}
      ${stat({ rotulo: 'Ainda não passaram', valor: p.ausentes.length, icone: 'clock', cor: 'amber', rodape: 'Ativos sem leitura no dia' })}
      ${stat({ rotulo: 'Após o fechamento', valor: p.aposFechamento.length, icone: 'alert', cor: 'neutral', rodape: 'Leituras depois que a planilha fechou' })}</div>
    <div class="status-strip"><span class="strip-label">PRESENTES POR FUNÇÃO</span>${funcoes.length ? funcoes.map(([fn, n]) => html`<span class="sector-tag">${fn} <strong>${n}</strong></span>`) : html`<span class="muted">Nenhum presente ainda</span>`}</div>
    <div class="filters">${busca('plan.busca', f.busca, 'Buscar nome, matrícula, função ou horário...')}<span class="filter-count">${presentes.length} de ${p.presentes.length} presentes</span></div>
    <section class="table-wrap"><div class="table-head"><h2>Presentes <span class="count-pill">${p.presentes.length}</span></h2></div>${tabelaPresentes(presentes)}</section>
    ${p.aposFechamento.length ? html`<section class="section table-wrap"><div class="table-head"><h2>Leituras após o fechamento <span class="count-pill">${p.aposFechamento.length}</span></h2><span class="muted small">Registradas depois que a planilha fechou; não entram no total do dia.</span></div>${tabelaPresentes(apos)}</section>` : ''}
    <section class="section table-wrap"><div class="table-head"><h2>Cadastrados que ainda não passaram o cartão <span class="count-pill">${p.ausentes.length}</span></h2></div>
      <div class="table-scroll"><table><thead><tr><th>Nome</th><th>Matrícula</th><th>Função</th></tr></thead><tbody>${ausentes.map(x => html`<tr><td>${x.nome}</td><td>${x.matricula}</td><td>${x.funcao}</td></tr>`)}</tbody></table></div>
      ${ausentes.length ? '' : vazio(p.ausentes.length ? 'Nenhum registro para a busca.' : 'Todos os ativos já passaram o cartão.')}</section>`;
}

function viewPlanilha(ctx) {
  garantir('hoje', recarregarHoje, dados.hoje);
  if (!dados.hoje) return html`${cabecalho('Presença operacional', 'Planilha do dia')}${erroCarga('hoje', 'Não foi possível carregar a planilha', 'atualizar-hoje')}${carga.erro.hoje ? '' : html`<div class="panel"><p class="muted">Carregando a planilha do dia…</p></div>`}`;
  return viewDia(ctx, dados.hoje, { hoje: true });
}

function viewLeitura(ctx) {
  const con = conexao();
  return html`<div data-host-leitor></div>
    <p class="muted small" style="text-align:center;margin-top:14px">No celular, você também pode abrir só a tela de leitura: <a class="link" href="leitura.html">leitura.html</a>.${ehAdminPlanilha(con) ? ' Gere o link do celular em Conexão.' : ''}</p>`;
}

function anexarLeitor(el) {
  const con = conexao();
  const chave = con.url + '|' + con.token;
  if (!hostLeitor || chave !== chaveLeitor) {
    leitor?.destruir();
    hostLeitor = document.createElement('div');
    chaveLeitor = chave;
    leitor = montarLeitor(hostLeitor, {
      titulo: 'Leitura de presença',
      subtitulo: `Acesso: ${con.nome} (${con.perfil})`,
      ignorarSegundos: config.app.presenca?.ignorarRepeticaoSegundos ?? 3,
      enviar: async (codigo, origem, texto) => {
        const r = await chamar('leitura', { codigo, origem, texto });
        if (podePlanejar(conexao())) { recarregarHoje(); if (r.leitura?.cadastro) recarregarColaboradores(); }
        return r.leitura;
      },
    });
  }
  el.querySelector('[data-host-leitor]')?.appendChild(hostLeitor);
}

function desmontarLeitor() {
  leitor?.destruir();
  leitor = null; hostLeitor = null; chaveLeitor = '';
}

function viewColaboradores(ctx) {
  garantir('colaboradores', recarregarColaboradores, dados.colaboradores);
  const f = estado.col;
  const editavel = ctx.pode('presenca', true);
  const lista = (dados.colaboradores || []).filter(c => combinaTexto(f.busca, [c.nome, c.matricula, c.funcao, c.tag]) && (!f.ativos || (f.ativos === 'sim') === c.ativo))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return html`${cabecalho('Colaboradores', 'Cadastro usado na leitura das tags: nome, matrícula, função, código da tag e situação.', html`
      ${botao('Modelo CSV', { acao: 'modelo-csv', v: 'outline', icone: 'download' })}
      ${botao('Importar CSV', { acao: 'importar-csv', v: 'outline', icone: 'upload', desab: !editavel })}
      ${botao('Novo colaborador', { acao: 'colab-novo', icone: 'plus', desab: !editavel })}`)}
    ${erroCarga('colaboradores', 'Não foi possível carregar o cadastro', 'atualizar-colaboradores')}
    <div class="filters">${busca('col.busca', f.busca, 'Buscar nome, matrícula, função ou tag...')}
      ${filtro('col.ativos', [{ v: '', t: 'Ativos e inativos' }, { v: 'sim', t: 'Somente ativos' }, { v: 'nao', t: 'Somente inativos' }], f.ativos, 'Situação')}
      ${botao('', { acao: 'atualizar-colaboradores', v: 'ghost', tam: 'icon', icone: 'restore', titulo: 'Atualizar' })}
      <span class="filter-count">${dados.colaboradores ? `${lista.length} de ${dados.colaboradores.length} colaboradores` : 'Carregando…'}</span></div>
    <div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Nome</th><th>Matrícula</th><th>Função</th><th>Código da tag</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map(c => html`<tr><td><strong>${c.nome}</strong></td><td>${c.matricula}</td><td>${c.funcao}</td><td>${c.tag ? html`<code>${c.tag}</code>` : html`<span class="muted">sem tag</span>`}</td>
        <td>${badge(c.ativo ? 'Ativo' : 'Desativado')}</td><td><div class="row-actions">
        ${botao('', { acao: 'colab-editar', dados: { matricula: c.matricula }, v: 'ghost', tam: 'icon', icone: 'edit', titulo: 'Editar ' + c.nome, desab: !editavel })}
        ${botao(c.ativo ? 'Desativar' : 'Ativar', { acao: 'colab-ativo', dados: { matricula: c.matricula }, v: 'outline', tam: 'sm', desab: !editavel })}</div></td></tr>`)}
    </tbody></table></div>${dados.colaboradores && !lista.length ? vazio() : ''}</div>
    ${editavel ? '' : html`<p class="muted small" style="margin-top:10px">Somente visualização: o cadastro exige permissão de alteração nesta aba.</p>`}`;
}

function viewHistorico(ctx, data) {
  if (data) {
    garantir('dia:' + data, () => recarregarDia(data), dados.dias[data]);
    const p = dados.dias[data];
    if (!p) return html`${cabecalho(`Planilha de ${dataBR(data)}`, '')}${erroCarga('dia:' + data, 'Não foi possível abrir o dia', 'atualizar-historico')}${carga.erro['dia:' + data] ? '' : html`<div class="panel"><p class="muted">Carregando…</p></div>`}`;
    return viewDia(ctx, p, { hoje: false });
  }
  garantir('historico', recarregarHistorico, dados.historico);
  const lista = (dados.historico || []).filter(h => combinaTexto(estado.hist.busca, [dataBR(h.data), h.tipoFechamento]));
  return html`${cabecalho('Histórico', 'Planilhas fechadas, com o snapshot de cada dia.', botao('Atualizar', { acao: 'atualizar-historico', v: 'outline', icone: 'restore' }))}
    ${erroCarga('historico', 'Não foi possível carregar o histórico', 'atualizar-historico')}
    <div class="filters">${busca('hist.busca', estado.hist.busca, 'Buscar data (dd/mm/aaaa)...')}<span class="filter-count">${dados.historico ? lista.length + ' dias' : 'Carregando…'}</span></div>
    <div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Data</th><th>Presentes</th><th>Ativos</th><th>Fechamento</th><th></th></tr></thead><tbody>
      ${lista.map(h => html`<tr><td><a class="code" href="#/presenca/historico/${h.data}">${dataBR(h.data)}</a></td><td><strong>${h.totalPresentes}</strong></td><td>${h.totalAtivos}</td>
        <td>${dataHora(h.fechadoEm)}<span class="subline">${TIPOS_FECHAMENTO[h.tipoFechamento] || h.tipoFechamento}</span></td>
        <td><div class="row-actions"><a class="btn outline sm" href="#/presenca/historico/${h.data}">Abrir</a>
          ${botao('CSV', { acao: 'exportar', dados: { formato: 'csv', data: h.data }, v: 'ghost', tam: 'sm' })}${botao('XLSX', { acao: 'exportar', dados: { formato: 'xlsx', data: h.data }, v: 'ghost', tam: 'sm' })}</div></td></tr>`)}
    </tbody></table></div>${dados.historico && !lista.length ? vazio('Nenhuma planilha fechada ainda.') : ''}</div>`;
}

function viewConexao(ctx) {
  const con = conexao();
  const admin = ehAdminPlanilha(con);
  if (admin) garantir('acessos', recarregarAcessos, dados.acessos);
  return html`${cabecalho('Conexão com a planilha', 'Cada aparelho guarda a URL do app da Web e o seu próprio token de acesso.')}
    ${con ? html`<div class="panel" style="margin-bottom:16px"><div class="title-row"><h2>Conectado como ${con.nome}</h2>${badge(con.perfil, con.perfil === 'admin' ? 'blue' : con.perfil === 'leitor' ? 'neutral' : 'green')}</div>
      <p class="muted small" style="margin:6px 0 12px;word-break:break-all">${con.url}</p>
      <div class="toolbar">${botao('Testar de novo', { acao: 'testar-conexao', v: 'outline', icone: 'check' })}${botao('Desconectar este aparelho', { acao: 'desconectar', v: 'outline', icone: 'x' })}</div></div>` : ''}
    <form class="panel" data-form-conexao><h2>${con ? 'Trocar conexão' : 'Configurar conexão'}</h2>
      <div class="form-grid" style="margin-top:12px">${campo('URL do app da Web', html`<input name="url" required placeholder="https://script.google.com/macros/s/…/exec" value="${con?.url || ''}">`, { obrig: true, full: true })}
        ${campo('Token de acesso', html`<input name="token" required autocomplete="off" placeholder="sf_…">`, { obrig: true, full: true, ajuda: 'Gerado na planilha (menu SimulFlow › Gerar token de acesso) ou por um admin aqui embaixo.' })}</div>
      <div class="toolbar" style="margin-top:12px">${botao('Testar e salvar', { acao: 'conectar', icone: 'link' })}</div>
      <p class="muted small" style="margin-top:10px">Passo a passo de criação da planilha e do script: <code>docs/presenca.md</code>.</p></form>
    ${admin ? html`<section class="section"><div class="section-title"><h2>Acessos à planilha</h2>${botao('Novo acesso', { acao: 'acesso-novo', icone: 'plus' })}</div>
      ${erroCarga('acessos', 'Não foi possível listar os acessos', 'atualizar-acessos')}
      <div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Nome</th><th>Perfil</th><th>Criado em</th><th>Último uso</th><th>Situação</th><th></th></tr></thead><tbody>
      ${(dados.acessos || []).map(a => html`<tr><td><strong>${a.nome}</strong></td><td>${a.perfil}</td><td>${dataHora(a.criadoEm)}</td><td>${a.ultimoUso ? dataHora(a.ultimoUso) : '—'}</td><td>${badge(a.ativo ? 'Ativo' : 'Desativado')}</td>
        <td>${a.ativo ? botao('Revogar', { acao: 'acesso-revogar', dados: { id: a.id, nome: a.nome }, v: 'outline', tam: 'sm' }) : ''}</td></tr>`)}</tbody></table></div></div>
      <p class="muted small" style="margin-top:8px">Perfis: <strong>leitor</strong> só registra leituras (celular); <strong>planejamento</strong> vê a planilha, o histórico e cadastra colaboradores; <strong>admin</strong> também fecha o turno e gerencia acessos.</p></section>` : ''}`;
}

// ---------------- ações ----------------

async function exportar(ctx, formato, data) {
  const p = dados.hoje?.data === data ? dados.hoje : dados.dias[data] || (await chamar('historico.dia', { data })).planilha;
  const cab = ['Nome', 'Matrícula', 'Função', 'Data/Hora', 'Fora do turno', 'Situação'];
  const linha = (x, sit) => [x.nome, x.matricula, x.funcao, x.dataHora || '', x.dataHora ? (x.foraTurno ? 'Sim' : 'Não') : '', sit];
  const nome = `presenca_${p.data}`;
  if (formato === 'csv') {
    const linhas = [cab, ...p.presentes.map(x => linha(x, 'Na planilha')), ...p.aposFechamento.map(x => linha(x, 'Após o fechamento')), ...p.ausentes.map(x => linha(x, 'Não passou o cartão'))];
    baixar(nome + '.csv', gerarCSV(linhas), 'text/csv;charset=utf-8');
  } else {
    const resumo = [['Campo', 'Valor'], ['Data', dataBR(p.data)], ['Situação', p.aberto ? 'Aberta' : 'Fechada'], ['Fechada em', p.fechadoEm ? dataHora(p.fechadoEm) : ''],
      ['Tipo de fechamento', TIPOS_FECHAMENTO[p.tipoFechamento] || ''], ['Turno', `${p.turno.inicio}–${p.turno.fim} (${p.turno.fuso})`], ['Presentes', p.contadores.presentes],
      ['Cadastrados ativos', p.contadores.ativos], ['Não passaram o cartão', p.ausentes.length], ['Após o fechamento', p.aposFechamento.length],
      ...Object.entries(p.contadores.porFuncao).map(([f, n]) => ['Presentes — ' + f, n])];
    const larg = [30, 14, 22, 18, 14];
    baixar(nome + '.xlsx', new Blob([gerarXlsx([
      { nome: 'Presentes', linhas: [cab.slice(0, 5), ...p.presentes.map(x => linha(x).slice(0, 5))], larguras: larg },
      { nome: 'Após o fechamento', linhas: [cab.slice(0, 5), ...p.aposFechamento.map(x => linha(x).slice(0, 5))], larguras: larg },
      { nome: 'Não passaram', linhas: [['Nome', 'Matrícula', 'Função'], ...p.ausentes.map(x => [x.nome, x.matricula, x.funcao])], larguras: larg },
      { nome: 'Resumo', linhas: resumo, larguras: [30, 30] },
    ])], { type: TIPO_XLSX }));
  }
  toast('Arquivo exportado');
}

function formColaborador(ctx, c = null) {
  const funcoes = [...new Set((dados.colaboradores || []).map(x => x.funcao))].sort();
  const nfc = suporteNfc().ok;
  modal({
    titulo: c ? `Editar ${c.nome}` : 'Novo colaborador', descricao: 'A matrícula e o código da tag são únicos.',
    corpo: html`<div class="form-grid">${campo('Nome', html`<input name="nome" required value="${c?.nome || ''}">`, { obrig: true, full: true })}
      ${campo('Matrícula', html`<input name="matricula" required value="${c?.matricula || ''}">`, { obrig: true })}
      ${campo('Função', html`<input name="funcao" required list="funcoes-presenca" value="${c?.funcao || ''}"><datalist id="funcoes-presenca">${funcoes.map(f => html`<option value="${f}">`)}</datalist>`, { obrig: true })}
      ${campo('Código da tag NFC', html`<div class="toolbar"><input name="tag" value="${c?.tag || ''}" placeholder="04:A1:B2:C3" style="flex:1">${nfc ? html`<button type="button" class="btn outline" data-ler-tag>${ic('nfc')}<span>Ler pelo NFC</span></button>` : ''}</div>`,
        { full: true, ajuda: nfc ? 'Toque em "Ler pelo NFC" e encoste a tag no celular.' : 'Digite o código (o leitor do celular mostra o código de tags não cadastradas).' })}
      <label class="toggle"><input type="checkbox" name="ativo"${c?.ativo === false ? '' : raw(' checked')}> Ativo</label></div>`,
    aoMontar: form => form.querySelector('[data-ler-tag]')?.addEventListener('click', async e => {
      const b = e.currentTarget;
      b.disabled = true; b.querySelector('span').textContent = 'Aproxime a tag…';
      try {
        const lida = await lerUmaTag();
        form.tag.value = lida.codigo;
        // Se a tag tiver "Nome|Matrícula|Função" gravado, preenche os campos vazios.
        const d = dadosDoTexto(lida.texto);
        if (d) for (const k of ['nome', 'matricula', 'funcao']) if (!form[k].value.trim()) form[k].value = d[k];
        toast('Tag lida: ' + lida.codigo + (d ? ' · dados do texto da tag preenchidos' : ''));
      } catch (err) { toast(err.message, 'erro'); }
      finally { b.disabled = false; b.querySelector('span').textContent = 'Ler pelo NFC'; }
    }),
    onOk: async d => {
      await chamar('colaboradores.salvar', { colaborador: { nome: d.nome, matricula: d.matricula, funcao: d.funcao, tag: d.tag, ativo: d.ativo, matriculaOriginal: c?.matricula || '' } });
      toast(c ? 'Colaborador atualizado' : 'Colaborador cadastrado');
      recarregarColaboradores(); dados.hoje && recarregarHoje();
    },
  });
}

function escolherTexto(aceita) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = aceita;
    input.onchange = async () => { const f = input.files?.[0]; if (!f) return reject(new Error('Nenhum arquivo selecionado')); resolve(await f.text()); };
    input.click();
  });
}

async function importarCSV() {
  const linhas = colaboradoresDoCSV(await escolherTexto('.csv,text/csv'));
  if (!(await confirmar('Importar colaboradores?', `${linhas.length} linha(s) encontradas. Matrículas já cadastradas serão atualizadas; as novas serão criadas. Se houver qualquer erro, nada é gravado.`, 'Importar'))) return;
  try {
    const r = await chamar('colaboradores.importar', { linhas });
    toast(`Importação concluída: ${r.importacao.criados} novo(s), ${r.importacao.atualizados} atualizado(s)`);
    recarregarColaboradores();
  } catch (e) {
    if (e.detalhes?.length) janela('Importação cancelada', e.message, html`<ul class="lista-erros">${e.detalhes.map(d => html`<li>${d}</li>`)}</ul>`, false);
    else throw e;
  }
}

function mostrarToken(acesso) {
  const con = conexao();
  const link = acesso.perfil === 'leitor' ? linkCelular(con.url, acesso.token) : '';
  janela(`Token de "${acesso.nome}" (${acesso.perfil})`, 'Copie agora: ele não será mostrado de novo.', html`
    ${campo('Token', html`<input readonly value="${acesso.token}" data-copiar>`)}
    ${link ? html`${campo('Link para o celular (abre a tela de leitura já configurada)', html`<input readonly value="${link}" data-copiar>`)}
      <p class="muted small">Envie o link para o celular do Planejamento e abra no Chrome. O token vai no final do link (#) e é guardado só no aparelho.</p>` : ''}
    <p class="muted small">Toque num campo para selecionar e copiar.</p>`, false);
  document.querySelectorAll('[data-copiar]').forEach(i => i.addEventListener('focus', () => { i.select(); navigator.clipboard?.writeText(i.value).then(() => toast('Copiado'), () => {}); }));
}

export default {
  id: 'presenca',
  titulo: 'Presença operacional',
  onMount(el, ctx) {
    ctxAtual = ctx;
    const ctl = controleEstado(estado, ctx);
    desligar = delegar(el, {
      mudanca: ctl.mudanca,
      cliques: {
        ...ctl.cliques,
        ordenar: d => { const p = estado.plan; p.dir = p.campo === d.campo && p.dir === 'asc' ? 'desc' : 'asc'; p.campo = d.campo; ctx.rerender(); },
        'atualizar-hoje': () => { carga.erro.hoje = ''; recarregarHoje(); },
        'atualizar-colaboradores': () => { carga.erro.colaboradores = ''; recarregarColaboradores(); },
        'atualizar-historico': () => { carga.erro = {}; dados.historico = null; dados.dias = {}; ctx.rerender(); },
        'atualizar-acessos': () => { carga.erro.acessos = ''; recarregarAcessos(); },
        exportar: d => exportar(ctx, d.formato, d.data),
        'fechar-turno': async () => {
          if (!(await confirmar('Fechar turno agora?', 'A planilha de hoje será fechada e arquivada no histórico. Ela não poderá ser editada e novas leituras irão para "após o fechamento".', 'Fechar turno'))) return;
          await chamar('turno.fechar', { confirmar: true });
          toast('Turno fechado e arquivado no histórico');
          dados.historico = null; recarregarHoje();
        },
        'modelo-csv': () => baixar('modelo-colaboradores.csv', MODELO_CSV, 'text/csv;charset=utf-8'),
        'importar-csv': () => importarCSV(),
        'colab-novo': () => formColaborador(ctx),
        'colab-editar': d => formColaborador(ctx, dados.colaboradores.find(c => c.matricula === d.matricula)),
        'colab-ativo': async d => {
          const c = dados.colaboradores.find(x => x.matricula === d.matricula);
          await chamar('colaboradores.salvar', { colaborador: { ...c, ativo: !c.ativo, matriculaOriginal: c.matricula } });
          toast(c.ativo ? 'Colaborador desativado' : 'Colaborador ativado');
          recarregarColaboradores();
        },
        conectar: async () => {
          const form = el.querySelector('[data-form-conexao]');
          const c = await testarConexao(form.url.value, form.token.value);
          salvarConexao(c);
          limparCache();
          desmontarLeitor();
          toast(`Conectado como ${c.nome} (${c.perfil})`);
          ctx.navegar(c.perfil === 'leitor' ? '#/presenca/leitura' : '#/presenca/planilha');
        },
        'testar-conexao': async () => { const c = conexao(); const n = await testarConexao(c.url, c.token); salvarConexao(n); toast(`Conexão OK: ${n.nome} (${n.perfil})`); ctx.rerender(); },
        desconectar: async () => {
          if (!(await confirmar('Desconectar este aparelho?', 'O token será apagado deste navegador. Ele continua válido na planilha até ser revogado.'))) return;
          limparConexao(); limparCache(); desmontarLeitor(); ctx.rerender();
        },
        'acesso-novo': () => modal({
          titulo: 'Novo acesso', descricao: 'Cada aparelho ou pessoa recebe seu próprio token.',
          corpo: html`${campo('Nome', html`<input name="nome" required placeholder="Celular do Planejamento">`, { obrig: true })}
            ${campo('Perfil', seletor('perfil', [{ v: 'leitor', t: 'Leitor — só registra leituras (celular)' }, { v: 'planejamento', t: 'Planejamento — planilha, histórico e cadastro' }, { v: 'admin', t: 'Admin — tudo, inclusive fechar o turno' }], 'leitor'))}`,
          rotuloOk: 'Criar acesso',
          onOk: async v => { const r = await chamar('acessos.criar', { nome: v.nome, perfil: v.perfil }); recarregarAcessos(); setTimeout(() => mostrarToken(r.acesso), 50); },
        }),
        'acesso-revogar': async d => {
          if (!(await confirmar(`Revogar o acesso "${d.nome}"?`, 'O aparelho deixa de registrar leituras e de consultar a planilha imediatamente.', 'Revogar'))) return;
          await chamar('acessos.revogar', { id: d.id });
          toast('Acesso revogado');
          recarregarAcessos();
        },
      },
    });
    const segundos = Math.max(3, Number(config.app.presenca?.recargaSegundos) || 8);
    timer = setInterval(() => {
      if (document.visibilityState === 'visible' && secaoAtual === 'planilha' && podePlanejar(conexao())) recarregarHoje();
    }, segundos * 1000);
  },
  onUnmount() {
    clearInterval(timer);
    desligar?.();
    desmontarLeitor();
    ctxAtual = null;
  },
  render(el, ctx) {
    ctxAtual = ctx;
    const [secao = 'planilha', param] = ctx.params;
    secaoAtual = secao;
    const con = conexao();
    let corpo;
    if (secao === 'conexao') corpo = viewConexao(ctx);
    else if (!con) corpo = semConexao();
    else if (secao === 'leitura') corpo = viewLeitura(ctx);
    else if (!podePlanejar(con)) corpo = soPlanejamento(con);
    else if (secao === 'colaboradores') corpo = viewColaboradores(ctx);
    else if (secao === 'historico') corpo = viewHistorico(ctx, param);
    else corpo = viewPlanilha(ctx);
    if (secao !== 'leitura') desmontarLeitor();
    el.innerHTML = String(html`<main class="page">${subabas([['planilha', 'Planilha do dia', 'clipboard'], ['leitura', 'Leitura', 'nfc'], ['colaboradores', 'Colaboradores', 'users'], ['historico', 'Histórico', 'history'], ['conexao', 'Conexão', 'link']], secao, 'presenca')}${corpo}</main>`);
    if (secao === 'leitura' && con) anexarLeitor(el);
  },
};
