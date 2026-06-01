# Guia completo — Banco Neon + Bot Slack + Deploy no Render

Este guia leva você do zero até o formulário publicado na internet, gravando
cada cliente no banco **Neon** e enviando um aviso no **Slack** (DM para você).

Não precisa saber programar. Siga na ordem. Tempo estimado: ~30 minutos.

> **Conceito-chave:** os segredos (senha do banco e token do Slack) **nunca**
> ficam no código. Você vai colá-los no painel do Render como "variáveis de
> ambiente". O servidor lê de lá com segurança.

---

## Visão geral do que vamos fazer

1. **Neon** → criar o banco de dados grátis e copiar a `DATABASE_URL`.
2. **Slack** → criar o bot e copiar o token (`xoxb-...`).
3. **GitHub** → subir o código (o Render puxa daqui).
4. **Render** → criar o serviço, colar os segredos e publicar.
5. **Testar** → preencher o formulário e ver chegar no banco e no Slack.

---

## PASSO 1 — Criar o banco no Neon (grátis)

1. Acesse **https://neon.tech** e clique em **Sign up** (pode entrar com o Google).
2. Crie um **projeto** novo. Pode deixar o nome padrão (ou "captacao").
   - Região: escolha uma próxima do Brasil (ex.: *AWS US East* serve bem).
3. Assim que o projeto é criado, o Neon mostra uma tela **"Connection string"**
   (ou vá em **Dashboard → Connect**).
4. Copie a string de conexão. Ela se parece com:
   ```
   postgresql://neondb_owner:SUASENHA@ep-xxxx-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   - Se aparecer a opção **"Pooled connection"**, pode usar essa — funciona bem
     no plano gratuito do Render.
5. **Guarde essa string.** Ela é a sua `DATABASE_URL` (você cola no Render no Passo 4).

> Você **não precisa** criar a tabela manualmente. Na primeira vez que o
> servidor sobe, ele cria a tabela `clientes` sozinho.

---

## PASSO 2 — Criar o bot no Slack

Você tem Slack pago, então isso funciona sem limitações.

### 2.1 Criar o app
1. Acesse **https://api.slack.com/apps** e clique em **Create New App**.
2. Escolha **From scratch**.
3. **App Name:** `Captacao` (ou o que quiser). **Workspace:** selecione o seu.
4. Clique em **Create App**.

### 2.2 Dar permissão para o bot enviar mensagens
1. No menu lateral, vá em **OAuth & Permissions**.
2. Role até **Scopes → Bot Token Scopes** e clique em **Add an OAuth Scope**.
3. Adicione o scope: **`chat:write`**
   - (opcional, recomendado para DM: adicione também **`im:write`**)

### 2.3 Instalar o app no workspace
1. Ainda em **OAuth & Permissions**, role para o topo e clique em
   **Install to Workspace** → **Allow**.
2. Depois de instalar, aparece o **Bot User OAuth Token**, que começa com
   **`xoxb-...`**. **Copie e guarde** — essa é a sua `SLACK_BOT_TOKEN`.

### 2.4 Garantir que você recebe a DM
- O destino já está configurado para o seu ID: **`U0895CZ8HU7`**.
- Com o scope `chat:write`, o bot consegue te mandar mensagem direta. Você verá
  as mensagens chegarem do app **Captacao** na aba de mensagens diretas do Slack.

> **Prefere receber em um canal** (ex.: `#captacao`) em vez de DM? Crie o canal,
> convide o bot com `/invite @Captacao`, pegue o **ID do canal** (clique no nome
> do canal → no rodapé aparece um ID que começa com `C...`) e use esse ID no
> lugar de `U0895CZ8HU7` na variável `SLACK_TARGET_ID` (Passo 4).

---

## PASSO 3 — Subir o código no GitHub

O Render publica a partir de um repositório no GitHub.

1. Crie uma conta em **https://github.com** (se ainda não tiver).
2. Clique em **New repository**. Nome: `captacao-clientes`. Deixe **Private**
   (recomendado). Não marque nada além disso. **Create repository**.
3. Agora suba os arquivos desta pasta. Duas opções:

   **Opção A — pelo site (mais fácil, sem comandos):**
   - Na página do repositório recém-criado, clique em **uploading an existing file**.
   - Arraste **todos os arquivos e a pasta `public`** desta pasta, **MENOS**:
     - ❌ não suba `node_modules`
     - ❌ não suba `.env` (se existir)
   - Arquivos a subir: `server.js`, `package.json`, `package-lock.json`,
     `render.yaml`, `.gitignore`, `.env.example`, `GUIA-DEPLOY.md` e a pasta
     `public/` inteira (com o `index.html`).
   - Clique em **Commit changes**.

   **Opção B — pelo Git (se você usa terminal):**
   ```bash
   git init
   git add .
   git commit -m "Captação: servidor + Neon + Slack"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/captacao-clientes.git
   git push -u origin main
   ```
   (O `.gitignore` já impede que `node_modules` e `.env` subam.)

---

## PASSO 4 — Publicar no Render (plano grátis)

1. Acesse **https://render.com** e faça login com a sua conta do **GitHub**.
2. Clique em **New +** → **Web Service**.
3. Conecte/autorize o GitHub e selecione o repositório **`captacao-clientes`**.
4. Preencha:
   - **Name:** `captacao-clientes`
   - **Region:** a mais próxima (ex.: Ohio/US East)
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type / Plan:** **Free**
5. Abra **Advanced** (ou role até **Environment Variables**) e adicione **3 variáveis**:

   | Key (nome)        | Value (valor)                                  |
   |-------------------|------------------------------------------------|
   | `DATABASE_URL`    | *(cole a string do Neon — Passo 1)*            |
   | `SLACK_BOT_TOKEN` | *(cole o token `xoxb-...` — Passo 2)*          |
   | `SLACK_TARGET_ID` | `U0895CZ8HU7`                                  |

6. Clique em **Create Web Service**. O Render vai instalar e iniciar (1–3 min).
7. Quando terminar, ele te dá uma URL pública, algo como:
   ```
   https://captacao-clientes.onrender.com
   ```
   Esse é o **link do seu formulário** — é esse que você divulga.

> **Sobre o plano grátis do Render:** depois de ~15 min sem acesso, o serviço
> "dorme". O primeiro acesso depois disso pode demorar ~30–50 segundos para
> carregar (ele "acorda"). Os acessos seguintes ficam rápidos. Para um
> formulário de captação isso costuma ser aceitável.

---

## PASSO 5 — Testar de ponta a ponta

1. Abra a URL do Render no navegador.
2. Preencha o formulário até o fim (use o CEP `57607-202` para testar).
3. Ao concluir, verifique:
   - ✅ Chegou uma **DM no Slack** do app *Captacao* com os dados do cliente.
   - ✅ O registro foi **gravado no Neon**.

### Como ver os dados gravados no Neon
- No painel do Neon, vá em **SQL Editor** e rode:
  ```sql
  SELECT * FROM clientes ORDER BY criado_em DESC;
  ```
  Você verá todos os clientes captados, do mais recente para o mais antigo.

---

## Resolução de problemas

**O formulário diz "Não foi possível enviar agora".**
- O servidor pode estar "acordando" (plano grátis). Espere ~30s e tente de novo.
- Veja os logs no Render: painel do serviço → aba **Logs**.

**Não chega nada no Slack.** Olhe os **Logs** do Render:
- `invalid_auth` → o `SLACK_BOT_TOKEN` está errado/incompleto. Copie de novo o `xoxb-...`.
- `missing_scope` → faltou o scope `chat:write`. Adicione e **reinstale** o app
  (Passo 2.2 e 2.3), pegue o token novo e atualize no Render.
- `channel_not_found` → o `SLACK_TARGET_ID` está errado. Confirme `U0895CZ8HU7`
  (ou o ID do canal, se optou por canal).

**Não grava no banco.** Nos Logs aparece `[ERRO Banco]`:
- Confirme que a `DATABASE_URL` foi colada **inteira** (termina com `?sslmode=require`).
- No Neon, confirme que o projeto está ativo (planos grátis não expiram por uso normal).

**Mudei uma variável no Render e não mudou nada.**
- Após editar variáveis, o Render geralmente faz redeploy. Se não, clique em
  **Manual Deploy → Deploy latest commit**.

---

## Como funciona por dentro (resumo)

- `public/index.html` → o formulário (o que o cliente vê).
- `server.js` → o servidor: serve o formulário e recebe `POST /api/submit`.
  - grava o cliente no Neon (tabela `clientes`);
  - manda a DM no Slack para `SLACK_TARGET_ID`.
- `package.json` / `render.yaml` → dizem ao Render como instalar e rodar.
- `.env.example` → modelo dos segredos (os valores reais vão no Render).

Qualquer alteração no formulário ou no servidor: edite, suba para o GitHub, e o
Render publica a nova versão automaticamente.
