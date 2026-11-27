# Presença operacional — guia de implantação e uso

A aba **Presença operacional** conta os colaboradores presentes no dia. O celular lê a tag NFC
do crachá e o Planejamento acompanha a planilha do dia no PC, que se atualiza sozinha a cada poucos
segundos.

**Como funciona:**

| Peça | Onde roda | Função |
|---|---|---|
| Site SimulFlow (`index.html`, `leitura.html`) | GitHub Pages (HTTPS) | Telas do PC e do celular |
| Planilha Google + Apps Script (`apps-script/*.gs`) | Conta Google | Guarda colaboradores, leituras e histórico; fecha o dia às 16:40 |

O site não guarda as leituras: tudo vai para a planilha. Cada aparelho usa um **token de
acesso** com um destes perfis:

- **leitor**: celular que só registra leituras;
- **planejamento**: vê a planilha e o histórico e cadastra colaboradores;
- **admin**: tudo isso, mais fechar o turno e gerenciar acessos.

---

## 1. Publicar o site no GitHub Pages (HTTPS)

A Web NFC só funciona em HTTPS, e o GitHub Pages já entrega HTTPS.

1. Crie um repositório no GitHub (ex.: `simulflow`) e envie o conteúdo desta pasta.
2. No repositório: **Settings › Pages › Build and deployment › Source: Deploy from a branch**,
   **Branch: `main` / `(root)`** › **Save**.
3. Em 1 ou 2 minutos o site fica em `https://SEU-USUARIO.github.io/simulflow/`.
   - PC: `https://SEU-USUARIO.github.io/simulflow/`
   - Celular (só a leitura): `https://SEU-USUARIO.github.io/simulflow/leitura.html`

O arquivo `.nojekyll` na raiz faz o GitHub publicar os arquivos como estão.

> **Atenção:** no plano gratuito do GitHub, o Pages exige repositório **público**. Todo o código e
> o `config/app.json` ficam visíveis. Não há senhas nem tokens nos arquivos: as senhas ficam no
> navegador de cada usuário e os tokens, na planilha Google.

## 2. Criar a planilha e o script

1. Em <https://sheets.google.com>, crie uma planilha em branco (ex.: "SimulFlow — Presença").
2. Abra **Extensões › Apps Script**.
3. Cole o código. Há duas formas:
   - um arquivo só, com o `Codigo.gs` combinado (todos os `.gs` juntos), colado no `Código.gs`;
   - ou um arquivo de script para cada `.gs` da pasta `apps-script/` (`Config`, `Dominio`,
     `Planilha`, `Dados`, `Resumo`, `Api`, `Menu`).
4. Em **Configurações do projeto** (engrenagem), marque *Mostrar o arquivo de manifesto
   "appsscript.json"* e cole o conteúdo de `apps-script/appsscript.json`. Ele define o fuso
   America/Sao_Paulo e o runtime V8. Esse passo é opcional: o código já usa o fuso de São Paulo.
   Se colar o JSON num arquivo `.gs` por engano, o editor acusa erro de sintaxe; nesse caso, apague o arquivo.
5. Salve e recarregue a planilha. Aparece o menu **SimulFlow**.
6. **SimulFlow › 1. Preparar planilha**. Na primeira vez o Google pede autorização: aceite com a
   conta dona da planilha. Se aparecer "O Google não verificou este app", clique em **Avançado ›
   Acessar (não seguro)**. Isso cria as abas abaixo e protege as de registros:
   - Hoje, Colaboradores, Registros, Turnos, Histórico detalhado e Acessos;
   - **Dados**, onde ficam os dados do SimulFlow quando os computadores estão conectados;
   - **Config**, com os e-mails do resumo.

   Se o menu não aparecer ou der "erro desconhecido", abra o Apps Script, escolha a função
   `instalarGatilho` e clique em **Executar** (de preferência numa janela anônima, com uma conta Google só).
7. **SimulFlow › 2. Ativar fechamento automático (16:40)**. Instala um gatilho que roda a cada 5
   minutos e faz três coisas:
   - fecha a planilha do dia às 16:40, mesmo com tudo desligado;
   - fecha dias anteriores esquecidos (fechamento tardio);
   - cria a planilha do novo dia.

## 3. Implantar a API (app da Web)

1. No Apps Script: **Implantar › Nova implantação › tipo: App da Web**.
2. **Executar como: Eu** · **Quem pode acessar: Qualquer pessoa**.
   Qualquer pessoa alcança o endereço, mas toda chamada exige um token válido da aba Acessos.
3. **Implantar** e copie a **URL do app da Web** (termina em `/exec`).
4. Sempre que alterar o código: **Implantar › Gerenciar implantações › editar › Versão: Nova
   versão**. Assim a URL continua a mesma.

## 4. Gerar os tokens

Na planilha: **SimulFlow › 3. Gerar token de acesso…** O token aparece uma única vez; copie na hora.

- Crie primeiro um token **admin** para você.
- Os demais podem ser criados pelo SimulFlow (aba Presença › Conexão › Novo acesso), já logado
  como admin. Perfis:

  | Perfil | Para quê |
  |---|---|
  | **leitor** | Celular da leitura: só registra presenças |
  | **sistema** | Computador de um setor: dados do SimulFlow (OPs, FAs…), sem a Presença |
  | **planejamento** | Presença completa e dados do SimulFlow |
  | **admin** | Tudo, mais fechar o turno, gerenciar acessos, e-mails do resumo e substituir os dados |

## 5. Conectar o PC do Planejamento

1. Abra o site, entre com seu usuário e vá em **Presença operacional › Conexão**.
   A aba aparece para o host e para usuários da área PCP (Planejamento).
2. Cole a **URL do app da Web** e o **token** › **Testar e salvar**.
3. A **Planilha do dia** passa a mostrar:
   - presentes;
   - presentes por função;
   - quem ainda não passou o cartão;
   - leituras após o fechamento.

## 5.1 E-mail diário com o resumo

1. Em **Presença › Conexão** (acesso admin), informe os **E-mails do resumo diário**, separados por
   vírgula, e clique em **Salvar e-mails**.
2. Clique em **Enviar e-mail de teste**.
3. Na primeira vez, o Google pede autorização para enviar e-mails:
   - no Apps Script, escolha a função `instalarGatilho`, clique em **Executar** e aceite;
   - depois publique uma nova versão em **Implantar › Gerenciar implantações › ✏️ › Nova versão**.

O resumo sai a cada fechamento (automático às 16:40, tardio ou manual), uma vez por dia. Ele traz:
- presentes sobre ativos;
- quantos chegaram fora do turno;
- presentes por função;
- a lista de quem não passou o cartão;
- o link da planilha.

O envio fica registrado na coluna "E-mail enviado" da aba **Turnos**. Uma falha no envio nunca
impede o fechamento. Uma conta Gmail comum envia até 100 e-mails por dia.

## 5.2 Relatório mensal

Em **Presença › Relatório**, escolha o mês. Para cada colaborador aparecem:
- presenças, faltas e chegadas fora do turno;
- leituras após o fechamento;
- **% de presença**, que é presenças divididas pelos dias fechados em que a pessoa estava ativa.

Só entram dias já fechados. A tabela ordena clicando no cabeçalho, e o relatório pode ser
exportado em CSV ou XLSX (com as abas Colaboradores e Dias).

## 6. Configurar o celular (Chrome no Android)

Requisitos: Android com NFC e **Google Chrome 89 ou mais novo**. A Web NFC não funciona em
iPhone, Firefox ou Samsung Internet.

1. Ative o NFC no Android: **Configurações › Conexões › NFC**.
2. No PC (logado como admin), em **Presença › Conexão › Novo acesso**, crie um acesso com perfil
   **leitor** (ex.: "Celular do Planejamento").
3. Copie o **Link para o celular** e envie ao celular (WhatsApp, e-mail…). Abra-o no **Chrome**.
4. O celular fica configurado e o token sai do endereço. Use *Adicionar à tela inicial* para ter um
   atalho.
5. Toque em **Iniciar leitura** e, quando o Chrome pedir, **permita o NFC**.
6. Mantenha a página aberta e a tela ligada durante a leitura. A página pede para a tela não
   apagar, mas se o celular bloquear a tela, desbloqueie e volte à página.

## 7. Cadastrar a primeira tag

**Opção mais simples: gravar os dados na tag com o app NFC Tools** (Android ou iPhone):

1. No NFC Tools: **Escrever › Adicionar registro › Texto**.
2. Digite `Nome|Matrícula|Função`, por exemplo `Maria Silva|12345|Soldadora`, e toque em **OK**.
3. Toque em **Escrever** e encoste o adesivo. Não use "Bloquear tag" nem "Proteger com senha".
4. Na primeira vez que o crachá passar no celular de leitura, o SimulFlow cadastra a pessoa e já registra
   a presença. A tela mostra **"Cadastrado agora pela tag"**.

Como funciona:

- O cadastro fica ligado ao **número de série** do adesivo, que vem de fábrica e não muda. Nas
  leituras seguintes vale o cadastro, e o texto é ignorado.
- **Matrícula já cadastrada sem tag:** o adesivo é ligado a esse cadastro. Nome e função continuam
  os do cadastro.
- **Matrícula já ligada a outro adesivo:** a leitura é recusada, para evitar cópia de crachá. Se o
  crachá foi trocado, apague o código antigo no cadastro do colaborador.
- Data e hora **não** vão no adesivo: são o momento de cada leitura.
- Qualquer celular de leitura, inclusive com perfil leitor, faz esse cadastro. Confira de vez em
  quando a lista em **Colaboradores**.
- Para testar no PC sem adesivo, use **Simular leitura** com `código|Nome|Matrícula|Função`, por
  exemplo `04AABBCCDDEE01|Maria Silva|12345|Soldadora`.

**Opção A, pelo celular:**

1. No celular, entre no SimulFlow com um usuário do PCP.
2. Em **Presença › Conexão**, conecte com um token **planejamento** ou **admin**.
3. Em **Colaboradores › Novo colaborador**, preencha Nome, Matrícula e Função.
4. Toque em **Ler pelo NFC** e encoste o cartão. O código entra no campo e, se a tag tiver
   `Nome|Matrícula|Função` gravado, os campos vazios também são preenchidos. Depois toque em **Salvar**.

**Opção B, pelo leitor:**

1. Na tela de leitura, encoste um cartão ainda não cadastrado.
2. A tela mostra **Tag não cadastrada** com o código, por exemplo `04A1B2C3`.
3. Copie o código para o cadastro, no PC ou na aba Colaboradores da planilha Google.

**Opção C, em lote:** **Colaboradores › Modelo CSV**. Preencha
`Nome;Matrícula;Função;Código da tag;Ativo` e use **Importar CSV**. Se alguma linha tiver erro, nada é
gravado e a lista de erros por linha aparece na tela.

O código é sempre gravado normalizado: `04:a1:b2:c3` vira `04A1B2C3`.

## 8. Testar com um cartão real

1. No celular, em **Iniciar leitura**, encoste o cartão na parte de trás do aparelho (perto da
   câmera, na maioria dos modelos) e segure por cerca de 1 segundo.
2. O resultado esperado é uma tela **verde** com Nome, Matrícula, Função e Data/Hora, mais vibração
   e um bipe. Antes das 07:30, a tela fica **amarela** com o selo "fora do turno".
3. Encoste o mesmo cartão de novo depois de 3 segundos. A tela fica **amarela** com "Já registrado às
   HH:MM" e nada é gravado.
4. Encoste um cartão não cadastrado. A tela fica **vermelha** com "Tag não cadastrada".
5. No PC, a Planilha do dia mostra a leitura em poucos segundos, sem recarregar.
6. Na planilha Google, a aba **Hoje** também mostra as leituras do dia.

**Se algo não funcionar:**

| Mensagem | O que fazer |
|---|---|
| "não suporta Web NFC" | Use o Chrome no Android |
| "exige HTTPS" | Abra pelo endereço `https://…github.io/…`, não por arquivo |
| "NFC está desligado" | Ative o NFC no Android e toque em Iniciar leitura de novo |
| "Permissão de NFC negada" | Chrome › ⋮ › Configurações › Configurações do site › NFC › permitir |
| "Token inválido ou revogado" | Gere um novo acesso e abra o novo link |

## 9. Regras do dia

- **Turno administrativo:** 07:30 às 16:40 (America/Sao_Paulo). Leituras fora desse horário são
  aceitas e marcadas como "fora do turno".
- **Às 16:40 a planilha fecha** (gatilho automático). O snapshot (presentes e ausentes) vai para o
  **Histórico detalhado** e não muda mais.
- **Após o fechamento, até 23:59:** as leituras entram na lista **Leituras após o fechamento**, fora do
  total do dia.
- **Planilha esquecida aberta:** se o gatilho não rodou, ela é fechada como *tardio* na próxima
  chamada (ou ao abrir o sistema no dia seguinte), e a planilha do dia atual é criada.
- **Fechar turno agora:** disponível só para o perfil admin, com confirmação.
- **Histórico:** lista os dias fechados. Cada dia abre em modo somente leitura e exporta em CSV ou XLSX.
- **Saída:** ainda não é registrada. O modelo já tem a coluna `Tipo` (entrada/saída) para isso.

## 10. Testar sem conta Google (emulador)

```bash
node tools/simulflow.js emular-planilha
```

```bash
node tools/simulflow.js servir
```

Abra http://localhost:8080 › Presença › Conexão. Use a URL `http://localhost:8790/` e um dos tokens
que o emulador mostra. Para simular outro horário:
`node tools/simulflow.js emular-planilha --relogio=2026-11-26T16:35:00-03:00`.

## Atualizar o código da planilha

Sempre que o `Codigo.gs` mudar:
1. Apague todo o `Código.gs` (**Ctrl+A** e depois **Delete**), cole o novo e salve.
2. Publique em **Implantar › Gerenciar implantações › ✏️ › Versão: Nova versão › Implantar**. A URL continua a mesma.

## Limitações

- A planilha Google responde em 1 a 3 segundos por leitura. Os limites de uso do Google atendem
  dezenas de leituras por minuto.
- O dono da planilha consegue editar qualquer aba, inclusive as protegidas.
- O login do SimulFlow continua local (no navegador). O que protege os dados da presença é o token.
