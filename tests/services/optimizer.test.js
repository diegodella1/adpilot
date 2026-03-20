const { evaluateCondition, formatRecommendation, summarize } = require('../../src/services/optimizer');

describe('evaluateCondition', () => {
  const baseSummary = {
    campaign_status: 'ENABLED',
    spend_7d_micros: 100_000_000, // $100
    cpa_7d_micros: 10_000_000,    // $10
    ctr_7d: 0.035,                // 3.5%
    conversions_7d: 10,
    roas_7d: 2.5,
  };

  test('> operator with micros (auto-converts)', () => {
    expect(evaluateCondition(
      { metric: 'cpa_7d_micros', operator: '>', value: 5 },
      baseSummary,
    )).toBe(true); // $10 > $5
  });

  test('< operator', () => {
    expect(evaluateCondition(
      { metric: 'ctr_7d', operator: '<', value: 0.02 },
      baseSummary,
    )).toBe(false); // 0.035 < 0.02 → false
  });

  test('>= operator', () => {
    expect(evaluateCondition(
      { metric: 'conversions_7d', operator: '>=', value: 10 },
      baseSummary,
    )).toBe(true);
  });

  test('<= operator', () => {
    expect(evaluateCondition(
      { metric: 'roas_7d', operator: '<=', value: 2.5 },
      baseSummary,
    )).toBe(true);
  });

  test('== operator', () => {
    expect(evaluateCondition(
      { metric: 'conversions_7d', operator: '==', value: 10 },
      baseSummary,
    )).toBe(true);
  });

  test('unknown operator returns false', () => {
    expect(evaluateCondition(
      { metric: 'conversions_7d', operator: '!=', value: 10 },
      baseSummary,
    )).toBe(false);
  });

  test('skips disabled campaigns (campaign scope)', () => {
    expect(evaluateCondition(
      { metric: 'ctr_7d', operator: '<', value: 1 },
      { ...baseSummary, campaign_status: 'PAUSED' },
    )).toBe(false);
  });

  test('NaN metric returns false', () => {
    expect(evaluateCondition(
      { metric: 'nonexistent', operator: '>', value: 0 },
      baseSummary,
    )).toBe(false);
  });

  test('non-campaign scope ignores status', () => {
    expect(evaluateCondition(
      { metric: 'ctr_7d', operator: '<', value: 1, scope: 'ad_group' },
      { ...baseSummary, campaign_status: 'PAUSED' },
    )).toBe(true);
  });
});

describe('formatRecommendation', () => {
  test('formats recommendation with campaign data', () => {
    const rule = { name: 'High CPA', action: { type: 'pause_campaign' } };
    const summary = {
      campaign_name: 'Test Campaign',
      spend_7d_micros: 100_000_000,
      cpa_7d_micros: 15_000_000,
      ctr_7d: 0.025,
      conversions_7d: 7,
    };
    const result = formatRecommendation(rule, summary);
    expect(result).toContain('High CPA');
    expect(result).toContain('Test Campaign');
    expect(result).toContain('$100.00');
    expect(result).toContain('$15.00');
    expect(result).toContain('2.50%');
    expect(result).toContain('pause_campaign');
  });
});

describe('summarize', () => {
  test('converts micros to dollars', () => {
    const summary = {
      spend_7d_micros: 50_000_000,
      cpa_7d_micros: 5_000_000,
      ctr_7d: 0.03,
      conversions_7d: 10,
      roas_7d: 3.2,
    };
    const result = summarize(summary);
    expect(result).toEqual({
      spend_7d: 50,
      cpa_7d: 5,
      ctr_7d: 0.03,
      conversions_7d: 10,
      roas_7d: 3.2,
    });
  });
});
