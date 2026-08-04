import assert from 'node:assert/strict';
import test from 'node:test';
import { AssistantResolver } from '../src/application/campaigns/AssistantResolver';
import { RetryPolicy } from '../src/application/campaigns/RetryPolicy';

test('AssistantResolver seleciona agente Cruzeiro por instituição', () => {
  const resolver = new AssistantResolver({
    defaultAssistantId: 'default',
    cruzeiroAssistantId: 'cruzeiro',
    ddmAssistantId: 'ddm',
  });

  assert.equal(resolver.resolve('Universidade Cruzeiro do Sul'), 'cruzeiro');
  assert.equal(resolver.resolve('Carteira DDM'), 'ddm');
  assert.equal(resolver.resolve(null), 'ddm');
});

test('AssistantResolver usa fallback quando agente específico não existe', () => {
  const resolver = new AssistantResolver({ defaultAssistantId: 'default' });

  assert.equal(resolver.resolve('Cruzeiro'), 'default');
  assert.equal(resolver.resolve('DDM'), 'default');
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
