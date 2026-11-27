/**
 * Dados do SimulFlow (OPs, FAs, obras, itens, usuários...) guardados na aba "Dados":
 * uma linha por registro, com o JSON do registro e um número de versão crescente.
 * Os computadores conectados leem tudo uma vez (dados.tudo) e depois só o que mudou
 * (dados.mudancas, desde a última versão que já têm). Exclusão = linha com JSON vazio.
 * "dados.substituir" troca a "geração" dos dados: quem estiver com uma geração antiga recarrega tudo.
 */

var COLECOES_DADOS = [
  'usuarios', 'obras', 'pedidos', 'etapas', 'atribuicoes', 'ciclos', 'itens', 'ops', 'fas',
  'materiais', 'eventos', 'auditoria', 'tiposEnsaio', 'ensaios', 'extras', 'efetivo', 'config',
];
var LIMITE_CELULA = 49000; // o Google Planilhas aceita até 50.000 caracteres por célula

// ---------------- Configurações (aba "Config": Chave | Valor) ----------------

function lerConfigPlanilha(ss) {
  var aba = (ss || planilhaAtiva()).getSheetByName(CONFIG.ABAS.CONFIG);
  var r = {};
  if (!aba) return r;
  lerTodas(aba, 2).forEach(function (x) { var k = texto(x.v[0]); if (k) r[k] = { linha: x.linha, valor: texto(x.v[1]) }; });
  return r;
}

function valorConfig(ss, chave) {
  var c = lerConfigPlanilha(ss)[chave];
  return c ? c.valor : '';
}

function salvarConfigPlanilha(ss, chave, valor) {
  ss = ss || planilhaAtiva();
  var aba = ss.getSheetByName(CONFIG.ABAS.CONFIG);
  var atual = lerConfigPlanilha(ss)[chave];
  if (atual) gravarLinha(aba, atual.linha, [chave, valor]);
  else acrescentarLinhas(aba, [[chave, valor]]);
}

// ---------------- Repositório da aba "Dados" ----------------

function repoDados(ss) {
  ss = ss || planilhaAtiva();
  var aba = ss.getSheetByName(CONFIG.ABAS.DADOS);
  var indice = null; // [{ linha, colecao, id, versao }]

  function lerIndice() {
    if (indice) return indice;
    var ultima = aba.getLastRow();
    indice = [];
    if (ultima < 2) return indice;
    var chaves = aba.getRange(2, 1, ultima - 1, 2).getValues();
    var versoes = aba.getRange(2, 4, ultima - 1, 1).getValues();
    for (var i = 0; i < chaves.length; i++) {
      var col = texto(chaves[i][0]);
      if (col) indice.push({ linha: i + 2, colecao: col, id: texto(chaves[i][1]), versao: Number(versoes[i][0]) || 0 });
    }
    return indice;
  }

  /** JSON das linhas pedidas (lê a coluna inteira de uma vez quando são muitas). */
  function jsonDas(itens) {
    if (!itens.length) return [];
    if (itens.length > 40) {
      var col = aba.getRange(2, 3, aba.getLastRow() - 1, 1).getValues();
      return itens.map(function (x) { return String(col[x.linha - 2][0] || ''); });
    }
    return itens.map(function (x) { return String(aba.getRange(x.linha, 3).getValue() || ''); });
  }

  function versaoAtual() {
    return lerIndice().reduce(function (m, x) { return Math.max(m, x.versao); }, 0);
  }

  return {
    versaoAtual: versaoAtual,
    geracao: function () { return valorConfig(ss, 'dados_geracao') || '1'; },
    vazio: function () { return !lerIndice().length; },

    /** Estado completo (sem as exclusões). */
    tudo: function () {
      var itens = lerIndice();
      var jsons = jsonDas(itens);
      var estado = { config: {} };
      COLECOES_DADOS.forEach(function (c) { if (c !== 'config') estado[c] = []; });
      itens.forEach(function (x, i) {
        if (!jsons[i]) return;
        var reg = JSON.parse(jsons[i]);
        if (x.colecao === 'config') estado.config = reg; else if (estado[x.colecao]) estado[x.colecao].push(reg);
      });
      return estado;
    },

    /** Registros com versão maior que `desde` (registro null = excluído). */
    mudancas: function (desde) {
      var itens = lerIndice().filter(function (x) { return x.versao > desde; });
      var jsons = jsonDas(itens);
      return itens.map(function (x, i) { return { colecao: x.colecao, id: x.id, registro: jsons[i] ? JSON.parse(jsons[i]) : null }; });
    },

    /** Grava um lote de mudanças com uma única versão nova. */
    gravar: function (mudancas, por, agora) {
      var versao = versaoAtual() + 1;
      var quando = new Date(agora).toISOString();
      var porChave = {};
      lerIndice().forEach(function (x) { porChave[x.colecao + '\u0001' + x.id] = x; });
      var novas = [];
      mudancas.forEach(function (m) {
        var linha = [m.colecao, m.id, m.json, versao, quando, por || ''];
        var existente = porChave[m.colecao + '\u0001' + m.id];
        if (existente) { gravarLinha(aba, existente.linha, linha); existente.versao = versao; }
        else if (m.json) { novas.push(linha); porChave[m.colecao + '\u0001' + m.id] = { versao: versao }; }
      });
      acrescentarLinhas(aba, novas);
      indice = null;
      return versao;
    },

    /** Apaga tudo e grava o estado novo (nova geração). */
    substituir: function (linhas, por, agora) {
      var ultima = aba.getLastRow();
      if (ultima >= 2) aba.getRange(2, 1, ultima - 1, CABECALHOS[CONFIG.ABAS.DADOS].length).setValues(
        Array.apply(null, Array(ultima - 1)).map(function () { return ['', '', '', '', '', '']; }));
      indice = null;
      var quando = new Date(agora).toISOString();
      var lote = linhas.map(function (m) { return [m.colecao, m.id, m.json, 1, quando, por || '']; });
      if (lote.length) {
        var r = aba.getRange(2, 1, lote.length, 6);
        r.setNumberFormat('@');
        r.setValues(lote.map(function (l) { return l.map(String); }));
      }
      var geracao = Utilities.getUuid().slice(0, 8);
      salvarConfigPlanilha(ss, 'dados_geracao', geracao);
      indice = null;
      return { versao: lote.length ? 1 : 0, geracao: geracao };
    },
  };
}

// ---------------- Validação das mudanças recebidas ----------------

function validarMudancas(lista) {
  if (!Array.isArray(lista)) throw ErroPresenca('Lista de mudanças inválida');
  return lista.map(function (m) {
    var colecao = String(m && m.colecao || '');
    var id = String(m && m.id || '');
    if (COLECOES_DADOS.indexOf(colecao) < 0) throw ErroPresenca('Coleção desconhecida: ' + colecao);
    if (!id || id.length > 120) throw ErroPresenca('Identificador de registro inválido');
    var json = m.registro === null || m.registro === undefined ? '' : JSON.stringify(m.registro);
    if (json.length > LIMITE_CELULA) throw ErroPresenca('Registro grande demais para a planilha (' + colecao + ' ' + id + ')');
    return { colecao: colecao, id: id, json: json };
  });
}

/** Converte um estado completo { colecao: [registros], config: {} } em linhas para a aba Dados. */
function linhasDoEstado(estado) {
  if (!estado || typeof estado !== 'object') throw ErroPresenca('Estado inválido');
  var mudancas = [];
  COLECOES_DADOS.forEach(function (c) {
    if (c === 'config') { if (estado.config) mudancas.push({ colecao: 'config', id: 'config', registro: estado.config }); return; }
    (Array.isArray(estado[c]) ? estado[c] : []).forEach(function (r) { mudancas.push({ colecao: c, id: r && r.id, registro: r }); });
  });
  return validarMudancas(mudancas);
}

var PERFIS_DADOS = ['sistema', 'planejamento', 'admin'];

var ACOES_DADOS = {
  'dados.tudo': {
    perfis: PERFIS_DADOS, semTurnos: true,
    executar: function (repo) {
      var d = repoDados(repo.planilha);
      return { estado: d.tudo(), versao: d.versaoAtual(), geracao: d.geracao() };
    },
  },
  'dados.mudancas': {
    perfis: PERFIS_DADOS, semTurnos: true,
    executar: function (repo, agora, corpo) {
      var d = repoDados(repo.planilha);
      var geracao = d.geracao();
      if (corpo.geracao && corpo.geracao !== geracao) return { recarregar: true, versao: d.versaoAtual(), geracao: geracao };
      return { mudancas: d.mudancas(Number(corpo.desde) || 0), versao: d.versaoAtual(), geracao: geracao };
    },
  },
  'dados.gravar': {
    perfis: PERFIS_DADOS, semTurnos: true,
    executar: function (repo, agora, corpo, acesso) {
      var d = repoDados(repo.planilha);
      var geracao = d.geracao();
      if (corpo.geracao && corpo.geracao !== geracao) throw ErroPresenca('Os dados da planilha foram substituídos em outro computador. Recarregue a página.', 409);
      var mudancas = validarMudancas(corpo.mudancas || []);
      if (!mudancas.length) return { versao: d.versaoAtual(), geracao: geracao };
      return { versao: d.gravar(mudancas, acesso.nome, agora), geracao: geracao };
    },
  },
  'dados.substituir': {
    perfis: PERFIS_DADOS, semTurnos: true,
    executar: function (repo, agora, corpo, acesso) {
      var d = repoDados(repo.planilha);
      // Substituir dados existentes só com token admin; a primeira carga (planilha vazia) qualquer computador do sistema faz.
      if (acesso.perfil !== 'admin' && !d.vazio()) throw ErroPresenca('Substituir os dados da planilha exige um acesso admin neste computador', 403);
      var r = d.substituir(linhasDoEstado(corpo.estado), acesso.nome, agora);
      return { versao: r.versao, geracao: r.geracao };
    },
  },
};
