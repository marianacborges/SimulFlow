/**
 * E-mail diário com o resumo da presença (enviado ao fechar o dia) e relatório mensal.
 * Destinatários: aba "Config", chave "emails_resumo" (definidos pelo admin em Presença › Conexão).
 */

function emailsDoResumo(ss) {
  return String(valorConfig(ss, 'emails_resumo') || '').split(/[,;\s]+/).map(function (e) { return e.trim(); })
    .filter(function (e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); });
}

function escaparHtml(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Monta assunto e corpo do resumo de um dia a partir de uma "planilha do dia" (planilhaDoDia ou snapshot). */
function montarResumo(p, planilhaUrl, teste) {
  var data = p.data.split('-').reverse().join('/');
  var porFuncao = Object.keys(p.contadores.porFuncao).sort().map(function (f) { return f + ': ' + p.contadores.porFuncao[f]; });
  var fora = p.presentes.filter(function (x) { return x.foraTurno; }).length;
  var tipos = { automatico: 'automático às ' + CONFIG.TURNO_FIM, tardio: 'tardio', manual: 'manual' };
  var situacao = p.aberto ? 'ainda aberta' : 'fechada (' + (tipos[p.tipoFechamento] || p.tipoFechamento) + ')';
  var assunto = (teste ? '[teste] ' : '') + 'SimulFlow · Presença ' + data + ': ' + p.contadores.presentes + ' de ' + p.contadores.ativos + ' presentes';
  var texto = [
    'Presença de ' + data + ' — planilha ' + situacao,
    'Presentes: ' + p.contadores.presentes + ' de ' + p.contadores.ativos + ' ativos' + (fora ? ' (' + fora + ' fora do turno)' : ''),
    porFuncao.length ? 'Por função: ' + porFuncao.join(' · ') : '',
    'Não passaram o cartão (' + p.ausentes.length + '): ' + (p.ausentes.map(function (a) { return a.nome + ' (' + a.matricula + ')'; }).join(', ') || 'ninguém'),
    planilhaUrl ? 'Planilha: ' + planilhaUrl : '',
  ].filter(String).join('\n');
  var linha = function (a) { return '<tr><td style="padding:4px 10px 4px 0">' + escaparHtml(a.nome) + '</td><td style="padding:4px 10px 4px 0;color:#555">' + escaparHtml(a.matricula) + '</td><td style="padding:4px 0;color:#555">' + escaparHtml(a.funcao) + '</td></tr>'; };
  var html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1b2536">' +
    '<h2 style="margin:0 0 4px">Presença de ' + data + '</h2><p style="margin:0 0 14px;color:#555">Planilha ' + escaparHtml(situacao) + '</p>' +
    '<p style="font-size:18px;margin:0 0 6px"><strong>' + p.contadores.presentes + '</strong> de ' + p.contadores.ativos + ' presentes' + (fora ? ' <span style="color:#a15c00">(' + fora + ' fora do turno)</span>' : '') + '</p>' +
    (porFuncao.length ? '<p style="margin:0 0 14px;color:#333">' + escaparHtml(porFuncao.join(' · ')) + '</p>' : '') +
    '<h3 style="margin:16px 0 6px">Não passaram o cartão (' + p.ausentes.length + ')</h3>' +
    (p.ausentes.length ? '<table style="border-collapse:collapse">' + p.ausentes.map(linha).join('') + '</table>' : '<p style="color:#555">Ninguém.</p>') +
    (planilhaUrl ? '<p style="margin-top:18px"><a href="' + escaparHtml(planilhaUrl) + '">Abrir a planilha</a></p>' : '') +
    '<p style="margin-top:18px;color:#888;font-size:12px">Enviado pelo SimulFlow. Para mudar os destinatários: Presença operacional › Conexão (admin).</p></div>';
  return { assunto: assunto, texto: texto, html: html };
}

/** Envia o resumo do dia fechado (uma vez por dia). Devolve o que aconteceu, sem lançar erro. */
function enviarResumoDia(repo, data) {
  var turno = repo.turno(data);
  if (!turno || !turno.fechadoEm) return 'dia não fechado';
  if (turno.emailEnviado) return 'já enviado';
  var emails = emailsDoResumo(repo.planilha);
  if (!emails.length) return 'sem destinatários';
  var hist = repo.historicoDoDia(data);
  var presentes = hist.filter(function (h) { return h.situacao === 'Presente'; });
  var porFuncao = {};
  presentes.forEach(function (h) { porFuncao[h.funcao] = (porFuncao[h.funcao] || 0) + 1; });
  var p = {
    data: data, aberto: false, tipoFechamento: turno.tipo,
    presentes: presentes, ausentes: hist.filter(function (h) { return h.situacao === 'Ausente'; }),
    contadores: { presentes: turno.totalPresentes, ativos: turno.totalAtivos, porFuncao: porFuncao },
  };
  var r = montarResumo(p, repo.planilha.getUrl(), false);
  MailApp.sendEmail({ to: emails.join(','), subject: r.assunto, body: r.texto, htmlBody: r.html, name: 'SimulFlow' });
  repo.marcarEmailTurno(data, new Date(agoraAtual()).toISOString() + ' → ' + emails.join(', '));
  return 'enviado';
}

// ---------------- Relatório mensal ----------------

function relatorioMensal(repo, mes) {
  if (!/^\d{4}-\d{2}$/.test(String(mes || ''))) throw ErroPresenca('Mês inválido (use AAAA-MM)');
  var dias = repo.turnos().filter(function (t) { return t.data.indexOf(mes) === 0 && !!t.fechadoEm; })
    .sort(function (a, b) { return a.data < b.data ? -1 : 1; });
  var fechados = {};
  dias.forEach(function (t) { fechados[t.data] = true; });
  var porMat = {};
  var pessoa = function (h) {
    if (!porMat[h.matricula]) porMat[h.matricula] = { nome: h.nome, matricula: h.matricula, funcao: h.funcao, presentes: 0, faltas: 0, foraTurno: 0, aposFechamento: 0, ultimoDia: '' };
    var x = porMat[h.matricula];
    if (h.data >= x.ultimoDia) { x.nome = h.nome; x.funcao = h.funcao; x.ultimoDia = h.data; }
    return x;
  };
  repo.historicoDoMes(mes).forEach(function (h) {
    if (!fechados[h.data]) return;
    var x = pessoa(h);
    if (h.situacao === 'Presente') { x.presentes++; if (h.foraTurno) x.foraTurno++; } else if (h.situacao === 'Ausente') x.faltas++;
  });
  repo.registrosDoMes(mes).forEach(function (r) {
    if (r.aposFechamento && r.tipo === 'entrada') pessoa(r).aposFechamento++;
  });
  var colaboradores = Object.keys(porMat).map(function (k) {
    var x = porMat[k];
    var base = x.presentes + x.faltas;
    return { nome: x.nome, matricula: x.matricula, funcao: x.funcao, presentes: x.presentes, faltas: x.faltas, foraTurno: x.foraTurno,
      aposFechamento: x.aposFechamento, diasAtivos: base, percentual: base ? Math.round(x.presentes / base * 1000) / 10 : 0 };
  }).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
  var total = dias.reduce(function (s, t) { return s + t.totalPresentes; }, 0);
  return {
    mes: mes,
    dias: dias.map(function (t) { return { data: t.data, presentes: t.totalPresentes, ativos: t.totalAtivos, tipoFechamento: t.tipo }; }),
    colaboradores: colaboradores,
    totais: { diasFechados: dias.length, mediaPresentes: dias.length ? Math.round(total / dias.length * 10) / 10 : 0 },
  };
}

var ACOES_RESUMO = {
  'config.ler': {
    perfis: ['admin'], semTurnos: true,
    executar: function (repo) { return { emailsResumo: emailsDoResumo(repo.planilha).join(', ') }; },
  },
  'config.salvar': {
    perfis: ['admin'], semTurnos: true,
    executar: function (repo, agora, corpo) {
      var lista = String(corpo.emailsResumo || '').split(/[,;\s]+/).map(function (e) { return e.trim(); }).filter(String);
      var invalidos = lista.filter(function (e) { return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); });
      if (invalidos.length) throw ErroPresenca('E-mail inválido: ' + invalidos.join(', '));
      if (lista.length > 20) throw ErroPresenca('Informe no máximo 20 e-mails');
      salvarConfigPlanilha(repo.planilha, 'emails_resumo', lista.join(', '));
      return { emailsResumo: lista.join(', ') };
    },
  },
  'resumo.teste': {
    perfis: ['admin'],
    executar: function (repo, agora) {
      var emails = emailsDoResumo(repo.planilha);
      if (!emails.length) throw ErroPresenca('Salve ao menos um e-mail antes de testar');
      var r = montarResumo(planilhaDoDia(repo, agora), repo.planilha.getUrl(), true);
      MailApp.sendEmail({ to: emails.join(','), subject: r.assunto, body: r.texto, htmlBody: r.html, name: 'SimulFlow' });
      return { enviadoPara: emails.join(', ') };
    },
  },
  'relatorio.mes': {
    perfis: ['planejamento', 'admin'],
    executar: function (repo, agora, corpo) { return { relatorio: relatorioMensal(repo, corpo.mes) }; },
  },
};
