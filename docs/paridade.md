# Paridade com o protótipo original

Cada código vem de [`docs/inventario.md`](inventario.md). Legenda:

- ✅ **Replicado** — mesmo comportamento.
- 🔁 **Mudado** — existe, mas com diferença (motivo ao lado).
- ➕ **Novo** — não existia no protótipo.
- ➖ **Não aplicável** — não faz sentido sem servidor ou foi substituído.

Como foi testado: `node tools/simulflow.js testar` (40 testes de regras e ações) e um roteiro no
Chromium (Playwright) que abriu as 24 rotas sem erro de JavaScript e executou 35 fluxos pela
interface: criar host, OP, produção, inspeção, FA e status, item em pedido aditivo, avanço,
bloqueio de 100% sem laudo, arrastar item entre etapas, etapa nova, laudo, consumo,
ensaio NII/NIII com reprovação e retrabalho, ocultar/arquivar, usuário restrito em modo leitura,
bloqueio por tentativas, exportar backup e restaurá-lo em outro navegador. Também foram testados
os comandos do CLI numa cópia do projeto (nova aba no menu, campos extras nos formulários) e o
arquivo único `dist/simulflow.html` aberto por `file://`.

---

## Diferenças em relação ao protótipo (resumo)

1. **Sem servidor.** Os dados ficam no `localStorage` do navegador, atrás de `js/data/store.js`.
   As regras do banco (funções SQL) foram reescritas em `js/data/acoes/*` e rodam no navegador. A
   mesma checagem que desabilita o botão também barra a gravação, mas quem tem acesso às
   ferramentas do navegador consegue burlá-la. Para uso real é preciso trocar o adaptador por
   uma API com as regras no servidor.
2. **Sincronização.** O protótipo atualizava todas as sessões por canal em tempo real. Aqui, abas
   do mesmo navegador se atualizam sozinhas (evento `storage`). Computadores diferentes não
   compartilham dados: use exportar/importar JSON ou `data/dados-iniciais.json`.
3. **Login por usuário, não por e-mail.** Não há envio de e-mail. O host define uma senha
   provisória e o usuário troca no primeiro acesso. O bloqueio de 15 min após 5 erros e a sessão de 30 min
   (previstos no plano do protótipo) foram implementados.
4. **Perfis.** Só o host existe no início (pedido seu). Os 13 perfis viraram:
   **host**, **área** (PCP, Produção, Projetos/Obras, Almoxarifado, Qualidade),
   **acesso por aba** (sem acesso / ver / editar) e **funções** marcadas por usuário (Gestor,
   Supervisor/Técnico, Inspetor, Verificador NII, Verificador NIII, Criar etapa adicional).
   “Consulta” é um usuário só com “ver”.
5. **FA é uma entidade.** No protótipo, FA era só o texto “Ficha de acompanhamento” da OP (mantido).
   Agora a FA (frente/ação) tem número automático, setores de origem e destino, itens,
   OP/obra, responsável, prazo e status.
6. **Item unificado.** Componentes (Projetos → Pedido → Componente) e itens da Programação
   (T-24…) viraram um único **item**, com pedido (prazo), ciclo, etapa, avanço, laudo, consumo e
   ensaios. Consequências:
   - o avanço é sempre `realizado / previsto` (para acompanhar só em %, use previsto 100 e unidade “%”);
   - o **turno** passa a ser obrigatório em toda atualização de avanço;
   - **100% exige laudo aprovado** para todos os itens;
   - laudo reprovado limita o avanço *exibido* a 99%, sem apagar o valor lançado.
7. **Etapas unificadas.** A mesma etapa (com responsável) serve à Produção e à Programação.
   Criar etapa exige “editar” em Produção (no protótipo, na Programação era só administrador).
8. **OP vinculada a uma obra cadastrada** (antes o projeto era texto livre).
9. **Ocultar obra**, separado de arquivar.
10. **Abas reorganizadas.** Há uma nova aba Início (painel de OPs e FAs). Ordens de Produção fica
    dentro de PCP, junto com as FAs. A Qualidade ganha a seção “Laudos de itens” e o Histórico
    ganha “Auditoria completa”.
11. **Gráficos.** O gráfico “Evolução da produção” do protótipo era sintético (valores
    interpolados, não reais). Ele foi trocado por “Produção por obra” com dados reais. Os gráficos são SVG
    próprio, sem biblioteca.
12. **Exportações sem biblioteca.** O PDF sai pela janela de impressão do navegador (“Salvar como
    PDF”). O Excel é uma planilha XML `.xls` com várias abas, e o Excel pode mostrar um aviso de
    formato ao abrir. O CSV continua igual.
13. **Logo.** As imagens do logo ficavam no CDN da plataforma e não vieram no export. A marca
    usa o `favicon.png` (que veio) e o nome em texto.

---

## Navegação e acesso

| Código | Situação | Observação |
|---|---|---|
| NAV-01 | 🔁 | Menu vem de `config/abas.json`. Ordem: Dashboard (Início e Dashboard unificados), Programação, PCP, Presença operacional, Produção, Projetos/Obras, Almoxarifado, Qualidade, Histórico, Relatórios, Configurações, Usuários. Notificações só pelo sino |
| NAV-02 | 🔁 | Item aparece com “ver” ou “editar” na aba; abas com `perfis: ["host"]` só para host |
| NAV-03 | ✅ | Marca, “ÁREA DE TRABALHO”, “Setores conectados”, versão |
| NAV-04 | ✅ | Contador de não lidas no menu e ponto no sino |
| NAV-05 | ✅ | Recolher menu; menu móvel com fundo escurecido |
| NAV-06 | ✅ | Área de trabalho › aba |
| NAV-07 | 🔁 | Busca geral também encontra FAs e itens (antes só OPs) |
| NAV-08 | 🔁 | Iniciais, nome, área/host, **Alterar minha senha**, sair |
| NAV-09 | ➖ | Seletor “Área de trabalho” era só visual (não mudava nada); a área agora é do cadastro do usuário |
| NAV-10 | ➖ | Rodapé removido de todas as abas, a pedido |
| NAV-11 | ✅ | “Acesso não autorizado” dentro do shell |
| NAV-12 | ✅ | Busca sem acento/maiúsculas, vários termos (`combinaTexto`) |
| AUT-01 | 🔁 | Login por **usuário** (o host é `simulflow2-40@gmail.com`); olho para mostrar senha |
| AUT-02 | ➖ | Sem e-mail; o host define senha provisória |
| AUT-03 | 🔁 | Tela “Definir nova senha” obrigatória após senha provisória, com olho |
| AUT-04 | 🔁 | Link de convite → senha provisória definida pelo host |
| AUT-05 | ✅ | Usuário desativado não entra; sessão é encerrada |
| AUT-06 | ✅ | Host não remove o próprio acesso; sempre resta um host ativo |
| AUT-07 | ✅ | Bloqueio 15 min após 5 erros; sessão expira após 30 min sem uso (configurável em `config/app.json`) |
| USR-01 | 🔁 | Tabela: nome/login, área, host/funções, abas com alteração, situação |
| USR-02 | 🔁 | Login, nome, área (lista), ativo, host |
| USR-03 | 🔁 | Perfis → área + funções (ver Diferenças, item 4) |
| USR-04 | 🔁 | Acesso por aba; botão “Aplicar padrão da área” |
| USR-05 | ✅ | Função “Criar etapa adicional” |
| USR-06 | 🔁 | Obras do Dashboard por usuário, auditadas; **o host vê todas** sem precisar se conceder |
| USR-07 | ✅ | Host tem acesso total |

## Dashboard

| Código | Situação | Observação |
|---|---|---|
| DSH-01 | 🔁 | Igual, exceto host (vê todas) |
| DSH-02 | ✅ | Todos os filtros; listas de múltipla escolha |
| DSH-03 | ✅ | Validação de datas e limite máximo de dias |
| DSH-04 | ✅ | Padrão = ciclos ativos; sem ciclo → hoje, com aviso |
| DSH-05 | ✅ | Filtros só na sessão do navegador, por usuário |
| DSH-06 | ✅ | Resumo dos filtros e limite |
| DSH-07 | ✅ | 5 indicadores |
| DSH-08 | 🔁 | Alertas vêm das notificações ligadas a item/ensaio; movimentações da auditoria |
| DSH-09 | 🔁 | PDF pela impressão do navegador; exportação registrada na auditoria |
| DSH-10 | ✅ | Host configura o limite e vê o histórico de exportações |

## Programação e etapas adicionais

| Código | Situação | Observação |
|---|---|---|
| PRG-01 | ✅ | |
| PRG-02 | ✅ | |
| PRG-03 | 🔁 | Obras ocultas não aparecem; arquivar exige host ou Gestor |
| PRG-04 | ✅ | |
| PRG-05 | 🔁 | Cadastro de obra fica em Projetos/Obras (botão leva até lá) |
| PRG-06 | ✅ | |
| PRG-07 | 🔁 | Notificações internas = notificações ligadas a item/ensaio |
| PRG-10 | 🔁 | PDF (impressão) e Excel (.xls XML) |
| PRG-11 | 🔁 | Também mostra “itens sem ciclo” |
| PRG-12 | 🔁 | Ciclo: host ou Gestor; Etapa: editar Produção; Item: editar Projetos/Obras. ➕ “Editar ciclo” |
| PRG-13 – PRG-19 | ✅ | |
| PRG-20 | ✅ | Fim sugerido = início + 21 dias |
| PRG-21 | 🔁 | Responsável pode ser usuário ou nome livre (como na Produção do protótipo) |
| PRG-22 | 🔁 | Formulário de item unificado (pedido, sub-projeto, ciclo, etapa, série, OP, prazo) |
| PRG-23 – PRG-25 | ✅ | |
| RPG-01 – RPG-07 | ✅ | `js/data/regras.js` |
| RPG-08 | 🔁 | Supervisor/Técnico = função; host substitui o admin |
| RPG-09 | ✅ | Tentativas negadas gravadas na auditoria |
| RPG-10 – RPG-12 | ✅ | |
| ADD-01 – ADD-06 | ✅ | |

## Qualidade e configurações

| Código | Situação | Observação |
|---|---|---|
| QUA-01 – QUA-04 | ✅ | Seção “Inspeções de OPs” |
| QUA-05 | 🔁 | Virou a seção própria “Laudos de itens” |
| ENS-01 – ENS-04 | ✅ | |
| ENS-05 | 🔁 | Inspetor/NII/NIII = usuários ativos com a função (ou host); aviso enviado ao responsável do item |
| ENS-06 – ENS-12 | ✅ | |
| CFG-01 – CFG-05 | ✅ | ➕ limite do Dashboard, backup JSON, demonstração e lista de abas na mesma tela |

## OPs, Produção, Projetos/Obras e Almoxarifado

| Código | Situação | Observação |
|---|---|---|
| ORD-01 – ORD-03 | 🔁 | ➕ filtro por obra |
| ORD-04 | 🔁 | Projeto = obra cadastrada (obrigatória) |
| ORD-05 – ORD-06 | ✅ | |
| ORD-07 | 🔁 | ➕ itens e FAs vinculados à OP |
| ORD-08 | ✅ | |
| ORD-09 | 🔁 | “Atrasada” é sempre calculada (prazo vencido), nunca gravada |
| ORD-10 – ORD-11 | ✅ | |
| ROP-01 – ROP-08 | ✅ | `transicaoOP` em `js/data/regras.js` |
| PRD-01 – PRD-05 | ✅ | Etapas reordenadas por setas ← →; arrastar e soltar |
| PRD-06 | 🔁 | Avanço por quantidade + turno; 100% exige laudo aprovado |
| PRD-07 – PRD-09 | ✅ | |
| PRJ-01 – PRJ-05 | ✅ | ➕ ocultar obra |
| PRJ-06 | ✅ | Contrato aditivado: vários pedidos com datas próprias |
| PRJ-07 – PRJ-08 | 🔁 | Componente → item unificado; ➕ lista de itens também na obra |
| PRJ-09 – PRJ-11 | ✅ | |
| ALM-01 – ALM-06 | ✅ | ➕ editar material |
| CMP-01 | 🔁 | Laudo reprovado limita o avanço exibido a 99% |
| CMP-02 – CMP-03 | ✅ | |

## Notificações, histórico, relatórios, início e dados

| Código | Situação | Observação |
|---|---|---|
| NOT-01 – NOT-03 | 🔁 | “Providência” só aparece quando registrada (o protótipo copiava a observação da OP para esse campo) |
| HIS-01 – HIS-02 | ✅ | ➕ seção “Auditoria completa” com antes/depois |
| REL-01 – REL-05 | ✅ | ➕ indicador de FAs atrasadas |
| INI-01 – INI-05 | 🔁 | Painel reativado como aba Início, com OPs **e FAs**; gráfico sintético trocado por dados reais |
| DEM-01 – DEM-04 | 🔁 | Mesmo cenário, com OPs ligadas às obras, 2 pedidos na Estaca Torpedo, T-35 no aditivo, etapa Pintura, 3 FAs e nenhum usuário |

## Pontos ambíguos (Q-01 a Q-06) — como foram resolvidos

| Código | Decisão |
|---|---|
| Q-01 | Sua escolha: FA é uma entidade própria; a OP mantém a “Ficha de acompanhamento” como texto |
| Q-02 | Sua escolha: item unificado |
| Q-03 | Sua escolha: só o host no início; funções atribuíveis por usuário |
| Q-04 | Login por usuário; senha provisória definida pelo host |
| Q-05 | Painel reativado como aba Início |
| Q-06 | PDF pela impressão do navegador; Excel em XML; CSV igual |
