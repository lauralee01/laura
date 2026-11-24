/**
 * Pure helpers for turning browser coordinates into a city-level label.
 * Kept free of I/O so the privacy-sensitive rules are easy to test:
 * - coordinates are rounded (~1.1 km) before anything leaves this process
 * - only a coarse "City, ST" / "City, Country" label is ever returned
 */

export type NormalizedCoordinates = {
  latitude: number;
  longitude: number;
};

/** 2 decimals ≈ 1.1 km: enough to identify a city, not a street. */
const COORDINATE_DECIMALS = 2;

const MAX_LABEL_LENGTH = 100;

/**
 * Validates and rounds coordinates. Returns null for anything that is not a
 * finite lat/lon in range (including numeric strings — the API contract is
 * JSON numbers).
 */
export function normalizeCoordinates(
  latitude: unknown,
  longitude: unknown,
): NormalizedCoordinates | null {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  const factor = 10 ** COORDINATE_DECIMALS;
  return {
    // `+ 0` turns -0 into 0 so cache keys stay stable.
    latitude: Math.round(latitude * factor) / factor + 0,
    longitude: Math.round(longitude * factor) / factor + 0,
  };
}

/** Stable cache key for already-normalized coordinates. */
export function coordinateCacheKey(coords: NormalizedCoordinates): string {
  return `${coords.latitude.toFixed(COORDINATE_DECIMALS)},${coords.longitude.toFixed(COORDINATE_DECIMALS)}`;
}

/** Subset of Nominatim's `address` object that we read. */
export type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  hamlet?: string;
  county?: string;
  state?: string;
  region?: string;
  country?: string;
  country_code?: string;
  'ISO3166-2-lvl4'?: string;
};

function clean(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  // Strip control characters; the label ends up in prompts and search queries.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Builds a short label for search + display:
 * - US: "Boston, MA"
 * - elsewhere: "Lagos, Nigeria"
 * Returns null when the address has no usable place name.
 */
export function buildLocationLabel(
  address: NominatimAddress | null | undefined,
): string | null {
  if (!address || typeof address !== 'object') {
    return null;
  }

  const place =
    clean(address.city) ||
    clean(address.town) ||
    clean(address.village) ||
    clean(address.municipality) ||
    clean(address.hamlet) ||
    clean(address.county);

  const state = clean(address.state) || clean(address.region);
  const country = clean(address.country);
  const isUs = clean(address.country_code).toLowerCase() === 'us';

  let regionPart = '';
  if (isUs) {
    const iso = clean(address['ISO3166-2-lvl4']).match(/^US-([A-Z]{2})$/);
    regionPart = iso ? iso[1] : state;
  } else {
    regionPart = country;
  }

  const label = place
    ? [place, regionPart].filter(Boolean).join(', ')
    : [state, country].filter(Boolean).join(', ');

  if (!label) {
    return null;
  }

  return label.slice(0, MAX_LABEL_LENGTH);
}
