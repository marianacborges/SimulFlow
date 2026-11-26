/**
 * API web (Implantar › Nova implantação › App da Web). Todas as chamadas são POST com JSON:
 *   { "acao": "...", "token": "...", ...dados }
 * O token identifica o aparelho/pessoa e o perfil: leitor (só registra leituras),
 * planejamento (vê planilha e histórico, cadastra colaboradores) ou admin (tudo, inclusive
 * fechar o turno e gerenciar acessos). Os tokens ficam na aba "Acessos" só como hash SHA-256.
 */
var VERSAO_API = '1.0.0';

var ACOES = {
  'status': {
    perfis: ['leitor', 'planejamento', 'admin'],
    executar: function (repo, agora, corpo, acesso) {
      var hoje = repo.turno(partesSP(agora).data);
      var r = {
        perfil: acesso.perfil, nome: acesso.nome, versao: VERSAO_API, agora: new Date(agora).toISOString(),
        turno: { inicio: CONFIG.TURNO_INICIO, fim: CONFIG.TURNO_FIM, fuso: CONFIG.FUSO },
        hoje: { data: hoje.data, aberto: !hoje.fechadoEm, fechadoEm: hoje.fechadoEm },
      };
      if (acesso.perfil !== 'leitor') r.planilhaUrl = repo.planilha.getUrl();
      return r;
    },
  },
  'leitura': {
    perfis: ['leitor', 'planejamento', 'admin'],
    executar: function (repo, agora, corpo, acesso) {
      return { leitura: registrarLeitura(repo, agora, { codigo: corpo.codigo, origem: corpo.origem, dispositivo: acesso.nome }) };
    },
  },
  'hoje': {
    perfis: ['planejamento', 'admin'],
    executar: function (repo, agora) { return { planilha: planilhaDoDia(repo, agora) }; },
  },
  'colaboradores.listar': {
    perfis: ['planejamento', 'admin'],
    executar: function (repo) {
      return { colaboradores: repo.colaboradores().map(function (c) { return { nome: c.nome, matricula: c.matricula, funcao: c.funcao, tag: c.tag, ativo: c.ativo }; }) };
    },
  },
  'colaboradores.salvar': {
    perfis: ['planejamento', 'admin'],
    executar: function (repo, agora, corpo) { return { colaborador: salvarColaborador(repo, corpo.colaborador || {}) }; },
  },
  'colaboradores.importar': {
    perfis: ['planejamento', 'admin'],
    executar: function (repo, agora, corpo) { return { importacao: importarColaboradores(repo, corpo.linhas || []) }; },
  },
  'historico.listar': {
    perfis: ['planejamento', 'admin'],
    executar: function (repo, agora) { garantirTurnos(repo, agora); return { historico: listarHistorico(repo) }; },
  },
  'historico.dia': {
    perfis: ['planejamento', 'admin'],
    executar: function (repo, agora, corpo) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(corpo.data || ''))) throw ErroPresenca('Data inválida');
      return { planilha: planilhaDoDia(repo, agora, corpo.data) };
    },
  },
  'turno.fechar': {
    perfis: ['admin'],
    executar: function (repo, agora, corpo, acesso) {
      if (corpo.confirmar !== true) throw ErroPresenca('Confirme o fechamento do turno');
      garantirTurnos(repo, agora);
      return { fechamento: fecharDia(repo, partesSP(agora).data, 'manual', acesso.nome, agora) };
    },
  },
  'acessos.listar': {
    perfis: ['admin'],
    executar: function (repo) {
      return { acessos: repo.acessos().map(function (a) { return { id: a.linha, nome: a.nome, perfil: a.perfil, criadoEm: a.criadoEm, ativo: a.ativo, ultimoUso: a.ultimoUso }; }) };
    },
  },
  'acessos.criar': {
    perfis: ['admin'],
    executar: function (repo, agora, corpo) { return { acesso: criarAcesso(repo, corpo.nome, corpo.perfil, agora) }; },
  },
  'acessos.revogar': {
    perfis: ['admin'],
    executar: function (repo, agora, corpo, acesso) {
      var alvo = repo.acessos().filter(function (a) { return a.linha === Number(corpo.id); })[0];
      if (!alvo) throw ErroPresenca('Acesso não encontrado', 404);
      if (alvo.linha === acesso.linha) throw ErroPresenca('Não é possível revogar o próprio acesso', 409);
      alvo.ativo = false;
      repo.atualizarAcesso(alvo);
      return { revogado: alvo.linha };
    },
  },
};

function doGet() {
  return json({ ok: true, app: 'SimulFlow Presença', versao: VERSAO_API, mensagem: 'Use POST com {acao, token}.' });
}

function doPost(e) {
  var corpo;
  try {
    corpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (x) {
    return json({ ok: false, status: 400, erro: 'Requisição inválida (JSON)' });
  }
  try {
    return json(comTrava(function () { return executar(corpo); }));
  } catch (err) {
    var conhecido = !!err.status;
    if (!conhecido) Logger.log(err && err.stack || err);
    return json({ ok: false, status: err.status || 500, erro: conhecido ? err.message : 'Erro interno: ' + (err && err.message), detalhes: err.detalhes });
  }
}

function executar(corpo) {
  var repo = criarRepo();
  var acesso = autenticar(repo, corpo.token);
  var acao = ACOES[corpo.acao];
  if (!acao) throw ErroPresenca('Ação desconhecida: ' + corpo.acao, 404);
  if (acao.perfis.indexOf(acesso.perfil) < 0) throw ErroPresenca('O acesso "' + acesso.nome + '" (' + acesso.perfil + ') não permite esta ação', 403);
  var agora = agoraAtual();
  garantirTurnos(repo, agora);
  var r = acao.executar(repo, agora, corpo, acesso);
  r.ok = true;
  return r;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Uma requisição por vez (evita leituras duplicadas e fechamento concorrente). */
function comTrava(fn) {
  var trava = LockService.getScriptLock();
  trava.waitLock(20000);
  try { return fn(); } finally { trava.releaseLock(); }
}

// ---------------- Tokens de acesso ----------------

function sha256Hex(textoClaro) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(textoClaro), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var h = (b < 0 ? b + 256 : b).toString(16); return h.length === 1 ? '0' + h : h; }).join('');
}

function autenticar(repo, token) {
  if (!token) throw ErroPresenca('Token de acesso ausente. Configure a conexão deste aparelho.', 401);
  var hash = sha256Hex(token);
  var acesso = repo.acessos().filter(function (a) { return a.hash === hash; })[0];
  if (!acesso || !acesso.ativo) throw ErroPresenca('Token inválido ou revogado', 401);
  if (CONFIG.PERFIS.indexOf(acesso.perfil) < 0) throw ErroPresenca('Perfil de acesso inválido na aba Acessos', 403);
  // Registra o último uso (no máximo a cada 10 minutos, para não gravar a cada leitura).
  var agora = agoraAtual();
  if (!acesso.ultimoUso || (agora - new Date(acesso.ultimoUso)) > 10 * 60000) {
    acesso.ultimoUso = new Date(agora).toISOString();
    repo.atualizarAcesso(acesso);
  }
  return acesso;
}

/** Cria um acesso e devolve o token em texto claro (mostrado uma única vez). */
function criarAcesso(repo, nome, perfil, agora) {
  nome = String(nome || '').trim();
  if (!nome) throw ErroPresenca('Informe o nome do acesso (ex.: Celular do Planejamento)');
  if (CONFIG.PERFIS.indexOf(perfil) < 0) throw ErroPresenca('Perfil inválido: use leitor, planejamento ou admin');
  var token = 'sf_' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  repo.adicionarAcesso({ nome: nome, perfil: perfil, hash: sha256Hex(token), criadoEm: new Date(agora || agoraAtual()).toISOString() });
  return { nome: nome, perfil: perfil, token: token };
}

/** Gatilho de tempo (a cada 5 minutos): fecha às 16:40, fecha dias atrasados e cria a planilha do dia. */
function fechamentoAgendado() {
  comTrava(function () { garantirTurnos(criarRepo(), agoraAtual()); });
}
