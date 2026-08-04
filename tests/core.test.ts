import assert from 'node:assert/strict';
import test from 'node:test';
import { AssistantResolver } from '../src/application/campaigns/AssistantResolver';
import { RetryPolicy } from '../src/application/campaigns/RetryPolicy';
import { normalizePhone } from '../src/utils/phoneValidator';

test('AssistantResolver retorna o assistant configurado para UVA', () => {
  const resolver = new AssistantResolver({ uvaAssistantId: 'assistant-uva' });

  assert.equal(resolver.resolve(), 'assistant-uva');
});

test('AssistantResolver exige o assistant UVA', () => {
  assert.throws(
    () => new AssistantResolver({ uvaAssistantId: '' }),
    /VAPI_ASSISTANT_ID_UVA não configurado/,
  );
});

test('RetryPolicy aplica backoff exponencial e respeita o limite', () => {
  const policy = new RetryPolicy({
    baseDelayMs: 1_000,
    maxDelayMs: 4_000,
    jitterRatio: 0,
  });
  const now = Date.UTC(2026, 7, 3, 12, 0, 0);

  assert.equal(policy.nextAttempt(0, now).getTime(), now + 1_000);
  assert.equal(policy.nextAttempt(1, now).getTime(), now + 2_000);
  assert.equal(policy.nextAttempt(2, now).getTime(), now + 4_000);
  assert.equal(policy.nextAttempt(10, now).getTime(), now + 4_000);
});

test('normalizePhone aceita celular brasileiro com código do país', () => {
  assert.equal(normalizePhone('5521984354821'), '+5521984354821');
});

test('normalizePhone aceita telefone em notação científica do Excel', () => {
  assert.equal(normalizePhone('5.521984354821E+12'), '+5521984354821');
  assert.equal(normalizePhone('5,521984354821E+12'), '+5521984354821');
});

test('normalizePhone rejeita DDD e tamanho inválidos', () => {
  assert.equal(normalizePhone('5500984354821'), null);
  assert.equal(normalizePhone('12345'), null);
});
