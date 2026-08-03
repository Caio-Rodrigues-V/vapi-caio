# Call Platform — Arquitetura alvo

## Decisão

O sistema seguirá como **monólito modular com processos separados**:

- API HTTP/Passenger;
- dispatcher via Cron;
- watchdog no ciclo do dispatcher;
- MySQL como fonte de verdade e fila transacional;
- providers externos desacoplados por contratos.

## Fluxo

```text
Frontend -> API -> Application Services -> Repositories -> MySQL
Vapi -> Webhook -> Event Handler -> MySQL
Cron -> Campaign Dispatcher -> DialerProvider -> Vapi
```

## Módulos

```text
src/
├── api/                 # controllers, routes e middlewares
├── application/         # casos de uso
├── core/                # contratos e modelos de domínio
├── infrastructure/      # MySQL, migrations e logging
├── providers/           # Vapi, DDM, OpenAI e storage
├── workers/             # dispatcher e futuros event processors
└── config/              # leitura e validação do ambiente
```

## Regras portadas do WAVOIP

- campanhas independentes das chamadas;
- capacidade por campanha e capacidade global;
- reserva concorrente de lote;
- retry exponencial com jitter;
- watchdog para chamadas sem atualização;
- recuperação de locks antigos;
- provider de discagem independente do canal;
- provider DDM independente da fila;
- migrations versionadas.

## Regras de segurança

- nenhum segredo no Git;
- endpoint de migration protegido por token administrativo;
- webhooks idempotentes;
- mudanças destrutivas de banco exigem migration explícita;
- a API não executa lotes longos dentro da requisição.

## Estratégia de migração

A estrutura nova entra de forma aditiva. O worker e as tabelas antigas continuam disponíveis até que:

1. migrations sejam aplicadas no ambiente de desenvolvimento;
2. campanha de teste conclua ponta a ponta;
3. webhook novo atualize `campaign_calls` corretamente;
4. dashboard novo leia o schema consolidado;
5. o fluxo antigo seja removido em PR separado.

## Pontos ainda dependentes de contrato externo

- endpoint, método HTTP, autenticação e formato real da consulta DDM;
- endpoint e payload da formalização de acordo;
- seleção definitiva de `assistantId` e `phoneNumberId` por campanha;
- segredo/assinatura efetivamente enviado pela Vapi no webhook.
