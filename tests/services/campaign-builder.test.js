const { validateDraft } = require('../../src/services/campaign-builder');

function validDraft(overrides = {}) {
  return {
    campaign: {
      name: 'Test Campaign',
      type: 'SEARCH',
      budget_micros: 50_000_000,
      geo_targets: ['AR'],
      ...overrides.campaign,
    },
    ad_groups: overrides.ad_groups || [{
      name: 'AG1',
      keywords: [{ text: 'test', match_type: 'BROAD' }],
      ads: [{
        type: 'RESPONSIVE_SEARCH_AD',
        headlines: ['Headline 1', 'Headline 2', 'Headline 3'],
        descriptions: ['Description one here', 'Description two here'],
        final_url: 'https://example.com',
      }],
    }],
  };
}

describe('validateDraft', () => {
  test('valid draft returns no errors', () => {
    expect(validateDraft(validDraft())).toEqual([]);
  });

  test('null draft reports missing campaign', () => {
    const errors = validateDraft(null);
    expect(errors).toContainEqual(expect.stringContaining('Falta el objeto'));
  });

  test('missing campaign name', () => {
    const errors = validateDraft(validDraft({ campaign: { name: '' } }));
    expect(errors).toContainEqual(expect.stringContaining('nombre'));
  });

  test('missing campaign type', () => {
    const errors = validateDraft(validDraft({ campaign: { type: '' } }));
    expect(errors).toContainEqual(expect.stringContaining('tipo'));
  });

  test('zero budget', () => {
    const errors = validateDraft(validDraft({ campaign: { budget_micros: 0 } }));
    expect(errors).toContainEqual(expect.stringContaining('Budget inválido'));
  });

  test('negative budget', () => {
    const errors = validateDraft(validDraft({ campaign: { budget_micros: -100 } }));
    expect(errors).toContainEqual(expect.stringContaining('Budget inválido'));
  });

  test('budget exceeds max ($500)', () => {
    const errors = validateDraft(validDraft({ campaign: { budget_micros: 600_000_000 } }));
    expect(errors).toContainEqual(expect.stringContaining('máximo'));
  });

  test('budget at max ($500) is valid', () => {
    const errors = validateDraft(validDraft({ campaign: { budget_micros: 500_000_000 } }));
    expect(errors).toEqual([]);
  });

  test('no ad groups', () => {
    const errors = validateDraft(validDraft({ ad_groups: [] }));
    expect(errors).toContainEqual(expect.stringContaining('al menos un ad group'));
  });

  test('too many ad groups (>20)', () => {
    const groups = Array.from({ length: 21 }, (_, i) => ({
      name: `AG${i}`, ads: [{ type: 'TEXT' }],
    }));
    const errors = validateDraft(validDraft({ ad_groups: groups }));
    expect(errors).toContainEqual(expect.stringContaining('Máximo 20'));
  });

  test('ad group without name', () => {
    const errors = validateDraft(validDraft({
      ad_groups: [{ name: '', ads: [{ type: 'TEXT' }] }],
    }));
    expect(errors).toContainEqual(expect.stringContaining('sin nombre'));
  });

  test('too many keywords (>50)', () => {
    const kws = Array.from({ length: 51 }, (_, i) => ({ text: `kw${i}`, match_type: 'BROAD' }));
    const errors = validateDraft(validDraft({
      ad_groups: [{ name: 'AG1', keywords: kws, ads: [{ type: 'TEXT' }] }],
    }));
    expect(errors).toContainEqual(expect.stringContaining('excede 50'));
  });

  test('RSA ad with <3 headlines', () => {
    const errors = validateDraft(validDraft({
      ad_groups: [{
        name: 'AG1',
        ads: [{
          type: 'RESPONSIVE_SEARCH_AD',
          headlines: ['H1', 'H2'],
          descriptions: ['D1', 'D2'],
          final_url: 'https://example.com',
        }],
      }],
    }));
    expect(errors).toContainEqual(expect.stringContaining('al menos 3 headlines'));
  });

  test('RSA ad with <2 descriptions', () => {
    const errors = validateDraft(validDraft({
      ad_groups: [{
        name: 'AG1',
        ads: [{
          type: 'RESPONSIVE_SEARCH_AD',
          headlines: ['H1', 'H2', 'H3'],
          descriptions: ['D1'],
          final_url: 'https://example.com',
        }],
      }],
    }));
    expect(errors).toContainEqual(expect.stringContaining('al menos 2 descriptions'));
  });

  test('RSA ad with invalid URL', () => {
    const errors = validateDraft(validDraft({
      ad_groups: [{
        name: 'AG1',
        ads: [{
          type: 'RESPONSIVE_SEARCH_AD',
          headlines: ['H1', 'H2', 'H3'],
          descriptions: ['D1', 'D2'],
          final_url: 'not-a-url',
        }],
      }],
    }));
    expect(errors).toContainEqual(expect.stringContaining('URL inválida'));
  });

  test('RSA ad with headline >30 chars', () => {
    const errors = validateDraft(validDraft({
      ad_groups: [{
        name: 'AG1',
        ads: [{
          type: 'RESPONSIVE_SEARCH_AD',
          headlines: ['H1', 'H2', 'This headline is way too long for thirty characters limit'],
          descriptions: ['D1', 'D2'],
          final_url: 'https://example.com',
        }],
      }],
    }));
    expect(errors).toContainEqual(expect.stringContaining('excede 30 chars'));
  });

  test('RSA ad with description >90 chars', () => {
    const longDesc = 'A'.repeat(91);
    const errors = validateDraft(validDraft({
      ad_groups: [{
        name: 'AG1',
        ads: [{
          type: 'RESPONSIVE_SEARCH_AD',
          headlines: ['H1', 'H2', 'H3'],
          descriptions: [longDesc, 'D2'],
          final_url: 'https://example.com',
        }],
      }],
    }));
    expect(errors).toContainEqual(expect.stringContaining('excede 90 chars'));
  });

  test('geo_targets with invalid type', () => {
    const errors = validateDraft(validDraft({
      campaign: { geo_targets: [true] },
    }));
    expect(errors).toContainEqual(expect.stringContaining('geo_target inválido'));
  });

  test('geo_targets accepts strings and numbers', () => {
    const errors = validateDraft(validDraft({
      campaign: { geo_targets: ['US', 1023191] },
    }));
    expect(errors).toEqual([]);
  });
});
