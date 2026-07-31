# Vapi Call Center

Disparador automático de chamadas com Vapi, Node.js, TypeScript, React e MySQL.

## Requisitos

- Node.js 22 ou superior
- MySQL 8 ou MariaDB compatível
- Aplicação Node.js via Passenger/cPanel

## Desenvolvimento

```bash
npm install
npm run dev
```

O frontend pode ser executado separadamente:

```bash
npm --prefix frontend run dev
```

## Build de produção

```bash
npm ci
```

O `postinstall` instala as dependências do frontend e gera:

- `dist/` para o backend
- `frontend/dist/` para o frontend

O arquivo de entrada do Passenger é:

```text
app.js
```

## Deploy no cPanel

Configuração atual:

```text
Application Path: apps/vapi-call-center
Base Application URL: /vapi
Startup File: app.js
Node.js: 22+
Environment: Production
```

Após atualizar o repositório no cPanel:

1. Execute **Update from Remote** no Git Version Control.
2. Execute **Garantir dependências** na aplicação Node.js.
3. Crie o arquivo `.env` na raiz da aplicação usando `.env.example` como referência.
4. Execute a migração do banco com o script `db:setup` pelo painel, quando disponível.
5. Reinicie a aplicação.
6. Valide `https://grupoddm.ia.br/vapi/api/health`.

## Endpoints

```text
GET  /api/health
GET  /api/calls
POST /api/upload
POST /api/worker/start
POST /api/vapi/webhook
```

O endpoint manual do worker exige o header:

```text
x-worker-token: <WORKER_TRIGGER_TOKEN>
```

## Worker via Cron

Em produção, execute o JavaScript compilado:

```bash
node /home/grpja/apps/vapi-call-center/dist/worker.js
```

A periodicidade recomendada é uma vez por minuto. O worker aplica as regras de horário comercial e concorrência internamente.

## URL do webhook

Na configuração atual:

```text
https://grupoddm.ia.br/vapi/api/vapi/webhook
```

Ao migrar para um subdomínio, ajuste `VITE_BASE_PATH=/`, a URL do webhook e refaça o build.
