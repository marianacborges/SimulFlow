# Planilha de usuários: a mesma conta em todos os aparelhos

Os dados do SimulFlow (OPs, FAs, obras…) ficam em cada aparelho. As **contas** podem ficar também numa
planilha Google só de usuários, separada da planilha da Presença. Assim a mesma conta entra em
qualquer aparelho conectado.

- A planilha guarda login, nome e a conta em código. O cadastro não tem e-mail.
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

## 3. Token de leitura, embutido no site

Com ele, qualquer aparelho entra com usuário e senha, sem configurar nada.

1. Na planilha, use **SimulFlow Contas › 2. Gerar token de acesso…** com o perfil **leitura**
   (ou, no SimulFlow, **Usuários e permissões › Planilha de usuários › Novo acesso › Leitura**).
2. Coloque a URL `/exec` e esse token em `config/app.json`:

   ```json
   "planilhaUsuarios": { "url": "https://script.google.com/macros/s/…/exec", "token": "sfc_…" }
   ```

Com o site publicado, um aparelho novo:
- já abre na tela **Entrar**, porque as contas chegam da planilha na abertura;
- se a planilha não responder a tempo, mostra **Primeiro acesso**. Nesse caso, **Já tenho conta** pede só
  usuário e senha;
- busca as contas mais novas a cada login.

O que o token de leitura pode fazer:

| Ação | Token de leitura (site) | Token admin (host) |
| --- | --- | --- |
| Ler as contas e entrar | sim | sim |
| Trocar a **própria** senha (provando a senha atual) | sim | sim |
| Criar, editar ou desativar contas | não | sim |
| Criar e revogar acessos | não | sim |

A troca da própria senha, seja a obrigatória depois da senha provisória ou a de **Alterar minha senha**, vai
para a planilha. Para isso, a planilha guarda na coluna **Verificador** um código da senha (SHA-256 de
`login:senha`), que nunca sai pela API. O verificador é gravado quando o host define uma senha provisória
ou entra no próprio aparelho. Se uma conta antiga ainda não tiver verificador, o host define uma senha
provisória nova.

## Segurança

O token de leitura fica visível no código público do site. Com ele, qualquer pessoa consegue ler a lista
de usuários (login e nome) e os hashes das senhas (PBKDF2, 120 000 iterações), mas não consegue gravar nada.
Use senhas fortes. Se precisar trocar o token, revogue-o em **Usuários e permissões › Planilha de
usuários**, gere outro e atualize o `config/app.json`. Os tokens ficam na aba Acessos só como hash.

## Testar sem conta Google

```bash
node tools/simulflow.js emular-planilha 8791 --contas
```
