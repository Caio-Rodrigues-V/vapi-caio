# Banco de dados

Esta pasta será a fonte de verdade do schema da Call Platform.

## Convenção

```text
database/
├── schema.sql
└── migrations/
    ├── 001_initial.sql
    ├── 002_campaigns.sql
    └── ...
```

## Modelo consolidado planejado

- `contacts`: pessoa, CPF e dados normalizados;
- `contact_phones`: múltiplos telefones por contato;
- `campaigns`: configuração e estado da campanha;
- `campaign_calls`: fila e execução de cada chamada;
- `call_events`: eventos idempotentes recebidos do provider;
- `call_results`: duração, gravação, transcrição e classificação;
- `agreements`: formalizações e acompanhamento;
- `audit_logs`: ações operacionais e administrativas.

## Compatibilidade com o schema atual

| Atual | Destino |
|---|---|
| `fila_disparo` | `campaign_calls` |
| `eventos_webhook` | `call_events` |
| `auditoria_chamadas` | `call_results` |

A migração deve ser incremental. Nenhuma tabela existente será apagada até que dados e rotas tenham sido validados no novo modelo.

## Regras

1. migrations são idempotentes quando tecnicamente possível;
2. nenhuma migration roda automaticamente no startup;
3. alterações destrutivas exigem backup e migration separada;
4. índices devem acompanhar consultas reais do worker e dashboard;
5. DEV e PROD usam bancos distintos.