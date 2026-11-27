# Planilha de usuários: a mesma conta em todos os aparelhos

Os dados do SimulFlow (OPs, FAs, obras…) ficam em cada aparelho. As **contas** podem ficar também numa
planilha Google só de usuários, separada da planilha da Presença. Assim a mesma conta entra em
qualquer aparelho conectado.

- A planilha guarda login, e-mail, nome e a conta em código.
- A senha fica só como hash: nunca aparece legível.
- Usuários são criados e alterados só pelo SimulFlow (Usuários e permissões); a planilha recebe tudo sozinha.

## 1. Criar a planilha e o script

1. Em <https://sheets.google.com>, crie uma planilha em branco, por exemplo "SimulFlow — Usuários".
2. Abra **Extensões › Apps Script**.
3. No `Código.gs`, apague tudo e cole o conteúdo de `apps-script/contas/Contas.gs`.
4. Opcional: em **Configurações do projeto**, mostre o `appsscript.json` e cole `apps-script/contas/appsscript.json`.
5. Salve. Escolha a função `menuPrepararContas` e clique em **Executar**.
   - Aceite a autorização: Avançado › Acessar › Permitir.
   - Isso cria as abas **Usuários** e **Acessos**, protegidas.
6. **Implantar › Nova implantação › App da Web**, com **Executar como: Eu** e **Quem pode acessar:
   Qualquer pessoa**. Copie a URL que termina em `/exec`.
7. Recarregue a planilha e use **SimulFlow Contas › 2. Gerar token de acesso…** com o perfil **admin**.
   Copie o token, que começa com `sfc_`.

## 2. Conectar o seu aparelho (host)

Em **Usuários e permissões › Planilha de usuários › Conectar**, cole a URL e o token admin. As contas
deste aparelho sobem para a planilha, e a lista de acessos aparece.

## 3. Cada aparelho novo

1. No seu aparelho, clique em **Novo acesso para aparelho**, informe o nome (ex.: PC da Produção) e
   copie a URL e o token mostrados.
2. No aparelho novo, toque em **Já tenho conta** (no Primeiro acesso) ou em **Entrar com conta de outro
   aparelho** (na tela Entrar).
3. Cole a URL e o token e entre com o usuário e a senha.

Depois de conectado, o aparelho:
- busca as contas mais novas a cada abertura e a cada login;
- envia sozinho toda conta nova, edição e troca de senha.

Vale o registro mais novo de cada conta.

## Segurança

Quem tem um token consegue ler os hashes das senhas. Revogue o acesso de um aparelho perdido em
**Usuários e permissões › Planilha de usuários**. Os tokens ficam na aba Acessos só como hash.

## Testar sem conta Google

```bash
node tools/simulflow.js emular-planilha 8791 --contas
```
