# Arquitetura — Call Platform

## Objetivo

Evoluir o Vapi Call Center para uma plataforma modular, aproveitando regras operacionais já validadas no WAVOIP sem acoplar o produto ao canal WhatsApp.

## Princípio central

A regra de negócio não conhece o canal de discagem. Campanhas, contatos, fila, retry, watchdog, DDM, acordos, auditoria e relatórios dependem de contratos. O canal telefônico é implementado por um provider.

```text
API / Dashboard
      ↓
Application Services
      ↓
Core
├── Campaigns
├── Queue
├── Scheduling
├── Debt
├── Agreements
├── Auditing
└── Reporting
      ↓
Ports
├── DialerProvider
├── DebtProvider
├── NotificationProvider
└── Repositories
      ↓
Adapters
├── VapiPhoneProvider
├── DdmProvider
├── MySQL repositories
└── Webhook handlers
```

## Estrutura alvo

```text
src/
├── api/
│   ├── controllers/
│   ├── middlewares/
│   └── routes/
├── application/
│   ├── campaigns/
│   ├── calls/
│   ├── imports/
│   └── agreements/
├── core/
│   ├── campaigns/
│   ├── calls/
│   ├── queue/
│   └── shared/
├── providers/
│   ├── dialer/
│   ├── debt/
│   └── notifications/
├── infrastructure/
│   ├── database/
│   ├── repositories/
│   ├── queue/
│   └── logging/
├── workers/
└── config/
```

## Componentes aproveitados conceitualmente do WAVOIP

- campanhas e chamadas por campanha;
- limite de concorrência;
- watchdog para chamadas travadas;
- retry e cooldown;
- importação com progresso;
- consulta DDM com rate limit;
- formalização de acordos;
- gravação, transcrição, duração e status;
- autenticação das APIs;
- métricas e exportações.

## Componentes exclusivos por canal

### Vapi telefônico

- `phoneNumberId`;
- chamada PSTN para E.164;
- capacidade por número telefônico;
- eventos da Vapi.

### WAVOIP

- login e dispositivos Wavoip;
- SIP trunk por dispositivo;
- disponibilidade e cooldown de linha;
- round-robin entre dispositivos WhatsApp.

## Estratégia de migração

1. Adicionar contratos e modelos sem alterar o fluxo atual.
2. Consolidar schema e migrations.
3. Encapsular a chamada Vapi em `DialerProvider`.
4. Migrar fila e campanhas para application services.
5. Migrar webhook, DDM e acordos.
6. Migrar rotas e dashboard.
7. Remover implementações antigas somente após testes.

Cada etapa deve entrar por PR pequeno e reversível.