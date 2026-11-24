import {
  buildLocationLabel,
  coordinateCacheKey,
  normalizeCoordinates,
} from './reverse-geocode.util';

describe('normalizeCoordinates', () => {
  it('rounds to ~1 km (2 decimals)', () => {
    expect(normalizeCoordinates(42.360123, -71.058891)).toEqual({
      latitude: 42.36,
      longitude: -71.06,
    });
  });

  it('normalizes negative zero', () => {
    const result = normalizeCoordinates(-0.001, 0.004);
    expect(Object.is(result?.latitude, 0)).toBe(true);
    expect(Object.is(result?.longitude, 0)).toBe(true);
  });

  it.each([
    ['string lat', '42.3', -71],
    ['string lon', 42.3, '-71'],
    ['NaN', Number.NaN, 0],
    ['Infinity', 0, Number.POSITIVE_INFINITY],
    ['lat out of range', 91, 0],
    ['lon out of range', 0, -181],
    ['null', null, null],
    ['undefined', undefined, undefined],
  ])('rejects %s', (_name, lat, lon) => {
    expect(normalizeCoordinates(lat, lon)).toBeNull();
  });

  it('accepts the exact bounds', () => {
    expect(normalizeCoordinates(90, 180)).toEqual({
      latitude: 90,
      longitude: 180,
    });
    expect(normalizeCoordinates(-90, -180)).toEqual({
      latitude: -90,
      longitude: -180,
    });
  });
});

describe('coordinateCacheKey', () => {
  it('is stable for nearby points that round to the same cell', () => {
    const a = normalizeCoordinates(42.3601, -71.0589)!;
    const b = normalizeCoordinates(42.3649, -71.0551)!;
    expect(coordinateCacheKey(a)).toBe(coordinateCacheKey(b));
  });
});

describe('buildLocationLabel', () => {
  it('uses "City, ST" in the US', () => {
    expect(
      buildLocationLabel({
        city: 'Boston',
        state: 'Massachusetts',
        country: 'United States',
        country_code: 'us',
        'ISO3166-2-lvl4': 'US-MA',
      }),
    ).toBe('Boston, MA');
  });

  it('falls back to the state name if the US ISO code is missing', () => {
    expect(
      buildLocationLabel({
        city: 'Austin',
        state: 'Texas',
        country_code: 'us',
      }),
    ).toBe('Austin, Texas');
  });

  it('uses "City, Country" outside the US', () => {
    expect(
      buildLocationLabel({
        city: 'Lagos',
        state: 'Lagos State',
        country: 'Nigeria',
        country_code: 'ng',
      }),
    ).toBe('Lagos, Nigeria');
  });

  it('falls back through town, village and county', () => {
    expect(
      buildLocationLabel({ town: 'Smalltown', country: 'Canada' }),
    ).toBe('Smalltown, Canada');
    expect(
      buildLocationLabel({ village: 'Tinyville', country: 'France' }),
    ).toBe('Tinyville, France');
    expect(
      buildLocationLabel({ county: 'Some County', country: 'Ireland' }),
    ).toBe('Some County, Ireland');
  });

  it('uses state + country when there is no place name', () => {
    expect(
      buildLocationLabel({ state: 'Nunavut', country: 'Canada' }),
    ).toBe('Nunavut, Canada');
  });

  it('never includes street-level fields', () => {
    const label = buildLocationLabel({
      city: 'Boston',
      country_code: 'us',
      'ISO3166-2-lvl4': 'US-MA',
      ...({ road: 'Beacon St', house_number: '12' } as object),
    });
    expect(label).toBe('Boston, MA');
  });

  it('strips control characters and caps length', () => {
    const label = buildLocationLabel({
      city: `Bad\nCity${'x'.repeat(200)}`,
      country: 'Nowhere',
    });
    expect(label).not.toMatch(/[\n\r]/);
    expect(label!.length).toBeLessThanOrEqual(100);
  });

  it('returns null with nothing usable', () => {
    expect(buildLocationLabel({})).toBeNull();
    expect(buildLocationLabel(null)).toBeNull();
    expect(buildLocationLabel(undefined)).toBeNull();
  });
});
