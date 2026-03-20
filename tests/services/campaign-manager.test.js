const { buildUtmUrl } = require('../../src/services/campaign-manager');

describe('buildUtmUrl', () => {
  test('adds all UTM params', () => {
    const url = buildUtmUrl('https://example.com', {
      source: 'google', medium: 'cpc', campaign: 'test',
      content: 'ad_a', term: '{keyword}',
    });
    expect(url).toContain('utm_source=google');
    expect(url).toContain('utm_medium=cpc');
    expect(url).toContain('utm_campaign=test');
    expect(url).toContain('utm_content=ad_a');
    expect(url).toContain('utm_term=%7Bkeyword%7D');
  });

  test('skips undefined params', () => {
    const url = buildUtmUrl('https://example.com', { source: 'google' });
    expect(url).toContain('utm_source=google');
    expect(url).not.toContain('utm_medium');
    expect(url).not.toContain('utm_campaign');
  });

  test('preserves existing URL path', () => {
    const url = buildUtmUrl('https://example.com/landing/page', { source: 'google' });
    expect(url).toContain('/landing/page');
  });

  test('handles URL with existing query params', () => {
    const url = buildUtmUrl('https://example.com?existing=1', { source: 'google' });
    expect(url).toContain('existing=1');
    expect(url).toContain('utm_source=google');
  });

  test('throws on invalid URL', () => {
    expect(() => buildUtmUrl('not-a-url', { source: 'google' })).toThrow();
  });
});
