const { detectUserConfirmation, extractCampaignJson, sanitizeInput, detectStateTransition } = require('../../src/services/llm');

describe('detectUserConfirmation', () => {
  test.each([
    'dale', 'Dale!', 'mandalo', 'ejecuta', 'ejecutalo',
    'creala', 'aprobado', 'confirmo', 'ok dale',
    'si dale', 'listo', 'mandate', 'go',
    'approve', 'confirm', 'create it', 'send it',
  ])('detects "%s" as confirmation', (phrase) => {
    expect(detectUserConfirmation(phrase)).toBe(true);
  });

  test.each([
    'no', 'cambiá el budget', 'esperá', 'todavía no',
    'quiero revisar', 'hmm', '',
  ])('rejects "%s" as non-confirmation', (phrase) => {
    expect(detectUserConfirmation(phrase)).toBe(false);
  });

  test('case insensitive', () => {
    expect(detectUserConfirmation('DALE')).toBe(true);
    expect(detectUserConfirmation('GoGo')).toBe(true);
  });

  test('trims whitespace', () => {
    expect(detectUserConfirmation('  listo  ')).toBe(true);
  });
});

describe('extractCampaignJson', () => {
  test('extracts valid JSON from code block', () => {
    const msg = 'Acá va la campaña:\n```json\n{"campaign":{"name":"Test"}}\n```\n¿Qué te parece?';
    expect(extractCampaignJson(msg)).toEqual({ campaign: { name: 'Test' } });
  });

  test('returns null without code block', () => {
    expect(extractCampaignJson('No hay JSON acá')).toBeNull();
  });

  test('returns null for invalid JSON in code block', () => {
    expect(extractCampaignJson('```json\n{invalid}\n```')).toBeNull();
  });

  test('extracts nested JSON', () => {
    const json = { campaign: { name: 'X', budget_micros: 50000000 }, ad_groups: [{ name: 'AG1' }] };
    const msg = `\`\`\`json\n${JSON.stringify(json)}\n\`\`\``;
    expect(extractCampaignJson(msg)).toEqual(json);
  });
});

describe('sanitizeInput', () => {
  test('trims whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });

  test('returns empty string for non-string', () => {
    expect(sanitizeInput(null)).toBe('');
    expect(sanitizeInput(42)).toBe('');
    expect(sanitizeInput(undefined)).toBe('');
  });

  test('truncates to 8000 chars', () => {
    const long = 'a'.repeat(9000);
    expect(sanitizeInput(long).length).toBe(8000);
  });

  test('passes normal input through', () => {
    expect(sanitizeInput('Creá una campaña de búsqueda')).toBe('Creá una campaña de búsqueda');
  });
});

describe('detectStateTransition', () => {
  test('intake + JSON → reviewing', () => {
    expect(detectStateTransition('```json\n{}\n```', 'intake')).toBe('reviewing');
  });

  test('intake + no JSON → clarifying', () => {
    expect(detectStateTransition('Tell me more about your campaign', 'intake')).toBe('clarifying');
  });

  test('clarifying + JSON → reviewing', () => {
    expect(detectStateTransition('Here is your draft:\n```json\n{}\n```', 'clarifying')).toBe('reviewing');
  });

  test('clarifying + no JSON → clarifying', () => {
    expect(detectStateTransition('What is your budget?', 'clarifying')).toBe('clarifying');
  });

  test('reviewing stays reviewing', () => {
    expect(detectStateTransition('Updated draft', 'reviewing')).toBe('reviewing');
  });

  test('other states passthrough', () => {
    expect(detectStateTransition('anything', 'done')).toBe('done');
    expect(detectStateTransition('anything', 'error')).toBe('error');
    expect(detectStateTransition('anything', 'executing')).toBe('executing');
  });
});
