const crypto = require('crypto');
const { isSensitiveKey, encryptIfSensitive, decryptIfSensitive } = require('../../src/services/settings-crypto');

describe('isSensitiveKey', () => {
  test.each([
    'llm_api_key', 'gads_client_secret', 'refresh_token',
    'API_KEY', 'Secret_Value', 'TOKEN_VALUE',
  ])('"%s" is sensitive', (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  test.each([
    'llm_provider', 'business_context', 'llm_model',
    'gads_customer_id', 'master_prompt',
  ])('"%s" is not sensitive', (key) => {
    expect(isSensitiveKey(key)).toBe(false);
  });
});

describe('encrypt/decrypt round-trip', () => {
  const ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

  beforeAll(() => {
    process.env.SETTINGS_ENCRYPTION_KEY = ENCRYPTION_KEY;
  });

  afterAll(() => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
  });

  test('round-trip for sensitive key', () => {
    const original = 'sk-test-1234567890';
    const encrypted = encryptIfSensitive('llm_api_key', original);
    expect(encrypted).not.toBe(original);
    expect(encrypted.split(':')).toHaveLength(3);
    const decrypted = decryptIfSensitive('llm_api_key', encrypted);
    expect(decrypted).toBe(original);
  });

  test('non-sensitive key is not encrypted', () => {
    const original = 'gpt-4o-mini';
    const result = encryptIfSensitive('llm_model', original);
    expect(result).toBe(original);
  });

  test('decrypt returns plaintext for non-encrypted value', () => {
    const result = decryptIfSensitive('llm_api_key', 'plain-text-value');
    expect(result).toBe('plain-text-value');
  });

  test('empty value passes through', () => {
    expect(encryptIfSensitive('llm_api_key', '')).toBe('');
    expect(decryptIfSensitive('llm_api_key', '')).toBe('');
  });

  test('each encryption produces different ciphertext (random IV)', () => {
    const val = 'my-secret';
    const a = encryptIfSensitive('llm_api_key', val);
    const b = encryptIfSensitive('llm_api_key', val);
    expect(a).not.toBe(b);
    expect(decryptIfSensitive('llm_api_key', a)).toBe(val);
    expect(decryptIfSensitive('llm_api_key', b)).toBe(val);
  });

  test('handles unicode values', () => {
    const original = 'contraseña-secreta-🔑';
    const encrypted = encryptIfSensitive('refresh_token', original);
    expect(decryptIfSensitive('refresh_token', encrypted)).toBe(original);
  });
});

describe('encrypt/decrypt without encryption key', () => {
  beforeAll(() => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
  });

  test('passes through when no key configured', () => {
    const val = 'sk-test-no-encrypt';
    expect(encryptIfSensitive('llm_api_key', val)).toBe(val);
    expect(decryptIfSensitive('llm_api_key', val)).toBe(val);
  });
});
