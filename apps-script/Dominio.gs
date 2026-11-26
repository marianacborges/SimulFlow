/**
 * Regras da presença. Não acessam a planilha diretamente: recebem um "repo" (Planilha.gs).
 * Datas e horas sempre no fuso CONFIG.FUSO (America/Sao_Paulo).
 */

/** Normaliza o código da tag: remove dois-pontos e espaços nas pontas, maiúsculas. "04:a1:b2" → "04A1B2". */
function normalizarTag(codigo) {
  return String(codigo == null ? '' : codigo).trim().replace(/:/g, '').toUpperCase();
}

/** { data: 'AAAA-MM-DD', hora: 'HH:MM', minutos, iso } no fuso do turno. */
function partesSP(instante) {
  var d = new Date(instante);
  var t = Utilities.formatDate(d, CONFIG.FUSO, "yyyy-MM-dd'|'HH:mm");
  var p = t.split('|');
  var hm = p[1].split(':');
  return { data: p[0], hora: p[1], minutos: Number(hm[0]) * 60 + Number(hm[1]), iso: d.toISOString() };
}

function paraMinutos(hhmm) {
  var p = String(hhmm).split(':');
  return Number(p[0]) * 60 + Number(p[1]);
}

/** Fora do turno administrativo (07:30 às 16:40). */
function foraDoTurno(minutos) {
  return minutos < paraMinutos(CONFIG.TURNO_INICIO) || minutos >= paraMinutos(CONFIG.TURNO_FIM);
}

function dataHoraLegivel(iso) {
  var p = partesSP(iso);
  return p.data.split('-').reverse().join('/') + ' ' + p.hora;
}

function ErroPresenca(mensagem, status, detalhes) {
  var e = new Error(mensagem);
  e.status = status || 400;
  e.detalhes = detalhes;
  return e;
}

/**
 * Garante o estado das planilhas diárias (idempotente):
 * 1. fecha dias anteriores ainda abertos (fechamento tardio);
 * 2. fecha o dia de hoje se já passou das 16:40 (automático, ou tardio se passou da tolerância);
 * 3. cria a planilha de hoje se ainda não existir.
 */
function garantirTurnos(repo, agora) {
  var p = partesSP(agora);
  var fim = paraMinutos(CONFIG.TURNO_FIM);
  var resultado = { fechados: [], criado: null };
  repo.turnosAbertos().forEach(function (t) {
    if (t.data < p.data) {
      fecharDia(repo, t.data, 'tardio', 'Sistema', agora);
      resultado.fechados.push(t.data);
    }
  });
  if (!repo.turno(p.data)) {
    repo.criarTurno(p.data, p.iso);
    resultado.criado = p.data;
  }
  var hoje = repo.turno(p.data);
  if (!hoje.fechadoEm && p.minutos >= fim) {
    fecharDia(repo, p.data, p.minutos - fim <= CONFIG.TOLERANCIA_AUTOMATICO_MIN ? 'automatico' : 'tardio', 'Sistema', agora);
    resultado.fechados.push(p.data);
  }
  return resultado;
}

/** Fecha a planilha do dia e grava o snapshot imutável no histórico. */
function fecharDia(repo, data, tipo, por, agora) {
  var turno = repo.turno(data);
  if (!turno) throw ErroPresenca('Planilha do dia ' + data + ' não existe', 404);
  if (turno.fechadoEm) throw ErroPresenca('A planilha de ' + data + ' já está fechada', 409);
  var registros = porHorario(repo.registrosDoDia(data).filter(function (r) { return r.tipo === 'entrada' && !r.aposFechamento; }));
  var presentesMat = {};
  registros.forEach(function (r) { presentesMat[r.matricula] = true; });
  var ativos = repo.colaboradores().filter(function (c) { return c.ativo; });
  var linhas = registros.map(function (r) {
    return { data: data, situacao: 'Presente', nome: r.nome, matricula: r.matricula, funcao: r.funcao, dataHora: dataHoraLegivel(r.registradoEm), foraTurno: r.foraTurno };
  }).concat(ativos.filter(function (c) { return !presentesMat[c.matricula]; }).map(function (c) {
    return { data: data, situacao: 'Ausente', nome: c.nome, matricula: c.matricula, funcao: c.funcao, dataHora: '', foraTurno: false };
  }));
  repo.gravarHistorico(linhas);
  repo.fecharTurno(data, { fechadoEm: new Date(agora).toISOString(), tipo: tipo, por: por || '', totalPresentes: registros.length, totalAtivos: ativos.length });
  return { data: data, tipo: tipo, totalPresentes: registros.length };
}

function buscarColaborador(repo, codigo, origem) {
  var tag = normalizarTag(codigo);
  var lista = repo.colaboradores();
  var porTag = lista.filter(function (c) { return c.tag && c.tag === tag; });
  if (porTag.length > 1) throw ErroPresenca('Tag cadastrada para mais de um colaborador: corrija a aba Colaboradores', 409);
  if (porTag.length) return porTag[0];
  if (origem === 'simulacao') {
    var mat = String(codigo == null ? '' : codigo).trim();
    var porMatricula = lista.filter(function (c) { return c.matricula === mat; });
    if (porMatricula.length) return porMatricula[0];
  }
  return null;
}

/**
 * Registra a leitura de uma tag (ou simulação por matrícula/código).
 * Primeira leitura do dia: grava. Repetida: "já registrado às HH:MM". Tag desconhecida: não grava.
 * Planilha já fechada (após 16:40 ou fechamento manual): grava na lista "após o fechamento" até 23:59.
 */
function registrarLeitura(repo, agora, entrada) {
  garantirTurnos(repo, agora);
  var origem = entrada.origem === 'simulacao' ? 'simulacao' : 'nfc';
  var codigo = normalizarTag(entrada.codigo);
  if (!codigo) throw ErroPresenca('Código da tag vazio', 400);
  var c = buscarColaborador(repo, entrada.codigo, origem);
  var cadastro = '';
  if (!c && entrada.texto) {
    // Tag nova com "Nome|Matrícula|Função" gravado (ex.: pelo app NFC Tools): cadastra na primeira leitura.
    var auto = cadastrarPelaTag(repo, codigo, entrada.texto);
    if (auto.recusa) return auto.recusa;
    c = auto.colaborador;
    cadastro = auto.cadastro;
  }
  if (!c) return { ok: false, resultado: 'desconhecida', mensagem: 'Tag não cadastrada', codigo: codigo };
  var colaborador = { nome: c.nome, matricula: c.matricula, funcao: c.funcao };
  if (!c.ativo) return { ok: false, resultado: 'inativo', mensagem: 'Colaborador inativo', colaborador: colaborador };
  var p = partesSP(agora);
  var anterior = repo.registrosDoDia(p.data).filter(function (r) { return r.tipo === 'entrada' && r.matricula === c.matricula; })[0];
  if (anterior) {
    return { ok: false, resultado: 'duplicado', mensagem: 'Já registrado às ' + anterior.hora, horario: anterior.hora, colaborador: colaborador, aposFechamento: anterior.aposFechamento };
  }
  var turno = repo.turno(p.data);
  var apos = !!turno.fechadoEm;
  var fora = foraDoTurno(p.minutos);
  repo.adicionarRegistro({
    data: p.data, hora: p.hora, matricula: c.matricula, nome: c.nome, funcao: c.funcao, foraTurno: fora, aposFechamento: apos,
    origem: origem, dispositivo: entrada.dispositivo || '', registradoEm: p.iso, tipo: 'entrada',
  });
  return {
    ok: true, resultado: 'registrado', colaborador: colaborador, data: p.data, horario: p.hora, registradoEm: p.iso, foraTurno: fora, aposFechamento: apos,
    cadastro: cadastro,
    mensagem: apos ? 'Registrado após o fechamento da planilha' : fora ? 'Presença registrada (fora do turno)' : 'Presença registrada',
  };
}

/** Lê "Nome|Matrícula|Função" do texto gravado na tag. Campos a mais (ex.: data) são ignorados. */
function dadosDoTextoDaTag(texto) {
  var partes = String(texto == null ? '' : texto).split('|').map(function (x) { return x.trim(); });
  if (partes.length < 3 || !partes[0] || !partes[1] || !partes[2]) return null;
  return { nome: partes[0], matricula: partes[1], funcao: partes[2] };
}

/**
 * Cadastro automático na primeira leitura de uma tag com texto "Nome|Matrícula|Função".
 * - Matrícula nova: cria o colaborador ligado ao número de série da tag.
 * - Matrícula já cadastrada sem tag: liga a tag ao cadastro existente (o cadastro prevalece).
 * - Matrícula já ligada a outra tag: recusa (evita cópia de crachá).
 */
function cadastrarPelaTag(repo, codigo, texto) {
  var d = dadosDoTextoDaTag(texto);
  if (!d) {
    return { recusa: { ok: false, resultado: 'desconhecida', mensagem: 'Tag não cadastrada', codigo: codigo,
      detalhe: 'O texto gravado na tag não está no formato Nome|Matrícula|Função.' } };
  }
  var existente = repo.colaboradores().filter(function (x) { return x.matricula === d.matricula; })[0];
  if (existente && existente.tag && existente.tag !== codigo) {
    return { recusa: { ok: false, resultado: 'conflito', mensagem: 'Matrícula ' + d.matricula + ' já está ligada a outra tag', codigo: codigo,
      colaborador: { nome: existente.nome, matricula: existente.matricula, funcao: existente.funcao },
      detalhe: 'Se o crachá foi trocado, apague o código antigo no cadastro do colaborador.' } };
  }
  if (existente) {
    salvarColaborador(repo, { nome: existente.nome, matricula: existente.matricula, funcao: existente.funcao, tag: codigo, ativo: existente.ativo, matriculaOriginal: existente.matricula });
  } else {
    salvarColaborador(repo, { nome: d.nome, matricula: d.matricula, funcao: d.funcao, tag: codigo, ativo: true });
  }
  return { colaborador: buscarColaborador(repo, codigo, 'nfc'), cadastro: existente ? 'vinculado' : 'novo' };
}

/** Ordena registros pelo horário real da leitura. */
function porHorario(lista) {
  return lista.slice().sort(function (a, b) { return a.registradoEm < b.registradoEm ? -1 : a.registradoEm > b.registradoEm ? 1 : 0; });
}

function contarPorFuncao(lista) {
  var r = {};
  lista.forEach(function (x) { r[x.funcao] = (r[x.funcao] || 0) + 1; });
  return r;
}

function linhaPublica(r) {
  return { nome: r.nome, matricula: r.matricula, funcao: r.funcao, data: r.data, horario: r.hora, dataHora: dataHoraLegivel(r.registradoEm), registradoEm: r.registradoEm, foraTurno: r.foraTurno, origem: r.origem };
}

/** Planilha do dia: presentes, leituras após o fechamento, quem ainda não passou o cartão e contadores. */
function planilhaDoDia(repo, agora, data) {
  garantirTurnos(repo, agora);
  var dia = data || partesSP(agora).data;
  var turno = repo.turno(dia);
  if (!turno) throw ErroPresenca('Não há planilha para ' + dia, 404);
  var registros = porHorario(repo.registrosDoDia(dia).filter(function (r) { return r.tipo === 'entrada'; }));
  var aposFechamento = registros.filter(function (r) { return r.aposFechamento; }).map(linhaPublica);
  var presentes, ausentes, totalAtivos;
  if (turno.fechadoEm && data && data !== partesSP(agora).data) {
    // Dia anterior fechado: usa o snapshot imutável do histórico.
    var hist = repo.historicoDoDia(dia);
    presentes = hist.filter(function (h) { return h.situacao === 'Presente'; }).map(function (h) {
      return { nome: h.nome, matricula: h.matricula, funcao: h.funcao, data: dia, horario: h.dataHora.slice(11), dataHora: h.dataHora, foraTurno: h.foraTurno };
    });
    ausentes = hist.filter(function (h) { return h.situacao === 'Ausente'; }).map(function (h) { return { nome: h.nome, matricula: h.matricula, funcao: h.funcao }; });
    totalAtivos = turno.totalAtivos;
  } else {
    presentes = registros.filter(function (r) { return !r.aposFechamento; }).map(linhaPublica);
    var ativos = repo.colaboradores().filter(function (c) { return c.ativo; });
    var passou = {};
    registros.forEach(function (r) { passou[r.matricula] = true; });
    ausentes = ativos.filter(function (c) { return !passou[c.matricula]; }).map(function (c) { return { nome: c.nome, matricula: c.matricula, funcao: c.funcao }; });
    totalAtivos = turno.fechadoEm ? turno.totalAtivos : ativos.length;
  }
  if (turno.fechadoEm && data && data !== partesSP(agora).data) {
    var depois = {};
    aposFechamento.forEach(function (a) { depois[a.matricula] = true; });
    ausentes = ausentes.filter(function (a) { return !depois[a.matricula]; });
  }
  return {
    data: dia, aberto: !turno.fechadoEm, abertoEm: turno.abertoEm, fechadoEm: turno.fechadoEm, tipoFechamento: turno.tipo, fechadoPor: turno.por,
    turno: { inicio: CONFIG.TURNO_INICIO, fim: CONFIG.TURNO_FIM, fuso: CONFIG.FUSO },
    presentes: presentes, aposFechamento: aposFechamento, ausentes: ausentes,
    contadores: { presentes: presentes.length, ativos: totalAtivos, porFuncao: contarPorFuncao(presentes), aposFechamento: aposFechamento.length, ausentes: ausentes.length },
    atualizadoEm: new Date(agora).toISOString(),
  };
}

/** Lista das planilhas fechadas (mais recentes primeiro). */
function listarHistorico(repo) {
  return repo.turnos().filter(function (t) { return !!t.fechadoEm; }).sort(function (a, b) { return a.data < b.data ? 1 : -1; }).map(function (t) {
    return { data: t.data, fechadoEm: t.fechadoEm, tipoFechamento: t.tipo, fechadoPor: t.por, totalPresentes: t.totalPresentes, totalAtivos: t.totalAtivos };
  });
}

// ---------------- Colaboradores ----------------

function lerAtivo(v) {
  if (v === true || v === false) return v;
  var s = String(v == null ? '' : v).trim().toLowerCase();
  if (s === '') return true;
  if (['sim', 's', '1', 'true', 'ativo', 'verdadeiro', 'x'].indexOf(s) >= 0) return true;
  if (['não', 'nao', 'n', '0', 'false', 'inativo', 'falso'].indexOf(s) >= 0) return false;
  return null;
}

function validarColaborador(d) {
  var c = {
    nome: String(d.nome == null ? '' : d.nome).trim(),
    matricula: String(d.matricula == null ? '' : d.matricula).trim(),
    funcao: String(d.funcao == null ? '' : d.funcao).trim(),
    tag: normalizarTag(d.tag),
    ativo: lerAtivo(d.ativo),
  };
  var erros = [];
  if (!c.nome) erros.push('nome obrigatório');
  if (!c.matricula) erros.push('matrícula obrigatória');
  if (!c.funcao) erros.push('função obrigatória');
  if (c.ativo === null) erros.push('ativo deve ser Sim ou Não');
  if (c.tag && !/^[0-9A-F]+$/.test(c.tag)) erros.push('código da tag deve ser hexadecimal (ex.: 04:A1:B2)');
  return { c: c, erros: erros };
}

/** Cadastro/edição manual. matriculaOriginal identifica o registro em edição. */
function salvarColaborador(repo, dados) {
  var v = validarColaborador(dados);
  if (v.erros.length) throw ErroPresenca('Verifique: ' + v.erros.join(', '));
  var c = v.c;
  var lista = repo.colaboradores();
  var original = dados.matriculaOriginal ? String(dados.matriculaOriginal).trim() : '';
  var existente = original ? lista.filter(function (x) { return x.matricula === original; })[0] : null;
  if (original && !existente) throw ErroPresenca('Colaborador não encontrado', 404);
  var outros = lista.filter(function (x) { return x !== existente; });
  var mesmaMat = outros.filter(function (x) { return x.matricula === c.matricula; })[0];
  if (mesmaMat) throw ErroPresenca('Matrícula ' + c.matricula + ' já cadastrada para ' + mesmaMat.nome, 409);
  var mesmaTag = c.tag ? outros.filter(function (x) { return x.tag === c.tag; })[0] : null;
  if (mesmaTag) throw ErroPresenca('Tag ' + c.tag + ' já vinculada a ' + mesmaTag.nome + ' (matrícula ' + mesmaTag.matricula + ')', 409);
  c.linha = existente ? existente.linha : null;
  repo.salvarColaborador(c);
  return { nome: c.nome, matricula: c.matricula, funcao: c.funcao, tag: c.tag, ativo: c.ativo };
}

/** Importação (CSV já convertido em linhas). Atualiza pela matrícula. Tudo ou nada. */
function importarColaboradores(repo, linhas) {
  if (!linhas || !linhas.length) throw ErroPresenca('Nenhuma linha para importar');
  var lista = repo.colaboradores();
  var porMat = {};
  lista.forEach(function (x) { porMat[x.matricula] = x; });
  var erros = [], novos = [], vistosMat = {}, vistosTag = {};
  linhas.forEach(function (d, i) {
    var n = d.linha || i + 2;
    var v = validarColaborador(d);
    v.erros.forEach(function (e) { erros.push('Linha ' + n + ': ' + e); });
    if (v.erros.length) return;
    var c = v.c;
    if (vistosMat[c.matricula]) erros.push('Linha ' + n + ': matrícula ' + c.matricula + ' repetida no arquivo');
    vistosMat[c.matricula] = true;
    if (c.tag) {
      if (vistosTag[c.tag]) erros.push('Linha ' + n + ': tag ' + c.tag + ' repetida no arquivo');
      vistosTag[c.tag] = true;
      var dono = lista.filter(function (x) { return x.tag === c.tag && x.matricula !== c.matricula; })[0];
      if (dono) erros.push('Linha ' + n + ': tag ' + c.tag + ' já vinculada a ' + dono.nome);
    }
    c.linha = porMat[c.matricula] ? porMat[c.matricula].linha : null;
    novos.push(c);
  });
  if (erros.length) throw ErroPresenca('Importação cancelada: ' + erros.length + ' erro(s). Nada foi gravado.', 400, erros);
  var criados = 0, atualizados = 0;
  novos.forEach(function (c) {
    if (c.linha) atualizados++; else criados++;
    repo.salvarColaborador(c);
  });
  return { criados: criados, atualizados: atualizados };
}
