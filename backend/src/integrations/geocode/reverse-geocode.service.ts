import { Injectable } from '@nestjs/common';
import {
  buildLocationLabel,
  coordinateCacheKey,
  normalizeCoordinates,
  type NominatimAddress,
} from './reverse-geocode.util';

const DEFAULT_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const DEFAULT_USER_AGENT = 'Laura-personal-assistant/1.0';

const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
/** Nominatim's public usage policy: at most 1 request per second. */
const DEFAULT_MIN_INTERVAL_MS = 1_100;
/** Beyond this many queued lookups we fail fast instead of piling up. */
const MAX_WAITING = 5;

type NominatimReverseResponse = {
  address?: NominatimAddress;
  error?: unknown;
};

type CacheEntry = { label: string; expiresAt: number };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Coordinates -> coarse city label ("Boston, MA").
 *
 * Privacy rules (do not loosen without updating the Privacy Policy):
 * - coordinates are rounded to ~1 km before the upstream request
 * - coordinates are never logged and never stored; only the label is returned
 * - results are cached by rounded coordinates
 *
 * Provider: OpenStreetMap Nominatim (no API key). The public instance is meant
 * for light use — for production volume point REVERSE_GEOCODE_URL at a hosted
 * or self-hosted Nominatim-compatible endpoint.
 */
@Injectable()
export class ReverseGeocodeService {
  private readonly cache = new Map<string, CacheEntry>();
  private queue: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;
  private waiting = 0;

  /** Overridable in tests. */
  protected minIntervalMs = DEFAULT_MIN_INTERVAL_MS;

  async reverse(
    latitude: number,
    longitude: number,
  ): Promise<string | null> {
    const coords = normalizeCoordinates(latitude, longitude);
    if (!coords) {
      return null;
    }

    const key = coordinateCacheKey(coords);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.label;
    }

    if (this.waiting >= MAX_WAITING) {
      return null;
    }

    const label = await this.lookup(coords.latitude, coords.longitude);
    if (label) {
      this.remember(key, label);
    }
    return label;
  }

  private remember(key: string, label: string): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, { label, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  /** Serialises upstream calls so we never exceed the provider's rate limit. */
  private async acquireSlot(): Promise<void> {
    this.waiting += 1;
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });

    try {
      await previous;
      const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
      if (wait > 0) {
        await sleep(wait);
      }
      this.lastRequestAt = Date.now();
    } finally {
      this.waiting -= 1;
      release();
    }
  }

  private async lookup(
    latitude: number,
    longitude: number,
  ): Promise<string | null> {
    await this.acquireSlot();

    const base = process.env.REVERSE_GEOCODE_URL?.trim() || DEFAULT_REVERSE_URL;
    const userAgent =
      process.env.REVERSE_GEOCODE_USER_AGENT?.trim() || DEFAULT_USER_AGENT;

    const url = new URL(base);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    // zoom 10 ≈ city level: never returns street or house details.
    url.searchParams.set('zoom', '10');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'en');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': userAgent,
        },
      });

      if (!res.ok) {
        // Status only: never log the URL, it contains the coordinates.
        console.warn(`[reverse-geocode] upstream returned ${res.status}`);
        return null;
      }

      const data = (await res.json()) as NominatimReverseResponse;
      if (data.error) {
        return null;
      }
      return buildLocationLabel(data.address);
    } catch (error: unknown) {
      const reason =
        error instanceof Error && error.name === 'AbortError'
          ? 'timed out'
          : 'request failed';
      console.warn(`[reverse-geocode] ${reason}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
