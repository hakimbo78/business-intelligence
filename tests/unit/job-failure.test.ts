import { describe, it, expect } from 'vitest';
import { classifyFailure } from '@/queue/job-failure.js';

describe('Deciding whether to try again', () => {
  it('should not retry an out-of-credit error', () => {
    // The real message, retried three times, each retry holding credit in
    // flight and bringing the next failure closer.
    const error = new Error(
      'OpenRouter API Error: 402 {"error":{"message":"This request would exceed your ' +
        'available credits given your current in-flight requests."}}'
    );

    const failure = classifyFailure(error);
    expect(failure.kind).toBe('PERMANENT');
    expect(failure.code).toBe('AI_CREDIT_EXHAUSTED');
    expect(failure.message).toContain('Isi ulang kredit');
  });

  it('should not retry a rejected key', () => {
    expect(classifyFailure(new Error('401 invalid api key')).kind).toBe('PERMANENT');
    expect(classifyFailure(new Error('API_KEY_IP_ADDRESS_BLOCKED')).code).toBe('MAP_KEY_REJECTED');
  });

  it('should not retry a spending ceiling, which is working as intended', () => {
    const error = new Error('Batas biaya harian terlampaui: sudah US$ 10.10 dari batas US$ 10.00.');
    error.name = 'BudgetExceededError';

    expect(classifyFailure(error).kind).toBe('PERMANENT');
    expect(classifyFailure(error).code).toBe('BUDGET_CEILING');
  });

  it('should retry a rate limit or a timeout, which do pass', () => {
    expect(classifyFailure(new Error('429 rate limit exceeded')).kind).toBe('RETRYABLE');
    expect(classifyFailure(new Error('ETIMEDOUT')).kind).toBe('RETRYABLE');
    expect(classifyFailure(new Error('Overpass returned 504')).kind).toBe('RETRYABLE');
  });

  it('should retry an error it does not recognise', () => {
    // Losing an order to a transient fault costs more than a wasted retry.
    const failure = classifyFailure(new Error('something nobody has seen before'));

    expect(failure.kind).toBe('RETRYABLE');
    expect(failure.code).toBe('UNKNOWN');
  });

  it('should say something the owner can act on, never a stack trace', () => {
    for (const error of [
      new Error('402 requires more credits'),
      new Error('429 rate limit'),
      new Error('mystery'),
    ]) {
      const failure = classifyFailure(error);
      expect(failure.message.length).toBeGreaterThan(40);
      expect(failure.message).not.toContain('Error:');
      // A stack frame, not the Indonesian word "dapat", which ends in "at ".
      expect(failure.message).not.toMatch(/\n\s+at /);
    }
  });

  it('should cope with something thrown that is not an Error', () => {
    expect(classifyFailure('402 requires more credits').code).toBe('AI_CREDIT_EXHAUSTED');
    expect(classifyFailure(null).kind).toBe('RETRYABLE');
  });
});

describe('Failures that come from how the AI is configured', () => {
  it('should not retry a model that cannot serve this endpoint', () => {
    // The real message, after the model was set to a ":batch" variant.
    const error = new Error(
      'OpenRouter API Error: 404 {"error":{"message":"z-ai/glm-5.3-flash:batch cannot be used ' +
        'with the chat/completions endpoint (adapter DeepInfraBatchAdapter)"}}'
    );

    const failure = classifyFailure(error);
    expect(failure.kind).toBe('PERMANENT');
    expect(failure.code).toBe('AI_MODEL_INVALID');
    expect(failure.message).toContain(':batch');
  });

  it('should not retry a model that thinks until its budget is gone', () => {
    const error = new Error(
      'OpenRouter returned no answer: the model spent its whole budget of 4000 tokens reasoning ' +
        '(3980 used) without writing one.'
    );

    const failure = classifyFailure(error);
    expect(failure.kind).toBe('PERMANENT');
    expect(failure.code).toBe('AI_TOKEN_BUDGET');
    expect(failure.message).toContain('OPENROUTER_MAX_TOKENS');
  });
});
