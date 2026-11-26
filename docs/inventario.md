# Inventário do protótipo original (checklist de paridade)

Fonte analisada: export do protótipo (React + TanStack Start + banco Postgres hospedado),
pastas `src/features/simulflow`, `src/features/programming`, `src/features/dashboard`,
`src/routes`, `drizzle/migrations/0000…0014` (as regras de negócio “duras” estão nas
funções SQL `sf_order_action`, `sf_work_mutate`, `sf_program_mutate*`, `sf_admin_save_user*`,
`sf_dashboard_*`) e documentos `docs/programacao-ensaios.md`, `roadmap.md`.

Cada item recebe um código (ex.: `ORD-03`) usado em `docs/paridade.md`.

---

## 0. Visão geral da arquitetura original

| Aspecto | Como era no protótipo |
|---|---|
| Interface | React 19 + TanStack Router/Start, componentes shadcn/ui, Tailwind, Recharts, ícones lucide |
| Dados | Banco Postgres hospedado (cliente JS + funções RPC), leitura a cada 15–30 s e canal realtime por obra |
| Autenticação | E-mail + senha no serviço de autenticação hospedado; recuperação por e-mail; link de convite/redefinição gerado pelo admin |
| Permissões | Perfil (`user_roles`) + permissão por módulo (`sf_permissions`: `nenhum`/`ver`/`editar`) + permissão individual `etapa_adicional` + obras autorizadas no Dashboard (`sf_dashboard_work_access`) |
| Auditoria | `sf_events` (OPs), `sf_work_history` (obras/pedidos/componentes), `sf_program_audit` (programação/ensaios/dashboard) – somente inserção |
| Exportações | CSV (`;`, BOM UTF-8), PDF (jsPDF), Excel (exceljs) |
| Sessão de filtros | `sessionStorage` (filtros do Dashboard por usuário) |

---

## 1. Navegação / shell (`shell.tsx`)

| Código | Item |
|---|---|
| NAV-01 | Menu lateral, nesta ordem: Dashboard, Programação, Ordens de Produção, Produção, Projetos/Obras, Almoxarifado, Qualidade, Notificações, Histórico, Relatórios, Configurações (só admin), Usuários e acessos (só admin) |
| NAV-02 | Item só aparece se o usuário tem `ver` ou `editar` no módulo; Qualidade aparece se tiver `qualidade` **ou** `ensaios`; Programação usa o módulo `dashboard` |
| NAV-03 | Marca “SimulFlow · SIMULTANEOUS PRODUCTION TRACKING”, legenda “ÁREA DE TRABALHO”, rodapé “Setores conectados”, “SimulFlow · v1.0” |
| NAV-04 | Contador de notificações não lidas no item Notificações e ponto no sino do topo |
| NAV-05 | Recolher/expandir menu; menu móvel (abrir/fechar) |
| NAV-06 | Breadcrumb “Área de trabalho › <aba>” |
| NAV-07 | Busca geral no topo (“Buscar ordens...”): busca OPs por número, FA, produto, projeto, responsável, setor, status e “Atrasada”; até 6 resultados com link para o detalhe |
| NAV-08 | Bloco do usuário: iniciais, nome, perfil/setor, botão sair (limpa sessão e filtros) |
| NAV-09 | Popover “Área de trabalho” (seletor PCP/Produção/Projetos/Almoxarifado/Qualidade) – **apenas visual, não altera nada** |
| NAV-10 | Rodapé de página “SimulFlow · Acompanhamento inteligente da produção / Dados fictícios · Ambiente de demonstração” |
| NAV-11 | Página “Acesso não autorizado” quando o módulo não é permitido |
| NAV-12 | Busca acentos/maiúsculas-insensível e por múltiplos termos (todos precisam bater) – `matchesText` |

## 2. Autenticação (`auth.tsx`, `reset-password.tsx`, `users.functions.ts`)

| Código | Item |
|---|---|
| AUT-01 | Login com **e-mail** e senha; botão mostrar/ocultar senha |
| AUT-02 | “Esqueci minha senha”: envia link por e-mail; reenvio após 30 s |
| AUT-03 | Página “Redefinir senha” (via link) com olho para mostrar senha |
| AUT-04 | Admin gera “link para definir senha” (convite ou recuperação) e copia |
| AUT-05 | Usuário desativado não acessa nenhum módulo (`allowed` exige `active`) |
| AUT-06 | Admin não pode remover o próprio perfil admin nem se desativar |
| AUT-07 | Plano do protótipo HTML (não implementado no app hospedado): bloqueio de 15 min após 5 erros, sessão expira após 30 min sem uso |

## 3. Usuários e acessos (`users.tsx`) – só admin

| Código | Item |
|---|---|
| USR-01 | Tabela: Nome/E-mail, Setor, Perfil, Situação (Ativo/Desativado), ações Editar e Gerar link de senha |
| USR-02 | Formulário: Nome (≤100), E-mail (somente leitura na edição), Setor (texto livre ≤100), Perfil, Usuário ativo |
| USR-03 | Perfis: Administrador, Gestor, Supervisor, Técnico, Inspetor, Verificador NII, Verificador NIII, Consulta, PCP, Produção, Projetos, Almoxarifado, Qualidade |
| USR-04 | Permissão por módulo (`Sem acesso` / `Apenas visualizar` / `Visualizar e alterar`) para: Programação e painel (`dashboard`), Acompanhamento de Ensaios, Ordens de Produção, Produção, Projetos/Obras, Almoxarifado, Qualidade, Notificações, Histórico, Relatórios |
| USR-05 | Permissão individual “Criar etapa adicional” |
| USR-06 | “Obras autorizadas no Dashboard”: lista de obras (arquivadas só se já concedidas); sem obras → usuário não vê o Dashboard; cada concessão/remoção é auditada |
| USR-07 | Admin tem acesso total a todos os módulos |

## 4. Dashboard (filtrado) (`features/dashboard`) – módulo `dashboard`

| Código | Item |
|---|---|
| DSH-01 | Só mostra obras autorizadas ao usuário (USR-06) e não arquivadas; sem obras → mensagem “Não há obras liberadas” (+ link a Usuários para admin) |
| DSH-02 | Filtros: atalho de período (Ciclo tri-semanal atual / Hoje / Últimos 7 / Últimos 30 / Personalizado), data inicial, data final, status dos itens (multi), status dos ensaios (multi), status das etapas adicionais (multi), obra (multi), etapa, tipo de ensaio; botões Aplicar e Limpar |
| DSH-03 | Validação de período: datas válidas, final ≥ inicial, limite máximo de dias configurável pelo admin (sem valor = sem limite) |
| DSH-04 | Período padrão = união dos ciclos ativos hoje; sem ciclo ativo → hoje (com aviso) |
| DSH-05 | Filtros aplicados persistem apenas na sessão do navegador |
| DSH-06 | Resumo textual dos filtros aplicados; texto “Limite de consulta: …” |
| DSH-07 | Indicadores: Atingimento (média dos avanços dos itens do período, com metas dos ciclos), Itens em atraso, Ensaios em gargalo, Bloqueios, Retrabalho em aberto |
| DSH-08 | Listas: Alertas (reprovação/gargalo/bloqueio), Movimentações (auditoria da programação no período), Itens em atraso fora do período; cada linha leva à obra na Programação |
| DSH-09 | Exportar PDF (paginado, cabeçalho com usuário/data/filtros, rodapé “Página n de m”), nome `dashboard_<obra|geral>_<início>_a_<fim>.pdf`; exportação é registrada na auditoria |
| DSH-10 | Admin: configurar limite de período (auditado) e ver “Histórico de exportações” |

## 5. Programação (`features/programming/dashboard.tsx`) – rota `/`, módulo `dashboard`

Visão geral (sem obra selecionada):

| Código | Item |
|---|---|
| PRG-01 | Indicadores: Obras ativas, Itens em atraso, Itens bloqueados, Ensaios em gargalo |
| PRG-02 | Busca obra/contrato/cliente; alternar Arquivadas |
| PRG-03 | Tabela de obras (só obras-raiz, não concluídas, ativas) ordenada por risco (atrasados+bloqueados): atingimento/meta, nº em atraso, bloqueados, gargalos, selo “Demonstração”, abrir, arquivar/restaurar (admin/gestor) |
| PRG-04 | “Laudos e bloqueios”: até 8 itens bloqueados com motivos; link para Ensaios |
| PRG-05 | “Nova obra” (admin): nome, contrato (único), cliente, início, fim previsto, obra principal opcional |
| PRG-06 | “Atualizado às hh:mm” e botão Histórico (auditoria geral) |
| PRG-07 | Notificações internas não lidas (alertas da programação) com botão “Lida” |

Obra selecionada (`/programacao/:id`):

| Código | Item |
|---|---|
| PRG-10 | Botões: voltar a Obras, exportar PDF, exportar Excel (abas Programação, Ensaios, Retrabalho e NC, Obra) |
| PRG-11 | Seletor de ciclo (padrão: ciclo ativo hoje); alternar itens arquivados |
| PRG-12 | Admin: “+ Ciclo”, “+ Etapa”, “+ Item” (Item exige ciclo e etapa existentes) |
| PRG-13 | Indicadores: Atingimento (meta do ciclo), Em atraso, Bloqueados, Avanço previsto cumprido |
| PRG-14 | “Retrabalho em aberto” e “Programação original preservada” |
| PRG-15 | Itens críticos: 3 itens não concluídos com mais dias de atraso |
| PRG-16 | Tabela de itens: item/etapa/subprojeto, realizado/previsto + unidade, avanço/esperado, prazo, status + motivos de bloqueio, ações (atualizar quantidade, histórico, mover ciclo, arquivar/restaurar) |
| PRG-17 | Filtros: busca item/etapa, status do item |
| PRG-18 | Etapas adicionais sob cada item (ver §6) |
| PRG-19 | Efetivo por etapa: seletor de turno; por etapa mostra “X disponíveis / Y previstos”, diferença (vermelho se faltar), responsável; “Registrar efetivo” |
| PRG-20 | Formulário de ciclo: início, fim (sugere início+21), meta % (padrão 80), situação (planejado/em andamento/encerrado), justificativa de ajuste |
| PRG-21 | Formulário de etapa: nome, área/UO, responsável (usuário ativo); se escopo = subprojeto, escolher obra ou subprojeto |
| PRG-22 | Formulário de item: ciclo, data prevista (dentro do ciclo), código (único na obra), quantidade prevista (>0), unidade (padrão “peça”), etapa, responsável, subprojeto, descrição |
| PRG-23 | Atualizar quantidade: quantidade realizada total (0…previsto), turno obrigatório, observação conforme política, opção “Não vou deixar observação” (auditada) |
| PRG-24 | Mover ciclo: novo ciclo + nova data, justificativa obrigatória |
| PRG-25 | Efetivo: etapa, data, previstos, disponíveis, turno, observação conforme política; um registro por etapa+turno+dia (sobrescreve) |

Regras (`rules.ts` + SQL):

| Código | Regra |
|---|---|
| RPG-01 | Avanço do item = (realizado + realizado das etapas adicionais não canceladas) / (previsto + previsto delas) × 100, limitado a 0–100 |
| RPG-02 | Esperado = interpolação linear do início do ciclo até o prazo do item |
| RPG-03 | Status do item (prioridade): bloqueado → concluído (100%) → em atraso (prazo vencido ou avanço < esperado) → em andamento (>0) → não iniciado |
| RPG-04 | Bloqueio: qualquer ensaio do item não aprovado/cancelado; ou retrabalho aberto originado de ensaio reprovado |
| RPG-05 | Atingimento = média aritmética dos avanços dos itens |
| RPG-06 | Ciclo: 21 dias, ou outra duração com justificativa; fim > início |
| RPG-07 | Prazo do item deve estar dentro do ciclo (> início e ≤ fim) |
| RPG-08 | Permissões: admin cadastra obra/etapa/ciclo/item; admin/gestor movem ciclo e arquivam; admin ou supervisor/técnico **da área da etapa ou responsável pela etapa** atualizam quantidade e efetivo; todos exigem `editar` em `dashboard` |
| RPG-09 | Tentativas não autorizadas são gravadas na auditoria |
| RPG-10 | Política de observação por tipo (quantidade, efetivo): opcional / sempre / condicional (redução de quantidade ou item atrasado) |
| RPG-11 | Arquivar obra arquiva subprojetos e etapas; item arquivado não aceita alterações |
| RPG-12 | Dias de atraso = hoje − prazo (≥0) |

## 6. Etapas adicionais / retrabalho (`additional.tsx`)

| Código | Item |
|---|---|
| ADD-01 | Criar (permissão individual `etapa_adicional`): tipo (retrabalho / correção de não conformidade / outro), motivo (obrigatório), ensaio de origem, etapa de execução, quantidade prevista, data prevista, responsável, análise de causa |
| ADD-02 | Atualizar (admin, ou responsável/criador com `editar` em `dashboard`): quantidade realizada, turno, observação/“não vou deixar observação”, análise de causa |
| ADD-03 | Status automático: aberta (0) → em andamento (>0) → concluída (= previsto, grava data de conclusão) |
| ADD-04 | Cancelar com justificativa obrigatória; cancelada fica visível, somente leitura e fora do cálculo |
| ADD-05 | Programação original do item (previsto/prazo) nunca é alterada |
| ADD-06 | Relatório: total, em aberto, tempo médio de conclusão (h), motivos mais frequentes |

## 7. Qualidade (`/qualidade`) – abas Inspeções (módulo `qualidade`) e Ensaios (módulo `ensaios`)

Inspeções (`Quality`):

| Código | Item |
|---|---|
| QUA-01 | Indicadores: Aguardando inspeção, Inspeções aprovadas, Inspeções reprovadas, Ordens concluídas |
| QUA-02 | Busca + filtro resultado (Aprovadas / Reprovadas / Aguardando inspeção) |
| QUA-03 | Cards de OPs “Aguardando qualidade” com “Registrar inspeção” |
| QUA-04 | Tabela “Inspeções realizadas” (ordem, resultado/observação, data, setor) |
| QUA-05 | “Laudos de componentes”: tabela de componentes com filtro de laudo (aguardando/aprovado/reprovado) e ações (laudo, consumir material, histórico) |

Ensaios (`Assays`):

| Código | Item |
|---|---|
| ENS-01 | Indicadores: Ensaios em aberto, Aguardando verificações, Gargalos, Reprovados (sem retrabalho concluído) |
| ENS-02 | Filtros: busca laudo/item/obra, obra, tipo, profissional (inspetor/verificador), mostrar aprovados e cancelados |
| ENS-03 | Agrupamento por status: solicitado, em execução, aguardando NII, aguardando NIII, reprovado (+ aprovado, cancelado) |
| ENS-04 | Card: código do laudo, status, tipo, item, obra, horas na etapa atual, selo “Gargalo”, responsável atual, NII/NIII, pendência, cancelamento |
| ENS-05 | Solicitar ensaio (admin/inspetor com `editar` em `ensaios`): obra, item, tipo, código do laudo (único), inspetor, verificador NII, verificador NIII; gera alerta “Item … bloqueado” |
| ENS-06 | Execução (admin ou inspetor atribuído): solicitado → em execução → aguardando NII |
| ENS-07 | Verificação (admin ou verificador atribuído do nível): NII aprova → aguardando NIII; NIII aprova → aprovado; qualquer reprovação → reprovado (observação obrigatória) + alerta “Retrabalho necessário” |
| ENS-08 | NIII só decide após NII aprovado; sem pular etapas |
| ENS-09 | Após reprovação, sugere criar etapa de retrabalho (se tiver permissão individual) |
| ENS-10 | Cancelar com justificativa (admin/gestor) |
| ENS-11 | Histórico por ensaio |
| ENS-12 | Gargalo = status aberto e horas no status > limite configurado para o tipo/status (sem limite → sem gargalo) |

## 8. Configurações (`/configuracoes`) – só admin

| Código | Item |
|---|---|
| CFG-01 | Limites (h) por tipo de ensaio × status aberto; vazio = “limite não configurado”; criar tipo de ensaio |
| CFG-02 | Política de observação para “Quantidade realizada” e “Efetivo por turno” |
| CFG-03 | Escopo de etapas por obra: “definidos na obra” ou “por subprojeto” |
| CFG-04 | Etapas e responsáveis: responsável atual, atribuições anteriores (início → fim), “Alterar responsável” (fecha atribuição anterior) |
| CFG-05 | Histórico de configurações |

## 9. Ordens de Produção (`/ordens`, `/ordens/:id`) – módulo `ordens`

| Código | Item |
|---|---|
| ORD-01 | Tabela: OP/FA, Produto/Projeto, Setor, Progresso (produzido/planejado %), Prazo (+ “n dias restantes” / “Prazo ultrapassado” / “Entregue”), Status (mostra “Atrasada” quando vencida), link detalhe; contador total |
| ORD-02 | Filtros: busca, status (inclui “Atrasada” = vencida), setor, mês de entrega, ordenação (OP, prazo, abertura, status), limpar |
| ORD-03 | Paginação 10 por página (5 na versão compacta); exportar CSV |
| ORD-04 | Nova OP (`editar` em `ordens`): número da OP (único), **FA = “Ficha de acompanhamento”** (texto), produto, projeto (texto livre), quantidade planejada (≥1), setor responsável, responsável, data de início, prazo de entrega |
| ORD-05 | Validações: entrega ≥ início; planejada ≥ produzida (edição) |
| ORD-06 | Cadastro/edição geram evento para Produção e Projetos |
| ORD-07 | Detalhe: dados, progresso, histórico da ordem (eventos), aviso contextual, setores envolvidos |
| ORD-08 | Ações no detalhe: Registrar produção, Registrar inspeção (se aguardando qualidade), Liberar produção (se parada/aguardando material), Registrar ocorrência, Editar |
| ORD-09 | Status: Em andamento, Atrasada, Parada, Aguardando material, Aguardando qualidade, Concluída |
| ORD-10 | Setores: PCP, Usinagem, Montagem, Fundição, Produção, Projetos, Almoxarifado, Qualidade |
| ORD-11 | Motivos de parada: Falta de matéria-prima, Falta de ferramentas, Problemas em máquinas, Falta de mão de obra, Aguardando informações, Outros |

Máquina de estados (`sf_order_action`):

| Código | Regra |
|---|---|
| ROP-01 | Produção: quantidade > 0 e ≤ restante; proibida se Concluída/Aguardando qualidade/Parada/Aguardando material; atinge planejado → “Aguardando qualidade” (notifica Qualidade), senão “Em andamento” (notifica PCP) |
| ROP-02 | Ocorrência: proibida se Concluída; “Falta de matéria-prima” → “Aguardando material” (notifica PCP+Almoxarifado), outros → “Parada” (PCP+Produção); prioridade Alta; observação obrigatória |
| ROP-03 | Inspeção: só se “Aguardando qualidade”; Aprovada → “Concluída”, Reprovada → “Parada”; notifica PCP/Produção/Projetos; observação obrigatória |
| ROP-04 | Retomada: só se Parada/Aguardando material; volta a “Aguardando qualidade” se já completa, senão “Em andamento”; resolve as ocorrências abertas da OP; providência obrigatória |
| ROP-05 | Atualização do projeto: registra evento (PCP+Projetos) sem mudar status |
| ROP-06 | Todo registro grava status anterior → novo e observação |
| ROP-07 | OP vencida (prazo < hoje e não concluída) é tratada como atrasada (vermelho) |
| ROP-08 | Concluir só com aprovação da Qualidade |

## 10. Produção (`/producao`) – módulo `producao`

| Código | Item |
|---|---|
| PRD-01 | Duas visões: “Componentes por etapa” e “Ordens de produção” |
| PRD-02 | Componentes por etapa: escolher obra; quadro em colunas (Sem etapa + etapas da obra ordenadas) |
| PRD-03 | Etapa: nome + responsável; criar, editar, subir/descer ordem |
| PRD-04 | Card do componente: modelo, série, laudo, OP/FA, pedido, barra de avanço %, “Concluído/Em andamento” |
| PRD-05 | Mover componente entre etapas (arrastar e soltar ou seletor); etapa precisa ser da mesma obra |
| PRD-06 | Atualizar avanço (0–100); 100% bloqueado sem laudo “Aprovado” |
| PRD-07 | Laudo, consumir material, histórico do componente, arquivar componente |
| PRD-08 | Ordens de produção: cards de OPs não concluídas com filtros (busca, status, etapa = setor), registrar produção, ocorrência, retomar |
| PRD-09 | Alternar arquivados |

## 11. Projetos/Obras (`/projetos`) – módulo `projetos`

| Código | Item |
|---|---|
| PRJ-01 | Duas visões: “Projetos/Obras” e “Ordens vinculadas” |
| PRJ-02 | Lista de projetos (cards): status geral, nome, cliente, contrato, “Sub-projeto de …”, responsável; busca; alternar Arquivados |
| PRJ-03 | Projeto: nome, contrato, cliente, responsável, status geral (Em andamento/Concluído/Pausado), descrição (todos obrigatórios exceto descrição) |
| PRJ-04 | Dentro do projeto: editar, “Novo Pedido”, “Novo Componente”, histórico, arquivar |
| PRJ-05 | “Este projeto possui sub-projetos” (liga/desliga; desligar com filhos pede confirmação e não apaga nada); “Novo Sub-projeto” |
| PRJ-06 | **Pedidos (contrato aditivado)**: número (único na obra), data de entrega, status, observações; lista ordenada por data de entrega; “Concluídos: x de y” (componentes 100%) |
| PRJ-07 | Componente: modelo, número de série (único), OP vinculada (deve existir); avanço e etapa só mudam pela Produção |
| PRJ-08 | Pedido aberto mostra componentes: modelo/série, etapa, avanço, prazo (do pedido), editar/histórico/arquivar |
| PRJ-09 | Arquivar/desarquivar em cascata (sub-projetos, pedidos, componentes, etapas); não apaga; desarquivar exige pai desarquivado; registro arquivado não pode ser alterado |
| PRJ-10 | Histórico por registro (cadastro, edição, movimentação, avanço x%→y%, laudo, consumo, arquivamento) |
| PRJ-11 | Ordens vinculadas: OPs agrupadas por texto “projeto”, avanço agregado, “Atenção ao prazo”/“Dentro do prazo”, filtro “Com risco de atraso”, “Registrar atualização do projeto” |

## 12. Almoxarifado (`/almoxarifado`) – módulo `almoxarifado`

| Código | Item |
|---|---|
| ALM-01 | Indicadores: Materiais cadastrados, Abaixo do mínimo, Solicitações pendentes, Ordens aguardando material |
| ALM-02 | Tabela de estoque: código, material, categoria, estoque, mínimo, OP vinculada, situação (Estoque baixo/Disponível), Movimentar; filtros busca/categoria/estoque baixo; exportar CSV |
| ALM-03 | Cadastrar material: código (único), descrição, categoria, unidade (un/kg/m), estoque, mínimo, OP vinculada |
| ALM-04 | Movimentar: Entrada/Saída, quantidade, observação; estoque não pode ficar negativo; gera evento para PCP e Produção |
| ALM-05 | Solicitações de materiais: ocorrências (parada) destinadas ao Almoxarifado não resolvidas → “Registrar providência” (= liberar produção) |
| ALM-06 | Consumo por componente (consumir material baixa estoque; abaixo do mínimo gera alerta Alta para Almoxarifado/PCP) |

## 13. Componentes – regras (`work-rules.ts`, `sf_work_mutate`)

| Código | Regra |
|---|---|
| CMP-01 | Laudo: Aprovado/Reprovado + observação obrigatória; grava quem/quando; Reprovado limita avanço a 99% e notifica Produção/PCP (Alta) |
| CMP-02 | Consumo: quantidade > 0 e ≤ estoque; registra código/nome/qtd/unidade/quando/quem no componente |
| CMP-03 | Permissões: laudo = `editar` qualidade; consumo = `editar` almoxarifado ou produção; etapa/mover/avanço = `editar` produção; projeto/pedido/componente = `editar` projetos |

## 14. Notificações (`/notificacoes`) – módulo `notificacoes`

| Código | Item |
|---|---|
| NOT-01 | Lista de eventos: ponto de não lida, OP · tipo, descrição, origem → destinatários, data/hora, providência, selo (Resolvida/Alta/Normal) |
| NOT-02 | Filtros: busca, destinatário, origem, prioridade, lidas/não lidas; contador; aceita `?q=` |
| NOT-03 | Marcar como lida, Marcar todas como lidas, Registrar providência (resolve) |

## 15. Histórico (`/historico`) – módulo `historico`

| Código | Item |
|---|---|
| HIS-01 | Tabela cronológica: data/hora, OP, setor/responsável, movimentação+descrição, status anterior → novo, providência |
| HIS-02 | Filtros: busca, setor, tipo de movimentação, data; aceita `?q=`; exportar CSV |

## 16. Relatórios (`/relatorios`) – módulo `relatorios`

| Código | Item |
|---|---|
| REL-01 | Filtros: busca, mês (início da OP), projeto, setor |
| REL-02 | Indicadores: concluídas, atrasadas, quantidade produzida, paradas registradas |
| REL-03 | Desempenho por setor (produzido/planejado %), principais motivos de parada |
| REL-04 | Qualidade e materiais: inspeções aprovadas/reprovadas, materiais abaixo do mínimo, conclusão global |
| REL-05 | Exportar CSV (OP, Projeto, Setor, Planejado, Produzido, Conclusão, Status, Prazo) |

## 17. Painel antigo (`simulflow/dashboard.tsx`)

Componente `Dashboard` com indicadores de OPs, gráfico de evolução (7/14 dias), donut por status,
tabela compacta, alertas e últimas movimentações. **Não está ligado a nenhuma rota** no protótipo atual
(foi substituído pelo Dashboard filtrado), mas seus blocos (`ProductionChart`, `StatusChart`, `Activity`)
existem no código. Registrado aqui como “INI-01 … INI-05” para decidir se volta como aba Início.

## 18. Dados de demonstração

| Código | Conteúdo |
|---|---|
| DEM-01 | 8 OPs (OP-2026-001…008) em todos os status, projetos Linha Atlas / Projeto Orion / Projeto Nova / Projeto Vega |
| DEM-02 | 5 materiais (MAT-001…005) |
| DEM-03 | 6 eventos iniciais |
| DEM-04 | Obras “Estaca Torpedo” (DEMO-NUC-024, Petrobras, com subprojeto “Estruturas de ancoragem”) e “Vasos de Pressão” (DEMO-NUC-035, Eletronuclear); etapas Soldagem, Montagem, Usinagem; ciclos de 21 dias (metas 80% e 85%); itens T-24…T-29 e VP-1…VP-4; tipos Ultrassom, Radiografia, Líquido penetrante, Volumétrico; 5 ensaios DEMO-LD-1231…1235 em estados distintos; efetivo do turno da manhã |

## 19. Onde os dados ficavam

| Dado | Armazenamento original |
|---|---|
| OPs, materiais, eventos | Tabelas `sf_orders`, `sf_materials`, `sf_events` no banco hospedado |
| Projetos, pedidos, componentes, etapas de produção | `sf_work_records` (hierarquia por `parent_id`, `data` JSON) + `sf_work_history` |
| Ciclos, itens, ensaios, verificações, efetivo, alertas, políticas, atribuições, etapas adicionais | `sf_cycles`, `sf_schedule_items`, `sf_assays`, `sf_verifications`, `sf_staffing`, `sf_program_alerts`, `sf_update_policies`, `sf_stage_assignments`, `sf_additional_stages` |
| Auditoria | `sf_program_audit` |
| Usuários | serviço de autenticação + `profiles`, `user_roles`, `sf_permissions`, `sf_dashboard_work_access` |
| Configuração do Dashboard | `sf_dashboard_settings` |
| Filtros do Dashboard | `sessionStorage` do navegador |
| Estado de tela (abas, modais, filtros locais) | memória (React state) |

## 20. Referências à plataforma de origem (removidas)

O export tinha 13 pontos de amarração à plataforma de origem: pasta de metadados e planos, blocos de
README/AGENTS, pacote de configuração do Vite e exclusões no gerenciador de pacotes, módulo de envio de
erros para o editor (com metatags `author`/`twitter:site`), broker de sessão para domínios de preview,
mensagens e middleware da nuvem da plataforma, variáveis de ambiente de cron e de migração, logos
hospedados no CDN da plataforma (as imagens não vieram no export) e o `.env` com URL/chave do banco.
Nenhum desses arquivos, pacotes, URLs ou nomes foi copiado para este projeto.

A lista com os nomes exatos de cada arquivo e identificador está no inventário original, guardado
fora desta pasta (`../simulflow-origem/`), para que a busca pelo nome da plataforma neste projeto
não retorne nada.

## 21. Pontos ambíguos / conflitos com o pedido (para decisão)

| Código | Ponto |
|---|---|
| Q-01 | No protótipo, **FA = “Ficha de acompanhamento”**, um campo de texto da OP. O pedido descreve FA como “frentes/ações” que ligam setores e itens, com responsável, prazo e status – entidade que **não existe** no protótipo. |
| Q-02 | O protótipo tem **dois conceitos de “item”** separados: (a) *componentes* (Projetos/Obras → Pedido → Componente, com série, etapa de produção, % e laudo) e (b) *itens da Programação* (T-24…T-29, por ciclo tri-semanal, previsto/realizado, ensaios NII/NIII). O pedido descreve um único “item numerado com status e % próprios, atribuído a uma etapa”. |
| Q-03 | O protótipo tem 13 perfis (inclui gestor, supervisor, técnico, inspetor, NII, NIII, consulta) + permissão por módulo; o pedido fala em “host” + áreas. |
| Q-04 | Login no protótipo é por e-mail com recuperação por e-mail; o pedido pede usuário e senha, com senha definida pelo host (sem servidor de e-mail). |
| Q-05 | O protótipo não tem aba “Início/Painel” ligada (o painel de OPs existe no código, mas sem rota). |
| Q-06 | Exportação PDF/Excel usava bibliotecas (jsPDF, exceljs); sem build e sem dependências. |
