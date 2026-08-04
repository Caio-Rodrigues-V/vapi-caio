# Homologação da Call Platform no cPanel

Este roteiro valida a arquitetura v2 sem substituir imediatamente o fluxo legado.

## 1. Preparação

- Fazer deploy da branch `refactor/call-platform-core` em um ambiente de desenvolvimento.
- Executar `npm ci` na raiz e em `frontend/`, ou usar o mecanismo de instalação do cPanel.
- Executar o build de produção.
- Manter o webhook legado ativo até a conclusão da homologação.

## 2. Variáveis obrigatórias

Configurar no ambiente:

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`, `VAPI_ASSISTANT_ID`
- `VAPI_ASSISTANT_ID_CRUZEIRO`, `VAPI_ASSISTANT_ID_DDM`
- `DDM_BASE_URL`, `DDM_TOKEN_BUSCA`
- `API_AUTH_TOKEN`, `ADMIN_MIGRATION_TOKEN`
- `GLOBAL_MAX_CONCURRENT`, `WORKER_MAX_TRIES`

Nunca registrar tokens reais em screenshots, issues ou commits.

## 3. Migrations

Executar uma única vez:

```http
POST /api/admin/migrations/run
x-admin-token: <ADMIN_MIGRATION_TOKEN>
```

Validar que as migrations `001_call_platform_core.sql` e `002_call_results.sql` aparecem em `schema_migrations`.

## 4. Smoke test das APIs

1. Abrir o dashboard e salvar o `API_AUTH_TOKEN`.
2. Criar uma campanha em estado `draft`.
3. Importar um CSV ou XLSX com apenas 1 a 3 contatos de teste autorizados.
4. Confirmar os registros em `campaign_calls` com status `pending`.
5. Iniciar a campanha.

## 5. Worker

Executar o worker de campanhas pelo Cron:

```bash
npm run worker:campaigns
```

Começar com `GLOBAL_MAX_CONCURRENT=1`.

Validar:

- consulta do CPF no DDM;
- contato sem débito marcado como `skipped`;
- assistant selecionado conforme a instituição;
- `provider_call_id` persistido após o disparo;
- falha temporária agendada como `retry_scheduled`.

## 6. Webhook v2

Configurar temporariamente na Vapi:

```text
https://<dominio>/api/v2/vapi/webhook
```

Validar:

- resposta HTTP 200;
- evento salvo uma única vez em `webhook_events`;
- status atualizado em `campaign_calls`;
- duração, transcrição e gravação registradas em `call_results`;
- decisão classificada;
- callback criado quando a decisão for reagendamento.

## 7. Critérios para merge

O PR só deve sair de Draft quando:

- CI estiver verde;
- migrations rodarem sem erro no MariaDB do cPanel;
- uma campanha pequena completar o fluxo ponta a ponta;
- retry e watchdog forem observados sem duplicar chamadas;
- webhook duplicado não gerar resultado duplicado;
- dashboard refletir os totais do banco;
- rollback estiver definido.

## 8. Rollback

Durante a homologação:

- manter as rotas antigas intactas;
- não apagar tabelas antigas;
- pausar o Cron v2 antes de retornar ao fluxo anterior;
- restaurar o webhook legado na Vapi;
- reverter o deploy para a última versão estável da `main`.
