# Guia de Alinhamento: Agente de Voz Vapi & Backend Node.js

Este documento serve como referência técnica para configurar o agente de voz (ex: Júlia) no painel da **Vapi AI**, alinhando-o perfeitamente com os endpoints de ferramentas (Tool Calls) e variáveis injetadas pelo nosso backend.

---

## 1. Variáveis Disponíveis no Prompt (Variables)

Quando a plataforma dispara uma ligação, ela injeta automaticamente as seguintes variáveis de preenchimento (`variableValues`) com base nos dados do devedor consultados no DDM. Você pode utilizá-las no seu prompt do sistema Vapi usando a sintaxe de chaves duplas: `{{variavel}}`.

| Variável | Descrição | Exemplo de Uso no Prompt |
| :--- | :--- | :--- |
| `{{instituicao}}` | Nome da instituição credora onde está a dívida. | *"Olá, falo em nome da {{instituicao}}..."* |
| `{{Valorcpf}}` | O CPF completo do devedor (11 dígitos). | *(Usado principalmente no parâmetro da ferramenta de CPF)* |
| `{{ValorNominal}}` | O valor original da dívida formatado (BRL). | *"Sua pendência original é de {{ValorNominal}}..."* |
| `{{ValorFinalAVista}}` | O valor com desconto para quitação à vista (BRL). | *"Conseguimos uma oferta para quitar à vista por {{ValorFinalAVista}}."* |
| `{{PrimeiroVencimento}}` | A data de vencimento da primeira parcela do acordo. | *"Com o primeiro vencimento para o dia {{PrimeiroVencimento}}."* |

---

## 2. Ferramenta Customizada: `capturar_cpf`

Esta ferramenta serve para verificar a identidade do cliente de forma segura, solicitando apenas os **3 primeiros dígitos do CPF**.

### Configuração no Painel do Vapi (Custom Tool)
No painel da Vapi, em **Tools**, crie uma nova ferramenta com as configurações abaixo:

* **Name**: `capturar_cpf`
* **Description**: `Solicita e valida os 3 primeiros dígitos do CPF do cliente para confirmação de identidade.`
* **Server URL**: *(Deixe em branco ou aponte para a URL do seu webhook se configurado de forma isolada. O padrão é usar o webhook principal da Vapi para responder).*
* **Parameters (JSON Schema)**:
```json
{
  "type": "object",
  "properties": {
    "cpf_esperado": {
      "type": "string",
      "description": "O CPF de 11 dígitos do cliente. Preencha sempre com a variável {{Valorcpf}}."
    },
    "cpf_prefixo3": {
      "type": "string",
      "description": "Os 3 primeiros dígitos informados ou falados pelo cliente (ex: 123)."
    },
    "rawTranscript": {
      "type": "string",
      "description": "A transcrição da fala exata onde o cliente disse os dígitos do CPF (caso o assistente não consiga isolar os números)."
    }
  },
  "required": ["cpf_esperado"]
}
```

### Instrução no Prompt do Agente
Adicione o seguinte fluxo no prompt do seu assistente:
> *"Antes de passar detalhes do valor, preciso confirmar sua identidade por segurança. Por favor, me informe apenas os **três primeiros dígitos do seu CPF**.*
> *Quando o cliente responder, **chame a ferramenta `capturar_cpf`** passando `cpf_esperado` como `{{Valorcpf}}` e o que ele falou no parâmetro `rawTranscript` ou `cpf_prefixo3`.*
> *Se o retorno da ferramenta for `confere: true`, continue com a negociação. Se for `confere: false`, peça educadamente para o cliente repetir os 3 primeiros dígitos. Se falhar novamente, encerre a ligação informando a falha de segurança."*

---

## 3. Ferramenta Customizada: `voicemail_tool`

Esta ferramenta ajuda a reduzir custos desligando a chamada assim que uma caixa postal (secretária eletrônica) for detectada.

### Configuração no Painel do Vapi (Custom Tool)
* **Name**: `voicemail_tool`
* **Description**: `Acionada imediatamente se a chamada cair em caixa postal ou secretária eletrônica para encerrar o disparo.`
* **Parameters (JSON Schema)**:
```json
{
  "type": "object",
  "properties": {
    "detected": {
      "type": "boolean",
      "description": "Marque como true caso caixa postal seja identificada."
    }
  },
  "required": ["detected"]
}
```

### Configuração de Answering Machine Detection (AMD) na Vapi
* No painel da Vapi, ative o recurso de **Answering Machine Detection (AMD)**.
* Configure-o para que, ao detectar "caixa postal" (machine/voicemail), o assistente chame a ferramenta `voicemail_tool`.
* O backend retornará uma diretiva de encerramento imediato, desligando a chamada.

---

## 4. Alinhamento de Respostas para Classificação (Pós-Ligação)

O backend analisa a transcrição completa usando inteligência artificial para categorizar o resultado. Para garantir 100% de acerto nas classificações de auditoria, oriente o seu agente a conduzir a conversa para finalizar com clareza em um dos três cenários abaixo:

1. **Formaliza (Acordo Fechado)**:
   * **O que o cliente precisa dizer:** O agente deve obter um "Sim" ou confirmação explícita de que aceita a proposta (ex: *"Aceito a proposta de R$ X à vista"*, *"Fechado, pode me mandar o boleto"*).
2. **Agendar (Ligar Mais Tarde)**:
   * **O que o cliente precisa dizer:** O cliente pede para ligar de volta em outra hora/dia (ex: *"Pode me ligar amanhã às 14h?"*, *"Estou no trabalho, me liga mais tarde"*).
   * **Extração de Data:** O robô do backend tentará calcular a data de retorno a partir dessa fala. Se o cliente disser *"amanhã de tarde"*, o backend agendará para o dia seguinte no período da tarde automaticamente.
3. **Zero (Sem Retorno Útil / Recusa)**:
   * Casos em que o cliente desliga, diz que não reconhece a dívida, se recusa a pagar ou a ligação cai na caixa postal.
