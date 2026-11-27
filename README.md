# SimulFlow

Acompanhamento de **OPs** (ordens de produção) e **FAs** (frentes/ações) entre PCP, Produção,
Projetos/Obras, Almoxarifado e Qualidade.

O SimulFlow é uma aplicação estática: HTML, CSS e JavaScript em módulos (ES modules). Não precisa
de framework, build nem dependências. Os dados ficam no navegador (`localStorage`), atrás de uma
camada que pode ser trocada por uma API depois.

> **Protótipo.** Senhas e dados ficam no navegador de quem usa. O hash PBKDF2 evita senha em
> texto, mas **não substitui autenticação em servidor**. Para uso real é preciso servidor, banco
> de dados, HTTPS, regras validadas no servidor e adequação à LGPD.

---

## 1. Como abrir

Precisa de Node.js 18 ou mais novo (só para os comandos; o sistema em si é estático).

```bash
node tools/simulflow.js servir
```

Depois abra **http://localhost:8080** no navegador. Para usar outra porta: `node tools/simulflow.js servir 3000`.

**Por que não dá duplo clique no `index.html`?** Chrome e Edge bloqueiam módulos JavaScript abertos
direto do disco (`file://`). Há duas saídas:

- **Arquivo único:** gere `dist/simulflow.html` e abra com duplo clique. Funciona sem servidor.
  ```bash
  node tools/simulflow.js empacotar
  ```
- **Servidor estático:** publique a pasta (sem `tools/` e `backups/`) em qualquer servidor estático,
  como GitHub Pages, Netlify, IIS ou Apache.

## 2. Primeiro acesso: criar o host

1. Abra o sistema. Sem usuários cadastrados, aparece a tela **Primeiro acesso**.
2. O login já vem preenchido com `simulflow2-40@gmail.com` (definido em `config/app.json`, campo `hostLoginPadrao`).
3. Informe seu nome e uma senha (mínimo 8 caracteres) e clique em **Criar host e entrar**.

O host é o administrador. Ele:

- cria usuários em **Usuários e permissões**, com senha provisória (o usuário troca no primeiro login);
- define a **área** de cada um (PCP, Produção, Projetos/Obras, Almoxarifado, Qualidade);
- define o **acesso por aba** (sem acesso, apenas visualizar ou visualizar e alterar);
- marca **funções**: Gestor, Supervisor/Técnico, Inspetor, Verificador NII, Verificador NIII e Criar etapa adicional;
- escolhe as **obras liberadas no Dashboard**.

Quem só tem “visualizar” vê a aba em modo leitura: os botões de cadastro e de mudança de status ficam
desabilitados, e a gravação também é recusada pelas regras (a tentativa fica na auditoria).

Ao abrir pela primeira vez num navegador, o sistema carrega **dados de demonstração**: obras Estaca
Torpedo e Vasos de Pressão, OPs, FAs, itens T-24…T-29 e T-35, e ensaios. Para trocá-los, vá em
**Configurações › Dados e backup**, que tem o botão *Limpar dados*.

## 3. Abas

| Aba | O que faz |
|---|---|
| Dashboard | Resumo de OPs e FAs por status, atrasos, alertas e últimas movimentações; abaixo, o acompanhamento da programação com filtros recolhidos (período, status, obra, etapa, tipo de ensaio) e exportação em PDF |
| Programação | Ciclos tri-semanais por obra, atingimento × meta, itens, efetivo por turno e etapas adicionais (retrabalho) |
| PCP | Ordens de Produção (cadastro, produção, ocorrência, inspeção, liberação) e FAs (frentes/ações entre setores) |
| Produção | Etapas/frentes (Soldagem, Montagem, Pintura…) com responsável; itens atribuídos por arrastar e soltar; OPs em produção |
| Projetos/Obras | Obras, sub-projetos, ocultar/arquivar, pedidos (contrato aditivado, cada um com sua data de entrega) e itens numerados |
| Almoxarifado | Materiais, entradas e saídas, solicitações da produção e consumo por item |
| Qualidade | Inspeções de OPs, laudos de itens e ensaios (execução → NII → NIII) |
| Notificações | Avisos entre setores e providências (acesso pelo sino no topo) |
| Histórico | Movimentações e auditoria completa (quem, quando, antes e depois) |
| Relatórios | Desempenho por setor, motivos de parada, qualidade, materiais e FAs |
| Configurações (host) | Cartões para cada configuração: aparência (tema claro/escuro), limites de ensaio, observação, etapas e responsáveis, Dashboard, backup e lista de abas |
| Usuários e permissões (host) | Cadastro de usuários, áreas, funções e acessos |

## 4. Estrutura

```
index.html               Shell (menu lateral, topo) — carrega js/app.js
config/app.json          Nome, host padrão, áreas, setores, status, motivos, turnos, funções, sessão
config/abas.json         Registro das abas (id, título, ícone, módulo, ordem, visível, perfis, entidade)
config/campos.json       Campos extras por entidade (gerado pelo comando `campo`)
css/                     base.css (cores/tema), layout.css (estrutura), componentes.css
js/app.js                Inicialização, telas de acesso, shell e busca geral
js/core/                 router, eventos, auth, permissoes, ui, icones, util, config, exportar
js/data/store.js         Coleções, transações atômicas, exportar/importar
js/data/adapters/        local.js (localStorage) — troque aqui por API ou Google Drive
js/data/regras.js        Regras puras (avanço, status, atraso, ciclos, ensaios, OP, FA)
js/data/acoes/           Todas as gravações: validação + permissão + auditoria + notificações
js/data/demo.js          Dados de demonstração
js/componentes/          Peças compartilhadas (formulários de item, OP, etapa, gráficos…)
js/abas/<id>.js          Uma aba por arquivo
tools/simulflow.js       Comandos de edição (este README, seção 6)
data/                    dados-iniciais.json (opcional, instalado pelo comando `importar`)
docs/                    inventario.md (checklist do protótipo) e paridade.md (o que mudou)
```

**Regra de ouro:** as abas só *leem* do `store`. Toda gravação passa por `ctx.acoes.<módulo>.<ação>()`,
que confere a permissão, valida, grava de forma atômica, registra auditoria e notifica os setores.

## 5. Como adicionar uma aba

**Pelo comando (recomendado):**

```bash
node tools/simulflow.js nova-aba manutencao "Manutenção" wrench
```

O comando cria `js/abas/manutencao.js` a partir de `tools/modelo-aba.js` e registra a aba em
`config/abas.json`. Recarregue o navegador: o host já vê a aba. Para outros usuários, libere o
acesso em **Usuários e permissões**.

**À mão:**

1. Crie `js/abas/<id>.js`:
   ```js
   import { html, cabecalho } from '../core/ui.js';
   export default {
     id: 'minha-aba',
     titulo: 'Minha aba',
     render(container, ctx) {
       container.innerHTML = String(html`<main class="page">${cabecalho('Minha aba', 'Descrição')}</main>`);
     },
     onMount(container, ctx) { /* ligar eventos (opcional) */ },
     onUnmount(container, ctx) { /* desligar (opcional) */ },
   };
   ```
2. Adicione a entrada em `config/abas.json`:
   ```json
   { "id": "minha-aba", "titulo": "Minha aba", "icone": "file", "modulo": "minha-aba.js", "ordem": 14, "visivel": true, "perfis": ["todos"], "entidade": null }
   ```
   - `perfis`: `["todos"]` (qualquer usuário a quem o host liberar), `["host"]` (só host) ou áreas, como `["PCP", "Qualidade"]`.
   - `icone`: veja os nomes em `js/core/icones.js` (home, chart, target, clipboard, factory, folder, boxes, shield, bell, wrench…).
3. Rode `node tools/simulflow.js verificar`.

O `ctx` recebido pela aba traz: `usuario`, `store`, `acoes`, `pode(aba, editar)`, `regra(nome, ...)`, `host`,
`params` e `query` (de `#/<aba>/<params>?<query>`), `rerender()` e `navegar(hash)`.

## 6. Comandos

Todos rodam com `node tools/simulflow.js <comando>`, sem instalar nada.

| Comando | O que faz |
|---|---|
| `ajuda` | Lista os comandos |
| `listar-abas` | Mostra as abas, ordem, módulo e perfis |
| `nova-aba <id> "<Título>" [ícone] [perfis]` | Cria o módulo e registra a aba |
| `ocultar-aba <id>` / `mostrar-aba <id>` | Esconde/exibe no menu (o arquivo continua no projeto) |
| `ordem <id> <n>` | Coloca a aba na posição *n* do menu |
| `renomear-aba <id> "<Título>"` | Troca o título exibido |
| `campo <aba\|entidade> <nome> <tipo> ["Rótulo"] [opções]` | Adiciona campo ao modelo |
| `remover-campo <aba\|entidade> <nome>` | Remove o campo extra (valores gravados são preservados) |
| `exportar [arquivo]` | Salva configuração + dados iniciais em `backups/` |
| `importar <arquivo>` | Instala um backup do navegador como `data/dados-iniciais.json`, ou restaura uma exportação do projeto |
| `servir [porta]` | Servidor local (padrão 8080) |
| `empacotar` | Gera `dist/simulflow.html` (arquivo único) |
| `testar` | Roda os testes das regras de negócio |
| `verificar` | Valida abas, módulos e campos e procura referências proibidas |

### Exemplos

```bash
node tools/simulflow.js nova-aba manutencao "Manutenção" wrench
```

```bash
node tools/simulflow.js nova-aba auditoria-externa "Auditoria externa" shield host
```

```bash
node tools/simulflow.js ocultar-aba relatorios
```

```bash
node tools/simulflow.js ordem pcp 2
```

```bash
node tools/simulflow.js campo pcp numeroDesenho texto "Número do desenho"
```

```bash
node tools/simulflow.js campo projetos prioridade lista "Prioridade" "Baixa|Média|Alta"
```

```bash
node tools/simulflow.js campo item pesoKg numero "Peso (kg)"
```

```bash
node tools/simulflow.js importar simulflow-backup-2026-11-26.json
```

```bash
node tools/simulflow.js exportar
```

**Campos extras.** O alvo pode ser uma aba com formulário (`pcp`→OP, `projetos`→obra,
`producao`→etapa, `almoxarifado`→material) ou uma entidade (`op`, `fa`, `obra`, `pedido`, `item`,
`etapa`, `material`). Os tipos são `texto`, `texto-longo`, `numero`, `data`, `sim-nao` e `lista`. O
campo aparece nos formulários e nos detalhes da entidade e é gravado em `registro.campos.<nome>`.

### Exportar e importar dados

- **No sistema (host):** em **Configurações › Dados e backup**, *Exportar JSON completo* gera um
  backup com todos os dados, incluindo os usuários com senha em hash. *Importar JSON* substitui
  tudo neste navegador.
- **Pelo comando:** `importar <backup.json>` instala o backup como `data/dados-iniciais.json`.
  Cada navegador que abrir o sistema pela primeira vez já começa com esses dados (o host também pode
  carregá-los em Configurações). `exportar` guarda a configuração do projeto (abas, campos,
  `app.json`) e os dados iniciais em `backups/`. Os dados do dia a dia ficam no navegador; exporte-os
  pela tela.

## 7. Modelo de dados (resumo)

- **Obra** (Projeto/Obra): nome, contrato, cliente, responsável, status. Pode ter **sub-projetos**
  e pode ser **ocultada** ou **arquivada** (nada é excluído; arquivar leva junto sub-projetos,
  pedidos, etapas e itens).
- **Pedido**: pertence a uma obra; cada pedido tem sua **data de entrega** e seu status, o que
  atende o contrato aditivado.
- **Item**: numerado individualmente (T-24, T-35…). Tem pedido, prazo, ciclo, **etapa**,
  responsável, previsto/realizado, **% e status próprios**, laudo, consumo de material e ensaios.
- **Etapa** (frente de trabalho): nome, área e **responsável**, com histórico de atribuições.
- **OP**: vinculada a uma obra; estados: Em andamento, Parada, Aguardando material, Aguardando
  qualidade e Concluída. “Atrasada” é calculado pelo prazo.
- **FA** (frente/ação): liga setor de origem e de destino, OP/obra e itens; tem responsável, prazo e
  status (Aberta, Em andamento, Concluída, Cancelada; Atrasada é calculado).
- **Ensaio**: solicitado → em execução → aguardando NII → aguardando NIII → aprovado/reprovado.
- **Material**, **Notificação** e **Auditoria** (somente inserção).

Regras completas: `js/data/regras.js` e `js/data/acoes/*`. Diferenças em relação ao protótipo:
`docs/paridade.md`.

## 8. Trocar o armazenamento

`js/data/adapters/local.js` implementa `{ ler(), gravar(dados), limpar(), observarExterno(cb) }`.
Para usar API ou Google Drive, crie outro adaptador com a mesma interface e passe-o em
`js/app.js` (`criarStore(seuAdaptador)`). As abas e as ações não mudam. Num backend real, as
checagens de `js/data/acoes/*` precisam existir também no servidor.

### Instalar como aplicativo

O site tem manifesto e service worker (`sw.js`). No Chrome ou no Edge, use o botão **Instalar**
(ícone de download no topo) ou **⋮ › Instalar app**.
- No celular, a tela de leitura (`leitura.html`) também pode ser instalada como "SimulFlow Leitura".
- O service worker busca sempre a versão mais nova quando há internet, então as atualizações
  aparecem só recarregando a página, sem limpar o cache.
- Sem internet, ele abre a última cópia.

## 9. Presença operacional (NFC)

Aba para contar os colaboradores presentes no dia lendo a tag NFC do crachá pelo celular
(Chrome no Android). Os dados ficam numa planilha Google com o script de `apps-script/`.
- A planilha manda um **e-mail com o resumo do dia** quando o dia fecha.
- A sub-aba **Relatório** mostra presenças, faltas e chegadas fora do turno por colaborador no mês,
  com exportação em CSV e XLSX.
Publicação no GitHub Pages, criação da planilha, primeira tag e teste com cartão real:
**[docs/presenca.md](docs/presenca.md)**.

## 10. Testes

```bash
npm test
```

(roda os testes do Apps Script com um Google simulado, do CSV/XLSX e das regras do sistema)

```bash
node tools/simulflow.js verificar
```
