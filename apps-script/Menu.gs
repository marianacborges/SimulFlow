/**
 * Menu "SimulFlow" dentro da planilha (só para quem abre a planilha no Google).
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('SimulFlow')
    .addItem('1. Preparar planilha', 'menuPreparar')
    .addItem('2. Ativar fechamento automático (16:40)', 'instalarGatilho')
    .addItem('3. Gerar token de acesso…', 'menuGerarToken')
    .addSeparator()
    .addItem('Fechar turno agora', 'menuFecharTurno')
    .addToUi();
}

function menuPreparar() {
  prepararEstrutura(planilhaAtiva());
  SpreadsheetApp.getUi().alert('Planilha preparada: abas Hoje, Colaboradores, Registros, Turnos, Histórico detalhado e Acessos.');
}

/** Instala o gatilho que roda a cada 5 minutos (fecha às 16:40 mesmo com tudo fechado). */
function instalarGatilho() {
  ScriptApp.getProjectTriggers().forEach(function (g) {
    if (g.getHandlerFunction() === 'fechamentoAgendado') ScriptApp.deleteTrigger(g);
  });
  ScriptApp.newTrigger('fechamentoAgendado').timeBased().everyMinutes(5).create();
  fechamentoAgendado();
  try {
    SpreadsheetApp.getUi().alert('Fechamento automático ativado. A planilha do dia fecha às ' + CONFIG.TURNO_FIM + ' (fuso ' + CONFIG.FUSO + ').');
  } catch (e) { /* executado fora da planilha */ }
}

function menuGerarToken() {
  var ui = SpreadsheetApp.getUi();
  var nome = ui.prompt('Novo acesso', 'Nome do aparelho ou pessoa (ex.: Celular do Planejamento):', ui.ButtonSet.OK_CANCEL);
  if (nome.getSelectedButton() !== ui.Button.OK) return;
  var perfil = ui.prompt('Perfil', 'Digite: leitor (celular de leitura), sistema (computador de setor), planejamento ou admin', ui.ButtonSet.OK_CANCEL);
  if (perfil.getSelectedButton() !== ui.Button.OK) return;
  var r = comTrava(function () { return criarAcesso(criarRepo(), nome.getResponseText(), perfil.getResponseText().trim().toLowerCase()); });
  ui.alert('Token criado para "' + r.nome + '" (' + r.perfil + ')',
    'Copie agora — ele não será mostrado de novo:\n\n' + r.token + '\n\nNo SimulFlow: aba Presença operacional › Conexão.', ui.ButtonSet.OK);
}

function menuFecharTurno() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('Fechar turno agora?', 'A planilha de hoje será fechada e arquivada no histórico. Leituras posteriores entram em "após o fechamento".', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  var r = comTrava(function () {
    var repo = criarRepo(), agora = agoraAtual();
    garantirTurnos(repo, agora);
    return fecharDia(repo, partesSP(agora).data, 'manual', Session.getActiveUser().getEmail() || 'Planilha', agora);
  });
  ui.alert('Turno de ' + r.data + ' fechado com ' + r.totalPresentes + ' presentes.');
}
