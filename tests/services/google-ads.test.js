const { getGeoId, getLangId } = require('../../src/services/google-ads');

describe('getGeoId', () => {
  test('returns correct ID for common countries', () => {
    expect(getGeoId('AR')).toBe(2032);
    expect(getGeoId('US')).toBe(2840);
    expect(getGeoId('BR')).toBe(2076);
    expect(getGeoId('MX')).toBe(2484);
    expect(getGeoId('ES')).toBe(2724);
    expect(getGeoId('GB')).toBe(2826);
  });

  test('case insensitive', () => {
    expect(getGeoId('ar')).toBe(2032);
    expect(getGeoId('us')).toBe(2840);
  });

  test('passes through numeric IDs', () => {
    expect(getGeoId(1023191)).toBe(1023191);
    expect(getGeoId(9999)).toBe(9999);
  });

  test('throws for unknown country code', () => {
    expect(() => getGeoId('XX')).toThrow('not supported');
    expect(() => getGeoId('ZZ')).toThrow('not supported');
  });

  test('LATAM countries all mapped', () => {
    const latam = ['AR', 'BR', 'MX', 'CL', 'CO', 'PE', 'UY', 'PY', 'BO', 'EC', 'VE', 'CR', 'PA', 'GT', 'DO', 'HN', 'SV', 'NI', 'CU', 'PR'];
    for (const code of latam) {
      expect(typeof getGeoId(code)).toBe('number');
    }
  });
});

describe('getLangId', () => {
  test('returns correct ID for common languages', () => {
    expect(getLangId('es')).toBe(1003);
    expect(getLangId('en')).toBe(1000);
    expect(getLangId('pt')).toBe(1014);
    expect(getLangId('fr')).toBe(1002);
    expect(getLangId('de')).toBe(1001);
  });

  test('case insensitive', () => {
    expect(getLangId('ES')).toBe(1003);
    expect(getLangId('En')).toBe(1000);
  });

  test('throws for unknown language', () => {
    expect(() => getLangId('xx')).toThrow('not supported');
  });

  test('Asian languages mapped', () => {
    expect(getLangId('ja')).toBe(1005);
    expect(getLangId('ko')).toBe(1012);
    expect(getLangId('zh')).toBe(1017);
  });
});
