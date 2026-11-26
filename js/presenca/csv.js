// CSV para a Presença: leitura (separador ; , ou TAB, aspas, BOM) e geração (";" + BOM para o Excel em pt-BR).

export function lerCSV(texto) {
  const t = String(texto ?? '').replace(/^﻿/, '');
  const primeira = t.split(/\r?\n/, 1)[0] || '';
  const sep = [';', ',', '\t'].map(s => [s, primeira.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = '';
    } else campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter(l => l.some(v => String(v).trim() !== ''));
}

export function gerarCSV(linhas) {
  return '﻿' + linhas.map(l => l.map(v => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(';')).join('\r\n') + '\r\n';
}

const normal = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const COLUNAS = {
  nome: ['nome', 'colaborador', 'nome completo'],
  matricula: ['matricula', 'numero de cadastro', 'cadastro', 'registro', 'chapa'],
  funcao: ['funcao', 'cargo'],
  tag: ['tag', 'codigo da tag', 'codigo da tag nfc', 'tag nfc', 'codigo', 'uid', 'tag uid', 'cartao'],
  ativo: ['ativo', 'situacao', 'status'],
};

/** Converte o CSV de colaboradores em objetos { linha, nome, matricula, funcao, tag, ativo }. */
export function colaboradoresDoCSV(texto) {
  const linhas = lerCSV(texto);
  if (linhas.length < 2) throw new Error('O arquivo precisa ter cabeçalho e pelo menos uma linha');
  const cab = linhas[0].map(normal);
  const indice = {};
  for (const [campo, nomes] of Object.entries(COLUNAS)) indice[campo] = cab.findIndex(c => nomes.includes(c));
  const faltando = ['nome', 'matricula', 'funcao'].filter(c => indice[c] < 0);
  if (faltando.length) throw new Error('Colunas obrigatórias ausentes: ' + faltando.join(', ') + '. Use o modelo: Nome;Matrícula;Função;Código da tag;Ativo');
  return linhas.slice(1).map((l, i) => {
    const v = c => (indice[c] >= 0 ? String(l[indice[c]] ?? '').trim() : '');
    return { linha: i + 2, nome: v('nome'), matricula: v('matricula'), funcao: v('funcao'), tag: v('tag'), ativo: v('ativo') };
  });
}

export const MODELO_CSV = gerarCSV([
  ['Nome', 'Matrícula', 'Função', 'Código da tag', 'Ativo'],
  ['Ana Souza', '00123', 'Soldador', '04:A1:B2:C3', 'Sim'],
  ['Bruno Lima', '00456', 'Montador', '', 'Sim'],
]);
