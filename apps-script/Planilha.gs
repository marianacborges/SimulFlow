/**
 * Acesso às abas da planilha Google (o "repo" usado por Dominio.gs).
 * Tudo é gravado como TEXTO (formato "@") para o Google Planilhas não converter
 * datas, horas e matrículas (ex.: "00123") em outros tipos.
 */

var CABECALHOS = {};
CABECALHOS[CONFIG.ABAS.COLABORADORES] = ['Nome', 'Matrícula', 'Função', 'Código da tag NFC', 'Ativo', 'Atualizado em'];
CABECALHOS[CONFIG.ABAS.REGISTROS] = ['Data', 'Hora', 'Matrícula', 'Nome', 'Função', 'Fora do turno', 'Situação', 'Origem', 'Dispositivo', 'Registrado em', 'Tipo'];
CABECALHOS[CONFIG.ABAS.TURNOS] = ['Data', 'Aberto em', 'Fechado em', 'Tipo de fechamento', 'Fechado por', 'Total presentes', 'Total ativos', 'E-mail enviado'];
CABECALHOS[CONFIG.ABAS.HISTORICO] = ['Data', 'Situação', 'Nome', 'Matrícula', 'Função', 'Data/Hora', 'Fora do turno'];
CABECALHOS[CONFIG.ABAS.ACESSOS] = ['Nome', 'Perfil', 'Hash do token', 'Criado em', 'Ativo', 'Último uso'];
CABECALHOS[CONFIG.ABAS.DADOS] = ['Coleção', 'ID', 'JSON', 'Versão', 'Atualizado em', 'Por'];
CABECALHOS[CONFIG.ABAS.CONFIG] = ['Chave', 'Valor'];

// Abas que só o script (dono da planilha) altera.
var ABAS_PROTEGIDAS = [CONFIG.ABAS.REGISTROS, CONFIG.ABAS.TURNOS, CONFIG.ABAS.HISTORICO, CONFIG.ABAS.ACESSOS, CONFIG.ABAS.DADOS, CONFIG.ABAS.CONFIG];

function planilhaAtiva() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty('PLANILHA_ID');
  if (!id) throw ErroPresenca('Planilha não encontrada. Abra a planilha e use o menu SimulFlow › Preparar planilha.', 500);
  return SpreadsheetApp.openById(id);
}

/** Cria/atualiza as abas, cabeçalhos, formatos, proteções e a aba "Hoje". Idempotente. */
function prepararEstrutura(ss) {
  ss = ss || planilhaAtiva();
  ss.setSpreadsheetTimeZone(CONFIG.FUSO);
  try { PropertiesService.getScriptProperties().setProperty('PLANILHA_ID', ss.getId()); } catch (e) { /* sem permissão: segue */ }
  Object.keys(CABECALHOS).forEach(function (nome) {
    var aba = ss.getSheetByName(nome) || ss.insertSheet(nome);
    var cab = CABECALHOS[nome];
    var r = aba.getRange(1, 1, 1, cab.length);
    r.setNumberFormat('@');
    r.setValues([cab]);
    r.setFontWeight('bold');
    aba.setFrozenRows(1);
    aba.getRange(2, 1, Math.max(1, aba.getMaxRows() - 1), cab.length).setNumberFormat('@');
    if (ABAS_PROTEGIDAS.indexOf(nome) >= 0 && aba.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0) {
      var prot = aba.protect().setDescription('SimulFlow: somente o script grava nesta aba');
      prot.addEditor(Session.getEffectiveUser());
      prot.removeEditors(prot.getEditors());
      if (prot.canDomainEdit()) prot.setDomainEdit(false);
    }
  });
  var hoje = ss.getSheetByName(CONFIG.ABAS.HOJE) || ss.insertSheet(CONFIG.ABAS.HOJE, 0);
  var celula = hoje.getRange(1, 1);
  celula.setFormula(formulaHoje(','));
  // Planilhas em português (e outros idiomas com vírgula decimal) separam argumentos com ";".
  try {
    SpreadsheetApp.flush();
    if (/^#ERRO/i.test(String(celula.getDisplayValue()))) celula.setFormula(formulaHoje(';'));
  } catch (e) { /* sem como conferir: mantém a fórmula com vírgula */ }
  return ss;
}

/** Fórmula da aba "Hoje", com o separador de argumentos do idioma da planilha (',' ou ';'). */
function formulaHoje(sep) {
  return '=IFERROR(QUERY(\'' + CONFIG.ABAS.REGISTROS + '\'!A:K' + sep + ' "select D, C, E, A, B, F, G where A = \'" & YEAR(TODAY()) & "-" & TEXT(MONTH(TODAY())' + sep + ' "00") & "-" & TEXT(DAY(TODAY())' + sep + ' "00") & "\' order by B"' + sep + ' 1)' + sep + ' "Nenhuma leitura hoje")';
}

function estruturaPronta(ss) {
  return Object.keys(CABECALHOS).every(function (n) { return !!ss.getSheetByName(n); }) && !!ss.getSheetByName(CONFIG.ABAS.HOJE);
}

// ---------------- utilidades de leitura/escrita ----------------

function texto(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CONFIG.FUSO, 'yyyy-MM-dd');
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function simNao(v) { return v ? 'Sim' : 'Não'; }
function ehSim(v) { return v === true || ['sim', 's', 'true', '1', 'x', 'verdadeiro'].indexOf(String(v).trim().toLowerCase()) >= 0; }

function gravarLinha(aba, linha, valores) {
  var r = aba.getRange(linha, 1, 1, valores.length);
  r.setNumberFormat('@');
  r.setValues([valores.map(function (v) { return v === null || v === undefined ? '' : String(v); })]);
}

function acrescentarLinhas(aba, linhas) {
  if (!linhas.length) return;
  var inicio = aba.getLastRow() + 1;
  var r = aba.getRange(inicio, 1, linhas.length, linhas[0].length);
  r.setNumberFormat('@');
  r.setValues(linhas.map(function (l) { return l.map(function (v) { return v === null || v === undefined ? '' : String(v); }); }));
}

function lerTodas(aba, colunas) {
  var ultima = aba.getLastRow();
  if (ultima < 2) return [];
  return aba.getRange(2, 1, ultima - 1, colunas).getValues().map(function (v, i) { return { linha: i + 2, v: v }; });
}

/** Linhas de uma data, lendo de baixo para cima (as abas crescem em ordem cronológica). */
function linhasDaData(aba, data, colunas) {
  var resultado = [];
  var fim = aba.getLastRow();
  var bloco = 400;
  while (fim >= 2) {
    var ini = Math.max(2, fim - bloco + 1);
    var vals = aba.getRange(ini, 1, fim - ini + 1, colunas).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      var d = texto(vals[i][0]);
      if (d === data) resultado.unshift({ linha: ini + i, v: vals[i] });
      else if (d && d < data) return resultado;
    }
    fim = ini - 1;
  }
  return resultado;
}

// ---------------- repo ----------------

/** Repositório sobre a planilha, com cache por requisição. */
function criarRepo(ss) {
  ss = ss || planilhaAtiva();
  if (!estruturaPronta(ss)) prepararEstrutura(ss);
  var aba = function (nome) { return ss.getSheetByName(nome); };
  var cache = {};
  var nCol = function (nome) { return CABECALHOS[nome].length; };

  function colaboradores() {
    if (!cache.colaboradores) {
      cache.colaboradores = lerTodas(aba(CONFIG.ABAS.COLABORADORES), nCol(CONFIG.ABAS.COLABORADORES))
        .filter(function (x) { return texto(x.v[0]) || texto(x.v[1]); })
        .map(function (x) {
          return { linha: x.linha, nome: texto(x.v[0]), matricula: texto(x.v[1]), funcao: texto(x.v[2]), tag: normalizarTag(texto(x.v[3])), ativo: lerAtivo(x.v[4]) !== false };
        });
    }
    return cache.colaboradores;
  }

  function turnos() {
    if (!cache.turnos) {
      cache.turnos = lerTodas(aba(CONFIG.ABAS.TURNOS), nCol(CONFIG.ABAS.TURNOS)).filter(function (x) { return texto(x.v[0]); }).map(function (x) {
        return { linha: x.linha, data: texto(x.v[0]), abertoEm: texto(x.v[1]), fechadoEm: texto(x.v[2]), tipo: texto(x.v[3]), por: texto(x.v[4]), totalPresentes: Number(x.v[5]) || 0, totalAtivos: Number(x.v[6]) || 0, emailEnviado: texto(x.v[7]) };
      });
    }
    return cache.turnos;
  }

  function lerRegistro(x) {
    var v = x.v;
    return { linha: x.linha, data: texto(v[0]), hora: texto(v[1]), matricula: texto(v[2]), nome: texto(v[3]), funcao: texto(v[4]), foraTurno: ehSim(v[5]), aposFechamento: texto(v[6]) === 'Após o fechamento', origem: texto(v[7]), dispositivo: texto(v[8]), registradoEm: texto(v[9]), tipo: texto(v[10]) || 'entrada' };
  }

  return {
    planilha: ss,
    colaboradores: colaboradores,
    salvarColaborador: function (c) {
      var valores = [c.nome, c.matricula, c.funcao, c.tag || '', simNao(c.ativo), new Date().toISOString()];
      var a = aba(CONFIG.ABAS.COLABORADORES);
      if (c.linha) gravarLinha(a, c.linha, valores); else acrescentarLinhas(a, [valores]);
      cache.colaboradores = null;
    },
    turnos: turnos,
    turno: function (data) { return turnos().filter(function (t) { return t.data === data; })[0] || null; },
    turnosAbertos: function () { return turnos().filter(function (t) { return !t.fechadoEm; }); },
    criarTurno: function (data, abertoEm) {
      acrescentarLinhas(aba(CONFIG.ABAS.TURNOS), [[data, abertoEm, '', '', '', '', '']]);
      cache.turnos = null;
    },
    fecharTurno: function (data, f) {
      var t = turnos().filter(function (x) { return x.data === data; })[0];
      if (!t || t.fechadoEm) throw ErroPresenca('Planilha fechada não pode ser editada', 409);
      gravarLinha(aba(CONFIG.ABAS.TURNOS), t.linha, [data, t.abertoEm, f.fechadoEm, f.tipo, f.por, f.totalPresentes, f.totalAtivos]);
      cache.turnos = null;
    },
    marcarEmailTurno: function (data, textoEnvio) {
      var t = turnos().filter(function (x) { return x.data === data; })[0];
      if (!t) return;
      var r = aba(CONFIG.ABAS.TURNOS).getRange(t.linha, 8);
      r.setNumberFormat('@');
      r.setValues([[textoEnvio]]);
      cache.turnos = null;
    },
    historicoDoMes: function (mes) {
      return lerTodas(aba(CONFIG.ABAS.HISTORICO), nCol(CONFIG.ABAS.HISTORICO)).filter(function (x) { return texto(x.v[0]).indexOf(mes) === 0; }).map(function (x) {
        var v = x.v;
        return { data: texto(v[0]), situacao: texto(v[1]), nome: texto(v[2]), matricula: texto(v[3]), funcao: texto(v[4]), dataHora: texto(v[5]), foraTurno: ehSim(v[6]) };
      });
    },
    registrosDoMes: function (mes) {
      return lerTodas(aba(CONFIG.ABAS.REGISTROS), nCol(CONFIG.ABAS.REGISTROS)).filter(function (x) { return texto(x.v[0]).indexOf(mes) === 0; }).map(lerRegistro);
    },
    registrosDoDia: function (data) {
      cache.registros = cache.registros || {};
      if (!cache.registros[data]) cache.registros[data] = linhasDaData(aba(CONFIG.ABAS.REGISTROS), data, nCol(CONFIG.ABAS.REGISTROS)).map(lerRegistro);
      return cache.registros[data];
    },
    adicionarRegistro: function (r) {
      acrescentarLinhas(aba(CONFIG.ABAS.REGISTROS), [[r.data, r.hora, r.matricula, r.nome, r.funcao, simNao(r.foraTurno), r.aposFechamento ? 'Após o fechamento' : 'Na planilha', r.origem, r.dispositivo, r.registradoEm, r.tipo || 'entrada']]);
      if (cache.registros) delete cache.registros[r.data];
    },
    gravarHistorico: function (linhas) {
      acrescentarLinhas(aba(CONFIG.ABAS.HISTORICO), linhas.map(function (h) { return [h.data, h.situacao, h.nome, h.matricula, h.funcao, h.dataHora, h.situacao === 'Presente' ? simNao(h.foraTurno) : '']; }));
    },
    historicoDoDia: function (data) {
      return linhasDaData(aba(CONFIG.ABAS.HISTORICO), data, nCol(CONFIG.ABAS.HISTORICO)).map(function (x) {
        var v = x.v;
        return { data: texto(v[0]), situacao: texto(v[1]), nome: texto(v[2]), matricula: texto(v[3]), funcao: texto(v[4]), dataHora: texto(v[5]), foraTurno: ehSim(v[6]) };
      });
    },
    acessos: function () {
      return lerTodas(aba(CONFIG.ABAS.ACESSOS), nCol(CONFIG.ABAS.ACESSOS)).filter(function (x) { return texto(x.v[2]); }).map(function (x) {
        return { linha: x.linha, nome: texto(x.v[0]), perfil: texto(x.v[1]), hash: texto(x.v[2]), criadoEm: texto(x.v[3]), ativo: ehSim(x.v[4]), ultimoUso: texto(x.v[5]) };
      });
    },
    adicionarAcesso: function (a) {
      acrescentarLinhas(aba(CONFIG.ABAS.ACESSOS), [[a.nome, a.perfil, a.hash, a.criadoEm, 'Sim', '']]);
    },
    atualizarAcesso: function (a) {
      gravarLinha(aba(CONFIG.ABAS.ACESSOS), a.linha, [a.nome, a.perfil, a.hash, a.criadoEm, simNao(a.ativo), a.ultimoUso || '']);
    },
  };
}
