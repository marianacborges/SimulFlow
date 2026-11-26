// Gerador de planilhas .xlsx sem bibliotecas (zip "armazenado" + XML do Office Open XML).
// Funciona no navegador e no node (testes). abas = [{ nome, linhas: [[...], ...], larguras?: [n, ...] }]
// A primeira linha de cada aba é tratada como cabeçalho (negrito e congelada).

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const utf8 = s => new TextEncoder().encode(s);

/** Zip sem compressão (método 0). arquivos = [{ nome, dados: Uint8Array }] */
export function zip(arquivos) {
  const partes = [];
  const central = [];
  let offset = 0;
  for (const a of arquivos) {
    const nome = utf8(a.nome);
    const crc = crc32(a.dados);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint16(10, 0, true); local.setUint16(12, 0x0021, true);
    local.setUint32(14, crc, true); local.setUint32(18, a.dados.length, true); local.setUint32(22, a.dados.length, true);
    local.setUint16(26, nome.length, true); local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nome, a.dados);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true); cd.setUint16(12, 0, true); cd.setUint16(14, 0x0021, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, a.dados.length, true); cd.setUint32(24, a.dados.length, true);
    cd.setUint16(28, nome.length, true); cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nome);
    offset += 30 + nome.length + a.dados.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true); fim.setUint32(16, offset, true);
  const todas = [...partes, ...central, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(todas.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of todas) { saida.set(p, pos); pos += p.length; }
  return saida;
}

const xml = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function coluna(n) {
  let s = '';
  for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function nomeAba(nome, usados) {
  let n = String(nome || 'Planilha').replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Planilha';
  let i = 2;
  const base = n;
  while (usados.has(n)) n = (base.slice(0, 28) + ' ' + i++).slice(0, 31);
  usados.add(n);
  return n;
}

function folha(linhas, larguras) {
  const cols = larguras?.length ? `<cols>${larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const rows = linhas.map((l, i) => `<row r="${i + 1}">${l.map((v, j) => {
    const ref = coluna(j) + (i + 1);
    const estilo = i === 0 ? ' s="1"' : '';
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${estilo}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${estilo}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

/** Gera o arquivo .xlsx (Uint8Array). */
export function gerarXlsx(abas) {
  const usados = new Set();
  const nomes = abas.map(a => nomeAba(a.nome, usados));
  const ns = 'http://schemas.openxmlformats.org';
  const arquivos = [
    { nome: '[Content_Types].xml', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { nome: '_rels/.rels', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nome: 'xl/workbook.xml', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets>${nomes.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { nome: 'xl/_rels/workbook.xml.rels', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}/package/2006/relationships">${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${abas.length + 1}" Type="${ns}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { nome: 'xl/styles.xml', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${ns}/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    ...abas.map((a, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, texto: folha(a.linhas.length ? a.linhas : [['(sem registros)']], a.larguras) })),
  ];
  return zip(arquivos.map(a => ({ nome: a.nome, dados: utf8(a.texto) })));
}

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
