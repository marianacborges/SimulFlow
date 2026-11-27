#!/usr/bin/env node
// SimulFlow — comandos de edição do sistema (Node.js 18+, sem dependências externas).
// Uso: node tools/simulflow.js <comando> [argumentos]   ·   node tools/simulflow.js ajuda
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAMINHO = {
  abas: path.join(RAIZ, 'config/abas.json'),
  campos: path.join(RAIZ, 'config/campos.json'),
  app: path.join(RAIZ, 'config/app.json'),
  modelo: path.join(RAIZ, 'tools/modelo-aba.js'),
  abasDir: path.join(RAIZ, 'js/abas'),
  dadosIniciais: path.join(RAIZ, 'data/dados-iniciais.json'),
  backups: path.join(RAIZ, 'backups'),
  dist: path.join(RAIZ, 'dist'),
};
const ENTIDADES = ['op', 'fa', 'obra', 'pedido', 'item', 'etapa', 'material'];
const TIPOS_CAMPO = ['texto', 'texto-longo', 'numero', 'data', 'sim-nao', 'lista'];

const lerJSON = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const gravarJSON = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n'); };
const ok = msg => console.log('✓ ' + msg);
function falhar(msg) { console.error('✗ ' + msg); process.exit(1); }

function lerAbas() { return lerJSON(CAMINHO.abas); }
function gravarAbas(abas) { gravarJSON(CAMINHO.abas, abas.sort((a, b) => a.ordem - b.ordem)); }
function acharAba(abas, id) { const a = abas.find(x => x.id === id); if (!a) falhar(`Aba "${id}" não existe. Veja: node tools/simulflow.js listar-abas`); return a; }
function renumerar(abas) { abas.sort((a, b) => a.ordem - b.ordem).forEach((a, i) => { a.ordem = i + 1; }); return abas; }

// ---------------- Comandos ----------------

const comandos = {
  ajuda() {
    console.log(`SimulFlow — comandos

  listar-abas                              Lista as abas registradas em config/abas.json
  nova-aba <id> "<Título>" [ícone] [perfis] Cria js/abas/<id>.js a partir do modelo e registra a aba
                                           perfis: todos (padrão) | host | áreas separadas por vírgula
  ocultar-aba <id>                         Esconde a aba do menu (o módulo continua no projeto)
  mostrar-aba <id>                         Volta a exibir a aba
  ordem <id> <n>                           Move a aba para a posição n do menu
  renomear-aba <id> "<Título>"             Troca o título exibido
  campo <aba|entidade> <nome> <tipo> ["Rótulo"] [opção1|opção2]
                                           Adiciona campo ao modelo (aparece nos formulários e detalhes)
                                           entidades: ${ENTIDADES.join(', ')} · tipos: ${TIPOS_CAMPO.join(', ')}
  remover-campo <aba|entidade> <nome>      Remove o campo extra (valores já gravados são preservados)
  exportar [arquivo]                       Exporta configuração + dados iniciais para backups/
  importar <arquivo>                       Importa: backup do navegador (vira data/dados-iniciais.json)
                                           ou exportação do projeto (restaura config e dados iniciais)
  servir [porta]                           Servidor local para abrir o sistema no navegador (padrão 8080)
  empacotar                                Gera dist/simulflow.html (arquivo único, abre com duplo clique)
  testar                                   Roda os testes das regras de negócio
  verificar                                Valida abas, módulos e campos; procura referências proibidas
  emular-planilha [porta] [--vazio] [--relogio=AAAA-MM-DDTHH:MM-03:00]
                                           Roda o Apps Script da Presença localmente, sem conta Google (padrão 8790)`);
  },

  /**
   * Emulador da planilha Google: executa os arquivos apps-script/*.gs com o Google falso
   * (mesmo código que vai para o Apps Script), em memória. Só para testes e treinamento.
   */
  async 'emular-planilha'(...args) {
    const porta = Number(args.find(a => /^\d+$/.test(a)) || 8790);
    const vazio = args.includes('--vazio');
    const inicio = args.find(a => a.startsWith('--relogio='))?.slice(10);
    const { carregarAppsScript } = await import(new URL('../apps-script/testes/google-falso.js', import.meta.url));
    const g = carregarAppsScript({ relogioReal: true });
    if (inicio) {
      if (Number.isNaN(Date.parse(inicio))) falhar('Use --relogio=AAAA-MM-DDTHH:MM:SS-03:00');
      g.relogio.definir(inicio);
    }
    const tokens = { admin: g.criarToken('Administrador (emulador)', 'admin'), planejamento: g.criarToken('PC do Planejamento (emulador)', 'planejamento'), leitor: g.criarToken('Celular do Planejamento (emulador)', 'leitor') };
    if (!vazio) {
      for (const [nome, matricula, funcao, tag] of [['Ana Souza', '00123', 'Soldador', '04:A1:B2:C3'], ['Bruno Lima', '00456', 'Montador', '04:D4:E5:F6'], ['Carla Dias', '00789', 'Soldador', '04:11:22:33'], ['Diego Alves', '01011', 'Pintor', '']]) {
        g.api('colaboradores.salvar', { colaborador: { nome, matricula, funcao, tag, ativo: true } }, tokens.planejamento);
      }
    }
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    http.createServer((req, res) => {
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
      let corpo = '';
      req.on('data', c => { corpo += c; if (corpo.length > 2e6) req.destroy(); });
      req.on('end', () => {
        let saida;
        try {
          if (req.method === 'POST' && req.url === '/__relogio') {
            const { iso } = JSON.parse(corpo || '{}');
            if (iso) g.relogio.definir(iso); else g.relogio.real();
            saida = JSON.stringify({ ok: true, agora: g.relogio.agora().toISOString() });
          } else if (req.method === 'POST') {
            saida = g.ctx.doPost({ postData: { contents: corpo } }).getContent();
          } else {
            saida = g.ctx.doGet().getContent();
          }
        } catch (e) {
          saida = JSON.stringify({ ok: false, status: 500, erro: e.message });
        }
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(saida);
      });
    }).listen(porta, '127.0.0.1', () => {
      ok(`Emulador da planilha em http://localhost:${porta}/  (dados só em memória; Ctrl+C para parar)`);
      console.log(`  Use esta URL na aba Presença › Conexão, com um dos tokens:`);
      for (const [perfil, t] of Object.entries(tokens)) console.log(`    ${perfil.padEnd(13)} ${t}`);
      if (!vazio) console.log('  Colaboradores de exemplo: tags 04:A1:B2:C3, 04:D4:E5:F6, 04:11:22:33 (matrículas 00123, 00456, 00789, 01011).');
    });
  },

  'listar-abas'() {
    for (const a of lerAbas().sort((x, y) => x.ordem - y.ordem)) {
      console.log(`${String(a.ordem).padStart(2)}  ${a.visivel === false ? '(oculta) ' : ''}${a.id.padEnd(15)} ${a.titulo.padEnd(24)} js/abas/${a.modulo}  perfis: ${(a.perfis || ['todos']).join(',')}`);
    }
  },

  'nova-aba'(id, titulo, icone = 'file', perfis = 'todos') {
    if (!id || !titulo) falhar('Uso: node tools/simulflow.js nova-aba <id> "<Título>" [ícone] [perfis]');
    if (!/^[a-z][a-z0-9-]*$/.test(id)) falhar('O id deve ter só letras minúsculas, números e hífen, começando com letra (ex.: manutencao)');
    const abas = lerAbas();
    if (abas.some(a => a.id === id)) falhar(`Já existe uma aba "${id}"`);
    const arquivo = path.join(CAMINHO.abasDir, id + '.js');
    if (fs.existsSync(arquivo)) falhar(`O arquivo js/abas/${id}.js já existe`);
    const modelo = fs.readFileSync(CAMINHO.modelo, 'utf8').replaceAll('__ID__', id).replaceAll('__TITULO__', titulo.replace(/'/g, "\\'"));
    fs.writeFileSync(arquivo, modelo);
    const listaPerfis = perfis.split(',').map(s => s.trim()).filter(Boolean);
    abas.push({ id, titulo, icone, modulo: id + '.js', ordem: Math.max(0, ...abas.map(a => a.ordem)) + 1, visivel: true, perfis: listaPerfis, entidade: null, descricao: '' });
    gravarAbas(abas);
    ok(`Aba "${titulo}" criada: js/abas/${id}.js e registrada em config/abas.json`);
    console.log('  O host vê a aba imediatamente. Para outros usuários, libere o acesso em Usuários e permissões.');
  },

  'ocultar-aba'(id) { const abas = lerAbas(); acharAba(abas, id).visivel = false; gravarAbas(abas); ok(`Aba "${id}" oculta`); },
  'mostrar-aba'(id) { const abas = lerAbas(); acharAba(abas, id).visivel = true; gravarAbas(abas); ok(`Aba "${id}" visível`); },

  ordem(id, n) {
    const pos = Number(n);
    if (!Number.isInteger(pos) || pos < 1) falhar('Uso: node tools/simulflow.js ordem <id> <n> (n ≥ 1)');
    const abas = renumerar(lerAbas());
    const aba = acharAba(abas, id);
    const resto = abas.filter(a => a !== aba);
    resto.splice(Math.min(pos - 1, resto.length), 0, aba);
    resto.forEach((a, i) => { a.ordem = i + 1; });
    gravarAbas(resto);
    ok(`Aba "${id}" na posição ${aba.ordem}`);
  },

  'renomear-aba'(id, titulo) {
    if (!titulo) falhar('Uso: node tools/simulflow.js renomear-aba <id> "<Título>"');
    const abas = lerAbas(); acharAba(abas, id).titulo = titulo; gravarAbas(abas); ok(`Aba "${id}" agora se chama "${titulo}"`);
  },

  campo(alvo, nome, tipo, rotulo, opcoes) {
    if (!alvo || !nome || !tipo) falhar('Uso: node tools/simulflow.js campo <aba|entidade> <nome> <tipo> ["Rótulo"] [opção1|opção2]');
    const entidade = resolverEntidade(alvo);
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(nome)) falhar('Nome do campo inválido (use letras, números e _; ex.: numeroDesenho)');
    if (!TIPOS_CAMPO.includes(tipo)) falhar(`Tipo inválido. Use: ${TIPOS_CAMPO.join(', ')}`);
    if (tipo === 'lista' && !opcoes) falhar('Campos do tipo lista precisam das opções: ex. "Baixa|Média|Alta"');
    const campos = lerJSON(CAMINHO.campos);
    campos[entidade] = campos[entidade] || [];
    if (campos[entidade].some(c => c.nome === nome)) falhar(`O campo "${nome}" já existe em ${entidade}`);
    campos[entidade].push({ nome, tipo, rotulo: rotulo || nome, ...(tipo === 'lista' ? { opcoes: opcoes.split('|').map(s => s.trim()).filter(Boolean) } : {}) });
    gravarJSON(CAMINHO.campos, campos);
    ok(`Campo "${nome}" (${tipo}) adicionado em ${entidade}. Aparece nos formulários e detalhes de ${entidade}.`);
  },

  'remover-campo'(alvo, nome) {
    const entidade = resolverEntidade(alvo);
    const campos = lerJSON(CAMINHO.campos);
    const antes = (campos[entidade] || []).length;
    campos[entidade] = (campos[entidade] || []).filter(c => c.nome !== nome);
    if (campos[entidade].length === antes) falhar(`Campo "${nome}" não encontrado em ${entidade}`);
    gravarJSON(CAMINHO.campos, campos);
    ok(`Campo "${nome}" removido de ${entidade} (valores já gravados continuam nos registros)`);
  },

  exportar(arquivo) {
    const pacote = {
      formato: 'simulflow-projeto', versao: 1, exportadoEm: new Date().toISOString(),
      config: { app: lerJSON(CAMINHO.app), abas: lerAbas(), campos: lerJSON(CAMINHO.campos) },
      dadosIniciais: fs.existsSync(CAMINHO.dadosIniciais) ? lerJSON(CAMINHO.dadosIniciais) : null,
    };
    const destino = arquivo ? path.resolve(arquivo) : path.join(CAMINHO.backups, `simulflow-projeto-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
    gravarJSON(destino, pacote);
    ok(`Exportado: ${path.relative(process.cwd(), destino)}`);
    console.log('  Contém a configuração (abas, campos, app.json) e os dados iniciais instalados.');
    console.log('  Os dados do dia a dia ficam no navegador: exporte-os em Configurações › Exportar JSON completo.');
  },

  importar(arquivo) {
    if (!arquivo) falhar('Uso: node tools/simulflow.js importar <arquivo.json>');
    let pacote;
    try { pacote = lerJSON(path.resolve(arquivo)); } catch (e) { falhar('Não foi possível ler o arquivo: ' + e.message); }
    if (pacote.formato === 'simulflow-backup') {
      validarBackup(pacote);
      gravarJSON(CAMINHO.dadosIniciais, pacote);
      ok('Backup do navegador instalado como data/dados-iniciais.json');
      console.log('  Ele é carregado automaticamente no primeiro acesso de cada navegador, ou pelo host em Configurações › Carregar data/dados-iniciais.json.');
    } else if (pacote.formato === 'simulflow-projeto') {
      if (!pacote.config?.abas || !pacote.config?.app) falhar('Exportação de projeto incompleta');
      gravarJSON(CAMINHO.app, pacote.config.app);
      gravarJSON(CAMINHO.abas, pacote.config.abas);
      gravarJSON(CAMINHO.campos, pacote.config.campos || {});
      if (pacote.dadosIniciais) { validarBackup(pacote.dadosIniciais); gravarJSON(CAMINHO.dadosIniciais, pacote.dadosIniciais); }
      const faltando = pacote.config.abas.filter(a => !fs.existsSync(path.join(CAMINHO.abasDir, a.modulo)));
      ok('Configuração restaurada' + (pacote.dadosIniciais ? ' e dados iniciais instalados' : ''));
      if (faltando.length) console.log('  Atenção: módulos ausentes: ' + faltando.map(a => 'js/abas/' + a.modulo).join(', '));
    } else {
      falhar('Formato desconhecido (esperado: backup do navegador ou exportação do projeto)');
    }
  },

  servir(porta = '8080') {
    const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
    const servidor = http.createServer((req, res) => {
      const url = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      const alvo = path.normalize(path.join(RAIZ, url === '/' ? 'index.html' : url));
      if (!alvo.startsWith(RAIZ + path.sep) && alvo !== RAIZ) { res.writeHead(403); res.end('Proibido'); return; }
      if (/[\\/](backups|tools|\.git)[\\/]/.test(alvo.slice(RAIZ.length))) { res.writeHead(404); res.end('Não encontrado'); return; }
      fs.readFile(alvo, (erro, conteudo) => {
        if (erro) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Não encontrado'); return; }
        res.writeHead(200, { 'Content-Type': tipos[path.extname(alvo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(conteudo);
      });
    });
    servidor.listen(Number(porta), '127.0.0.1', () => {
      ok(`SimulFlow em http://localhost:${porta}  (Ctrl+C para parar)`);
    });
  },

  empacotar() {
    const destino = path.join(CAMINHO.dist, 'simulflow.html');
    const html = empacotar();
    fs.mkdirSync(CAMINHO.dist, { recursive: true });
    fs.writeFileSync(destino, html);
    ok(`Gerado ${path.relative(process.cwd(), destino)} (${Math.round(html.length / 1024)} KB). Abra com duplo clique.`);
    console.log('  Observação: o arquivo único não lê data/dados-iniciais.json; use Configurações › Importar JSON.');
  },

  async testar() {
    const { executar } = await import(new URL('./testes-regras.js', import.meta.url));
    const falhas = await executar(RAIZ);
    if (falhas) process.exit(1);
  },

  verificar() {
    let problemas = 0;
    const erro = m => { problemas++; console.log('✗ ' + m); };
    const abas = lerAbas();
    const ids = new Set();
    for (const a of abas) {
      if (ids.has(a.id)) erro(`id de aba repetido: ${a.id}`);
      ids.add(a.id);
      for (const k of ['id', 'titulo', 'modulo', 'ordem']) if (a[k] === undefined || a[k] === '') erro(`aba ${a.id || '?'} sem "${k}"`);
      const arq = path.join(CAMINHO.abasDir, a.modulo || '');
      if (!fs.existsSync(arq)) { erro(`módulo inexistente: js/abas/${a.modulo}`); continue; }
      const fonte = fs.readFileSync(arq, 'utf8');
      if (!/export default\s*\{/.test(fonte)) erro(`js/abas/${a.modulo} não exporta "export default { ... }"`);
      if (!/render\s*\(/.test(fonte)) erro(`js/abas/${a.modulo} não tem render(container, ctx)`);
      if (!new RegExp(`id:\\s*['"]${a.id}['"]`).test(fonte)) erro(`js/abas/${a.modulo}: o id exportado deve ser "${a.id}"`);
    }
    const campos = lerJSON(CAMINHO.campos);
    for (const [ent, lista] of Object.entries(campos)) {
      if (!ENTIDADES.includes(ent)) erro(`campos.json: entidade desconhecida "${ent}"`);
      for (const c of lista) if (!TIPOS_CAMPO.includes(c.tipo)) erro(`campos.json: tipo inválido em ${ent}.${c.nome}`);
    }
    // App instalável: service worker e manifestos com ícones existentes.
    if (!fs.existsSync(path.join(RAIZ, 'sw.js'))) erro('sw.js não encontrado');
    for (const man of ['manifest.webmanifest', 'leitura.webmanifest']) {
      let m;
      try { m = JSON.parse(fs.readFileSync(path.join(RAIZ, man), 'utf8')); } catch (e) { erro(`${man} inválido: ${e.message}`); continue; }
      for (const k of ['name', 'start_url', 'display', 'icons']) if (!m[k]) erro(`${man} sem "${k}"`);
      for (const i of m.icons || []) if (!fs.existsSync(path.join(RAIZ, i.src))) erro(`${man}: ícone inexistente ${i.src}`);
      if (!(m.icons || []).some(i => i.sizes === '512x512') || !(m.icons || []).some(i => i.sizes === '192x192')) erro(`${man}: precisa de ícones 192x192 e 512x512`);
    }
    const proibido = ['lov', 'able'].join('');
    for (const arq of listarArquivos(RAIZ)) {
      const nome = path.relative(RAIZ, arq);
      if (nome.toLowerCase().includes(proibido)) erro(`nome de arquivo com referência proibida: ${nome}`);
      if (/\.(png|ico)$/.test(arq)) continue;
      if (fs.readFileSync(arq, 'utf8').toLowerCase().includes(proibido)) erro(`referência proibida em ${nome}`);
    }
    if (problemas) { console.log(`\n${problemas} problema(s) encontrado(s).`); process.exit(1); }
    ok(`Tudo certo: ${abas.length} abas, módulos válidos, nenhuma referência proibida.`);
  },
};

// ---------------- Auxiliares ----------------

function resolverEntidade(alvo) {
  if (ENTIDADES.includes(alvo)) return alvo;
  const aba = lerAbas().find(a => a.id === alvo);
  if (aba?.entidade && ENTIDADES.includes(aba.entidade)) return aba.entidade;
  falhar(`"${alvo}" não corresponde a uma entidade com formulário. Use uma aba (pcp, projetos, producao, almoxarifado) ou uma entidade: ${ENTIDADES.join(', ')}`);
}

function validarBackup(p) {
  if (p?.formato !== 'simulflow-backup' || typeof p.dados !== 'object') falhar('Não é um backup do SimulFlow');
  if (!Array.isArray(p.dados.usuarios) || !p.dados.usuarios.some(u => u.host && u.ativo)) falhar('O backup precisa ter ao menos um usuário host ativo');
}

function listarArquivos(dir) {
  const saida = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', 'backups'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) saida.push(...listarArquivos(p)); else saida.push(p);
  }
  return saida;
}

/**
 * Empacotador mínimo: junta os módulos ES do projeto num único <script> clássico.
 * Suporta o estilo usado no projeto: imports nomeados/namespace em uma linha e
 * "export function/const/class", "export default {", "export { a, b as c }".
 */
function empacotar() {
  const app = lerJSON(CAMINHO.app), abas = lerAbas(), campos = lerJSON(CAMINHO.campos);
  const modulos = new Map();
  const fila = [path.join(RAIZ, 'js/app.js'), ...abas.map(a => path.join(CAMINHO.abasDir, a.modulo))];
  while (fila.length) {
    const arq = fila.shift();
    if (modulos.has(arq)) continue;
    const fonte = fs.readFileSync(arq, 'utf8');
    const deps = [];
    const exportados = [];
    let codigo = fonte.replace(/^import\s+(\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"];?[ \t]*$/gm, (_, alvo, rel) => {
      const dep = path.resolve(path.dirname(arq), rel);
      deps.push(dep);
      const chave = JSON.stringify(path.relative(RAIZ, dep));
      if (alvo.startsWith('*')) return `const ${alvo.replace(/\*\s+as\s+/, '').trim()} = __req(${chave});`;
      return `const ${alvo.replace(/\s+as\s+/g, ': ')} = __req(${chave});`;
    });
    if (/^import\s/m.test(codigo)) throw new Error(`Import não suportado pelo empacotador em ${path.relative(RAIZ, arq)}`);
    codigo = codigo
      .replace(/^export\s+default\s+/m, '__exp.default = ')
      .replace(/^export\s+(async\s+function|function|class)\s+(\w+)/gm, (_, k, n) => { exportados.push([n, n]); return `${k} ${n}`; })
      .replace(/^export\s+(const|let)\s+(\w+)/gm, (_, k, n) => { exportados.push([n, n]); return `${k} ${n}`; })
      .replace(/^export\s*\{([^}]*)\};?/gm, (_, lista) => { for (const p of lista.split(',').map(s => s.trim()).filter(Boolean)) { const [o, d] = p.split(/\s+as\s+/); exportados.push([d || o, o]); } return ''; });
    const fim = exportados.map(([d, o]) => `__exp[${JSON.stringify(d)}] = ${o};`).join('\n');
    modulos.set(arq, `__def(${JSON.stringify(path.relative(RAIZ, arq))}, function (__exp) {\n'use strict';\n${codigo}\n${fim}\n});`);
    fila.push(...deps);
  }
  const css = ['base', 'layout', 'componentes'].map(n => fs.readFileSync(path.join(RAIZ, `css/${n}.css`), 'utf8')).join('\n');
  const favicon = 'data:image/png;base64,' + fs.readFileSync(path.join(RAIZ, 'favicon.png')).toString('base64');
  const registroAbas = abas.map(a => `${JSON.stringify(a.modulo)}: __req(${JSON.stringify(path.join('js/abas', a.modulo))}).default`).join(',\n  ');
  const cabeca = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8').match(/<head>([\s\S]*?)<\/head>/)[1]
    .replace(/<link rel="stylesheet"[^>]*>\s*/g, '').replace(/href="favicon.png"/, `href="${favicon}"`)
    // Arquivo único (file://): sem manifesto de app nem service worker.
    .replace(/<link rel="(manifest|apple-touch-icon)"[^>]*>\s*/g, '').replace(/<script>if\('serviceWorker'[\s\S]*?<\/script>\s*/, '');
  const script = `(function () {
var __mods = {}, __cache = {};
function __def(n, f) { __mods[n] = f; }
function __req(n) { if (__cache[n]) return __cache[n]; var e = __cache[n] = {}; __mods[n](e); return e; }
${[...modulos.values()].reverse().join('\n')}
globalThis.__SIMULFLOW_CONFIG__ = ${JSON.stringify({ app, abas, campos })};
globalThis.__SIMULFLOW_ABAS__ = {};
var __abas = { ${registroAbas} };
Object.assign(globalThis.__SIMULFLOW_ABAS__, __abas);
__req("js/app.js");
})();`;
  // O app.js é o último a executar; as abas precisam do config antes de serem registradas,
  // por isso o registro acontece antes de __req("js/app.js") (que só usa o config no iniciar()).
  return `<!doctype html>\n<html lang="pt-BR">\n<head>${cabeca}<style>\n${css.replace(/url\(["']?favicon\.png["']?\)/g, `url(${favicon})`)}\n</style>\n</head>\n<body>\n  <div id="raiz"></div>\n<script>\n${script.replace(/<\/script/gi, '<\\/script').replace(/src="favicon\.png"/g, `src="${favicon}"`).replace(/'favicon\.png'/g, `'${favicon}'`)}\n</script>\n</body>\n</html>\n`;
}

// ---------------- Execução ----------------

const [, , nome, ...args] = process.argv;
const fn = comandos[nome || 'ajuda'];
if (!fn) { console.error(`Comando desconhecido: ${nome}\n`); comandos.ajuda(); process.exit(1); }
Promise.resolve(fn(...args)).catch(e => falhar(e.message));
