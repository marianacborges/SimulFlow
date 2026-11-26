// Testes das partes da Presença que rodam no navegador: CSV, XLSX e normalização da tag no leitor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { lerCSV, colaboradoresDoCSV, gerarCSV, MODELO_CSV } from '../js/presenca/csv.js';
import { gerarXlsx, crc32 } from '../js/core/xlsx.js';
import { normalizarTag } from '../js/presenca/leitor.js';

test('leitor normaliza o serialNumber igual ao Apps Script', () => {
  assert.equal(normalizarTag('04:a1:b2'), '04A1B2');
  assert.equal(normalizarTag(' 04:A1:B2:C3 '), '04A1B2C3');
});

test('CSV com ";" , "," BOM e aspas', () => {
  assert.deepEqual(lerCSV('﻿a;b\r\n"x;y";"di ""z"""\r\n'), [['a', 'b'], ['x;y', 'di "z"']]);
  assert.deepEqual(lerCSV('a,b\n1,2\n\n'), [['a', 'b'], ['1', '2']]);
});

test('importação de colaboradores reconhece cabeçalhos com acento e variações', () => {
  const linhas = colaboradoresDoCSV('Nome;Matrícula;Função;Código da tag;Ativo\nAna;00123;Soldador;04:A1;Sim\nBruno;00456;Montador;;não\n');
  assert.deepEqual(linhas, [
    { linha: 2, nome: 'Ana', matricula: '00123', funcao: 'Soldador', tag: '04:A1', ativo: 'Sim' },
    { linha: 3, nome: 'Bruno', matricula: '00456', funcao: 'Montador', tag: '', ativo: 'não' },
  ]);
  assert.throws(() => colaboradoresDoCSV('Nome;Cargo\nAna;Soldador\n'), /matricula/);
  assert.equal(colaboradoresDoCSV(MODELO_CSV).length, 2);
});

test('CSV gerado usa ";" e BOM para o Excel em português', () => {
  const csv = gerarCSV([['Nome', 'Matrícula'], ['Ana "A"', '00123']]);
  assert.ok(csv.startsWith('﻿"Nome";"Matrícula"'));
  assert.ok(csv.includes('"Ana ""A""";"00123"'));
});

/** Lê um zip (armazenado ou deflate) e devolve { nome: texto }, conferindo o CRC de cada arquivo. */
function lerZip(buf) {
  const b = Buffer.from(buf);
  const arquivos = {};
  let p = 0;
  while (b.readUInt32LE(p) === 0x04034b50) {
    const metodo = b.readUInt16LE(p + 8), crc = b.readUInt32LE(p + 14), tam = b.readUInt32LE(p + 18);
    const nLen = b.readUInt16LE(p + 26), xLen = b.readUInt16LE(p + 28);
    const nome = b.subarray(p + 30, p + 30 + nLen).toString('utf8');
    let dados = b.subarray(p + 30 + nLen + xLen, p + 30 + nLen + xLen + tam);
    if (metodo === 8) dados = zlib.inflateRawSync(dados);
    assert.equal(crc32(dados), crc, 'CRC de ' + nome);
    arquivos[nome] = dados.toString('utf8');
    p += 30 + nLen + xLen + tam;
  }
  assert.equal(b.readUInt32LE(p), 0x02014b50, 'diretório central');
  return arquivos;
}

test('XLSX gerado é um zip válido com as abas e os valores', () => {
  const bytes = gerarXlsx([
    { nome: 'Presentes', linhas: [['Nome', 'Matrícula', 'Função', 'Data/Hora'], ['Ana & Cia <x>', '00123', 'Soldador', '26/11/2026 08:05']], larguras: [30, 12] },
    { nome: 'Resumo', linhas: [['Campo', 'Valor'], ['Presentes', 1]] },
  ]);
  const z = lerZip(bytes);
  assert.ok(z['[Content_Types].xml'].includes('/xl/worksheets/sheet2.xml'));
  assert.ok(z['xl/workbook.xml'].includes('<sheet name="Presentes" sheetId="1"'));
  assert.ok(z['xl/worksheets/sheet1.xml'].includes('Ana &amp; Cia &lt;x&gt;'));
  assert.ok(z['xl/worksheets/sheet1.xml'].includes('<t xml:space="preserve">00123</t>'), 'matrícula como texto');
  assert.ok(z['xl/worksheets/sheet2.xml'].includes('<v>1</v>'), 'número como número');
  assert.ok(z['xl/styles.xml'].includes('<b/>'));
});

test('texto gravado na tag (NFC Tools): lê o registro de texto e separa Nome|Matrícula|Função', async () => {
  const { textoDaTag, dadosDoTexto } = await import('../js/presenca/leitor.js');
  const bytes = new TextEncoder().encode('Maria Silva | 12345 | Soldadora');
  const mensagem = { records: [{ recordType: 'url', data: new DataView(new ArrayBuffer(2)) }, { recordType: 'text', encoding: 'utf-8', data: new DataView(bytes.buffer) }] };
  assert.equal(textoDaTag(mensagem), 'Maria Silva | 12345 | Soldadora');
  assert.equal(textoDaTag({ records: [] }), '');
  assert.equal(textoDaTag(undefined), '');
  assert.deepEqual(dadosDoTexto(textoDaTag(mensagem)), { nome: 'Maria Silva', matricula: '12345', funcao: 'Soldadora' });
  assert.deepEqual(dadosDoTexto('João|222|Pintor|26/11/2026'), { nome: 'João', matricula: '222', funcao: 'Pintor' });
  assert.equal(dadosDoTexto('Maria Silva'), null);
  assert.equal(dadosDoTexto('Maria||Soldadora'), null);
});
