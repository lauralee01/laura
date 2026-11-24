import { ReverseGeocodeService } from './reverse-geocode.service';

type FetchMock = jest.Mock<Promise<Partial<Response>>, [URL | string, RequestInit?]>;

function okResponse(address: Record<string, string>): Partial<Response> {
  return { ok: true, status: 200, json: async () => ({ address }) };
}

describe('ReverseGeocodeService', () => {
  const realFetch = global.fetch;
  let fetchMock: FetchMock;
  let service: ReverseGeocodeService;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    service = new ReverseGeocodeService();
    // Skip the 1.1s politeness delay in tests.
    (service as unknown as { minIntervalMs: number }).minIntervalMs = 0;
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = realFetch;
    warnSpy.mockRestore();
  });

  it('returns a city label and sends only rounded coordinates upstream', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        city: 'Boston',
        country_code: 'us',
        'ISO3166-2-lvl4': 'US-MA',
      }),
    );

    await expect(service.reverse(42.360123, -71.058891)).resolves.toBe(
      'Boston, MA',
    );

    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.searchParams.get('lat')).toBe('42.36');
    expect(url.searchParams.get('lon')).toBe('-71.06');
    expect(url.searchParams.get('zoom')).toBe('10');
  });

  it('caches by rounded coordinates', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ city: 'Boston', country_code: 'us', 'ISO3166-2-lvl4': 'US-MA' }),
    );

    await service.reverse(42.3601, -71.0589);
    await service.reverse(42.3649, -71.0551);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null for invalid input without calling upstream', async () => {
    await expect(service.reverse(Number.NaN, 0)).resolves.toBeNull();
    await expect(service.reverse(0, 500)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null on upstream errors and never logs coordinates', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });

    await expect(service.reverse(42.36, -71.06)).resolves.toBeNull();

    const logged = JSON.stringify(warnSpy.mock.calls);
    expect(logged).not.toContain('42.36');
    expect(logged).not.toContain('71.06');
  });

  it('returns null when the request throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down 42.36,-71.06'));

    await expect(service.reverse(42.36, -71.06)).resolves.toBeNull();

    const logged = JSON.stringify(warnSpy.mock.calls);
    expect(logged).not.toContain('42.36');
  });

  it('returns null when upstream reports an error body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ error: 'Unable to geocode' }),
    });

    await expect(service.reverse(0, 0)).resolves.toBeNull();
  });

  it('does not cache failures', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    fetchMock.mockResolvedValueOnce(
      okResponse({ city: 'Paris', country: 'France', country_code: 'fr' }),
    );

    await expect(service.reverse(48.85, 2.35)).resolves.toBeNull();
    await expect(service.reverse(48.85, 2.35)).resolves.toBe('Paris, France');
  });
});
