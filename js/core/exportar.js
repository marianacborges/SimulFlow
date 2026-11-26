// Exportações sem bibliotecas: CSV, planilha Excel (XML 2003, várias abas), relatório para PDF (impressão) e JSON.
import { toast, esc } from './ui.js';

export function baixar(nome, conteudo, tipo) {
  const url = URL.createObjectURL(conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** CSV separado por ";" com BOM UTF-8 (abre corretamente no Excel em português). */
export function baixarCSV(nome, linhas) {
  if (!linhas.length) { toast('Nenhum registro para exportar', 'info'); return; }
  const chaves = Object.keys(linhas[0]);
  const csv = '﻿' + [chaves, ...linhas.map(l => chaves.map(k => l[k]))]
    .map(r => r.map(v => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(';')).join('\r\n');
  baixar(nome + '.csv', csv, 'text/csv;charset=utf-8');
  toast('Arquivo exportado');
}

/** Planilha Excel (SpreadsheetML 2003) com várias abas: abas = [{ nome, linhas }]. */
export function baixarExcel(nome, abas) {
  const x = v => esc(v).replace(/\n/g, '&#10;');
  const folha = ({ nome: n, linhas }) => {
    const chaves = linhas.length ? Object.keys(linhas[0]) : ['(sem registros)'];
    const cel = v => typeof v === 'number' ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>` : `<Cell><Data ss:Type="String">${x(v ?? '')}</Data></Cell>`;
    return `<Worksheet ss:Name="${x(String(n).slice(0, 31))}"><Table>` +
      `<Row>${chaves.map(k => `<Cell ss:StyleID="h"><Data ss:Type="String">${x(k)}</Data></Cell>`).join('')}</Row>` +
      linhas.map(l => `<Row>${chaves.map(k => cel(l[k])).join('')}</Row>`).join('') +
      `</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>`;
  };
  const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>${abas.map(folha).join('')}</Workbook>`;
  baixar(nome + '.xls', xml, 'application/vnd.ms-excel');
  toast('Planilha exportada');
}

/**
 * Relatório para PDF: abre uma janela formatada e chama a impressão do navegador
 * (o usuário escolhe "Salvar como PDF"). secoes = [{ titulo, linhas: [texto] }].
 */
export function relatorioPDF({ titulo, subtitulo = '', cabecalho = [], secoes = [], arquivo = 'relatorio' }) {
  const w = window.open('', '_blank');
  if (!w) { toast('Permita janelas pop-up para gerar o PDF', 'erro'); return false; }
  const corpo = secoes.map(s => `<h2>${esc(s.titulo)}</h2>${s.linhas.length ? s.linhas.map(l => `<p class="b">${esc(l).replace(/\n/g, '<br>')}</p>`).join('') : '<p class="b muted">Nenhum registro para os filtros selecionados</p>'}`).join('');
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(arquivo)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#1d2b42;margin:24px}h1{font-size:18px;margin:0}h2{font-size:13px;margin:18px 0 6px;border-bottom:1px solid #ccd;padding-bottom:3px}
    .sub{font-size:13px;margin:4px 0 8px}.cab{color:#556;font-size:10px;margin:2px 0}.b{margin:0;padding:5px 0;border-bottom:1px solid #eee;page-break-inside:avoid}.muted{color:#778}
    @page{margin:14mm}footer{margin-top:20px;font-size:9px;color:#778}</style></head><body>
    <h1>${esc(titulo)}</h1><div class="sub">${esc(subtitulo)}</div>${cabecalho.map(c => `<p class="cab">${esc(c)}</p>`).join('')}${corpo}
    <footer>Documento gerado a partir de dados do sistema em ${esc(new Date().toLocaleString('pt-BR'))}. Os dados refletem o momento da geração.</footer>
    <script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script></body></html>`);
  w.document.close();
  return true;
}

export function baixarJSON(nome, objeto) {
  baixar(nome + '.json', JSON.stringify(objeto, null, 2), 'application/json');
}

/** Lê um arquivo JSON escolhido pelo usuário. */
export function escolherJSON() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return reject(new Error('Nenhum arquivo selecionado'));
      try { resolve(JSON.parse(await f.text())); } catch { reject(new Error('Arquivo JSON inválido')); }
    };
    input.click();
  });
}
