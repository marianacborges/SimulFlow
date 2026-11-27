/**
 * SimulFlow — planilha de USUÁRIOS (separada da planilha da Presença).
 * Guarda as contas do SimulFlow para a mesma conta entrar em qualquer aparelho conectado.
 * A senha nunca vem em texto: só o hash PBKDF2 gerado no navegador, que o próprio navegador confere ao entrar.
 * Cada aparelho usa um token (aba "Acessos", guardado só como hash SHA-256):
 *   - aparelho: lê e envia contas (computadores e celulares que fazem login);
 *   - admin: tudo isso, mais criar e revogar acessos (o host, na página Usuários e permissões).
 * Vale sempre o registro mais novo de cada conta (atualizadoEm, ou criadoEm se nunca foi editada).
 */
var CONTAS = {
  ABA_USUARIOS: 'Usuários',
  ABA_ACESSOS: 'Acessos',
  PERFIS: ['aparelho', 'admin'],
  VERSAO: '1.0.0',
  LIMITE_CELULA: 49000,
};
var CAB_USUARIOS = ['Login', 'E-mail', 'Nome', 'ID', 'Conta (JSON, senha em hash)', 'Atualizado em'];
var CAB_ACESSOS = ['Nome', 'Perfil', 'Hash do token', 'Criado em', 'Ativo', 'Último uso'];

function agoraAtual() { return new Date(); }

function ErroContas(mensagem, status) { var e = new Error(mensagem); e.status = status || 400; return e; }

function texto(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function ehSim(v) { return v === true || ['sim', 's', 'true', '1', 'x'].indexOf(String(v).trim().toLowerCase()) >= 0; }

// ---------------- planilha ----------------

function planilhaContas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty('PLANILHA_ID');
  if (!id) throw ErroContas('Planilha não encontrada. Abra a planilha e use o menu SimulFlow Contas › Preparar planilha.', 500);
  return SpreadsheetApp.openById(id);
}

function prepararContas(ss) {
  ss = ss || planilhaContas();
  try { PropertiesService.getScriptProperties().setProperty('PLANILHA_ID', ss.getId()); } catch (e) { /* segue */ }
  [[CONTAS.ABA_USUARIOS, CAB_USUARIOS], [CONTAS.ABA_ACESSOS, CAB_ACESSOS]].forEach(function (par) {
    var aba = ss.getSheetByName(par[0]) || ss.insertSheet(par[0]);
    var r = aba.getRange(1, 1, 1, par[1].length);
    r.setNumberFormat('@'); r.setValues([par[1]]); r.setFontWeight('bold');
    aba.setFrozenRows(1);
    aba.getRange(2, 1, Math.max(1, aba.getMaxRows() - 1), par[1].length).setNumberFormat('@');
    if (aba.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0) {
      var prot = aba.protect().setDescription('SimulFlow: somente o script grava nesta aba');
      prot.addEditor(Session.getEffectiveUser());
      prot.removeEditors(prot.getEditors());
      if (prot.canDomainEdit()) prot.setDomainEdit(false);
    }
  });
  return ss;
}

function abaContas(nome) {
  var ss = planilhaContas();
  if (!ss.getSheetByName(CONTAS.ABA_USUARIOS) || !ss.getSheetByName(CONTAS.ABA_ACESSOS)) prepararContas(ss);
  return ss.getSheetByName(nome);
}

function lerLinhas(aba, colunas) {
  var ultima = aba.getLastRow();
  if (ultima < 2) return [];
  return aba.getRange(2, 1, ultima - 1, colunas).getValues().map(function (v, i) { return { linha: i + 2, v: v }; });
}

function gravarLinhaContas(aba, linha, valores) {
  var r = aba.getRange(linha, 1, 1, valores.length);
  r.setNumberFormat('@');
  r.setValues([valores.map(function (v) { return v === null || v === undefined ? '' : String(v); })]);
}

function acrescentar(aba, linhas) {
  if (!linhas.length) return;
  var r = aba.getRange(aba.getLastRow() + 1, 1, linhas.length, linhas[0].length);
  r.setNumberFormat('@');
  r.setValues(linhas.map(function (l) { return l.map(function (v) { return v === null || v === undefined ? '' : String(v); }); }));
}

// ---------------- contas ----------------

function lerContas() {
  return lerLinhas(abaContas(CONTAS.ABA_USUARIOS), CAB_USUARIOS.length).filter(function (x) { return texto(x.v[0]); }).map(function (x) {
    return { linha: x.linha, login: texto(x.v[0]).toLowerCase(), json: String(x.v[4] || ''), em: texto(x.v[5]) };
  });
}

function listarContas() {
  return lerContas().map(function (x) { try { return JSON.parse(x.json); } catch (e) { return null; } }).filter(Boolean);
}

function validarContas(lista) {
  if (!Array.isArray(lista) || lista.length > 500) throw ErroContas('Lista de contas inválida');
  var vistos = {};
  return lista.filter(function (u) {
    if (!u || typeof u !== 'object') throw ErroContas('Conta inválida');
    var login = texto(u.login).toLowerCase();
    if (!u.id || !login || login.length > 120) throw ErroContas('Conta sem identificador ou usuário');
    if (!u.credencial || typeof u.credencial !== 'object' || !u.credencial.hash) throw ErroContas('Conta ' + login + ' sem senha em hash');
    if (u.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(u.email))) throw ErroContas('E-mail inválido na conta ' + login);
    if (JSON.stringify(u).length > CONTAS.LIMITE_CELULA) throw ErroContas('Conta ' + login + ' grande demais');
    if (vistos[login]) return false;
    vistos[login] = true;
    return true;
  });
}

function salvarContas(lista) {
  var aba = abaContas(CONTAS.ABA_USUARIOS);
  var porLogin = {};
  lerContas().forEach(function (x) { porLogin[x.login] = x; });
  var novos = [], salvos = 0, ignorados = 0;
  validarContas(lista).forEach(function (u) {
    var login = texto(u.login).toLowerCase();
    var em = String(u.atualizadoEm || u.criadoEm || '');
    var linha = [login, texto(u.email), texto(u.nome), u.id, JSON.stringify(u), em];
    var atual = porLogin[login];
    if (atual && !(em > atual.em)) { ignorados++; return; }
    if (atual) gravarLinhaContas(aba, atual.linha, linha); else novos.push(linha);
    porLogin[login] = { linha: atual ? atual.linha : -1, login: login, em: em };
    salvos++;
  });
  acrescentar(aba, novos);
  return { salvos: salvos, ignorados: ignorados };
}

// ---------------- acessos (tokens) ----------------

function sha256Hex(textoClaro) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(textoClaro), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var h = (b < 0 ? b + 256 : b).toString(16); return h.length === 1 ? '0' + h : h; }).join('');
}

function lerAcessos() {
  return lerLinhas(abaContas(CONTAS.ABA_ACESSOS), CAB_ACESSOS.length).filter(function (x) { return texto(x.v[2]); }).map(function (x) {
    return { linha: x.linha, nome: texto(x.v[0]), perfil: texto(x.v[1]), hash: texto(x.v[2]), criadoEm: texto(x.v[3]), ativo: ehSim(x.v[4]), ultimoUso: texto(x.v[5]) };
  });
}

function gravarAcesso(a) {
  gravarLinhaContas(abaContas(CONTAS.ABA_ACESSOS), a.linha, [a.nome, a.perfil, a.hash, a.criadoEm, a.ativo ? 'Sim' : 'Não', a.ultimoUso || '']);
}

function criarAcessoContas(nome, perfil) {
  nome = texto(nome);
  if (!nome) throw ErroContas('Informe o nome do aparelho (ex.: PC da Produção)');
  if (CONTAS.PERFIS.indexOf(perfil) < 0) throw ErroContas('Perfil inválido: use aparelho ou admin');
  var token = 'sfc_' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  acrescentar(abaContas(CONTAS.ABA_ACESSOS), [[nome, perfil, sha256Hex(token), new Date(agoraAtual()).toISOString(), 'Sim', '']]);
  return { nome: nome, perfil: perfil, token: token };
}

function autenticarContas(token) {
  if (!token) throw ErroContas('Token de acesso ausente. Configure a planilha de usuários neste aparelho.', 401);
  var hash = sha256Hex(token);
  var a = lerAcessos().filter(function (x) { return x.hash === hash; })[0];
  if (!a || !a.ativo) throw ErroContas('Token inválido ou revogado', 401);
  if (CONTAS.PERFIS.indexOf(a.perfil) < 0) throw ErroContas('Perfil de acesso inválido na aba Acessos', 403);
  var agora = agoraAtual();
  if (!a.ultimoUso || (agora - new Date(a.ultimoUso)) > 10 * 60000) { a.ultimoUso = new Date(agora).toISOString(); gravarAcesso(a); }
  return a;
}

// ---------------- API ----------------

var ACOES_PLANILHA_CONTAS = {
  'status': { perfis: ['aparelho', 'admin'], executar: function (corpo, acesso) {
    return { perfil: acesso.perfil, nome: acesso.nome, versao: CONTAS.VERSAO, tipo: 'contas', agora: new Date(agoraAtual()).toISOString() };
  } },
  'contas.listar': { perfis: ['aparelho', 'admin'], executar: function () { return { usuarios: listarContas() }; } },
  'contas.salvar': { perfis: ['aparelho', 'admin'], executar: function (corpo) { return salvarContas(corpo.usuarios); } },
  'acessos.listar': { perfis: ['admin'], executar: function () {
    return { acessos: lerAcessos().map(function (a) { return { id: a.linha, nome: a.nome, perfil: a.perfil, criadoEm: a.criadoEm, ativo: a.ativo, ultimoUso: a.ultimoUso }; }) };
  } },
  'acessos.criar': { perfis: ['admin'], executar: function (corpo) { return { acesso: criarAcessoContas(corpo.nome, corpo.perfil) }; } },
  'acessos.revogar': { perfis: ['admin'], executar: function (corpo, acesso) {
    var alvo = lerAcessos().filter(function (a) { return a.linha === Number(corpo.id); })[0];
    if (!alvo) throw ErroContas('Acesso não encontrado', 404);
    if (alvo.linha === acesso.linha) throw ErroContas('Não é possível revogar o próprio acesso', 409);
    alvo.ativo = false; gravarAcesso(alvo);
    return { revogado: alvo.linha };
  } },
};

function doGet() {
  return jsonContas({ ok: true, app: 'SimulFlow Contas', versao: CONTAS.VERSAO, mensagem: 'Use POST com {acao, token}.' });
}

function doPost(e) {
  var corpo;
  try { corpo = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (x) { return jsonContas({ ok: false, status: 400, erro: 'Requisição inválida (JSON)' }); }
  try {
    return jsonContas(travaContas(function () {
      var acesso = autenticarContas(corpo.token);
      var acao = ACOES_PLANILHA_CONTAS[corpo.acao];
      if (!acao) throw ErroContas('Ação desconhecida: ' + corpo.acao, 404);
      if (acao.perfis.indexOf(acesso.perfil) < 0) throw ErroContas('O acesso "' + acesso.nome + '" (' + acesso.perfil + ') não permite esta ação', 403);
      var r = acao.executar(corpo, acesso);
      r.ok = true;
      return r;
    }));
  } catch (err) {
    var conhecido = !!err.status;
    if (!conhecido) Logger.log(err && err.stack || err);
    return jsonContas({ ok: false, status: err.status || 500, erro: conhecido ? err.message : 'Erro interno: ' + (err && err.message) });
  }
}

function jsonContas(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

function travaContas(fn) {
  var t = LockService.getScriptLock();
  t.waitLock(20000);
  try { return fn(); } finally { t.releaseLock(); }
}

// ---------------- menu ----------------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('SimulFlow Contas')
    .addItem('1. Preparar planilha', 'menuPrepararContas')
    .addItem('2. Gerar token de acesso…', 'menuTokenContas')
    .addToUi();
}

function menuPrepararContas() {
  prepararContas(planilhaContas());
  try { SpreadsheetApp.getUi().alert('Planilha de usuários preparada: abas Usuários e Acessos.'); } catch (e) { /* executado no editor */ }
}

function menuTokenContas() {
  var ui = SpreadsheetApp.getUi();
  var nome = ui.prompt('Novo acesso', 'Nome do aparelho ou pessoa (ex.: PC da Mariana):', ui.ButtonSet.OK_CANCEL);
  if (nome.getSelectedButton() !== ui.Button.OK) return;
  var perfil = ui.prompt('Perfil', 'Digite: admin (o host, na página Usuários e permissões) ou aparelho (login nos outros aparelhos)', ui.ButtonSet.OK_CANCEL);
  if (perfil.getSelectedButton() !== ui.Button.OK) return;
  var r = travaContas(function () { return criarAcessoContas(nome.getResponseText(), perfil.getResponseText().trim().toLowerCase()); });
  ui.alert('Token criado para "' + r.nome + '" (' + r.perfil + ')', 'Copie agora — ele não será mostrado de novo:\n\n' + r.token + '\n\nNo SimulFlow: Usuários e permissões › Planilha de usuários.', ui.ButtonSet.OK);
}
