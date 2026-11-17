import type { IntentEnvelope } from '../../intent/intent.types';

export const USER_CURRENT_LOCATION = 'USER_CURRENT_LOCATION';

export type SearchFreshness = 'live' | 'recent' | 'general';
export type SearchDepth = 'basic' | 'advanced';

export function getSearchQuery(
  message: string,
  envelope?: IntentEnvelope,
): string {
  const query = envelope?.slots?.query;

  if (typeof query === 'string' && query.trim()) {
    return query.trim();
  }

  return message.trim();
}

export function getFreshness(envelope?: IntentEnvelope): SearchFreshness {
  const freshness = envelope?.slots?.freshness;

  if (
    freshness === 'live' ||
    freshness === 'recent' ||
    freshness === 'general'
  ) {
    return freshness;
  }

  return 'general';
}

export function getSearchDepth(envelope?: IntentEnvelope): SearchDepth {
  return envelope?.slots?.searchDepth === 'advanced' ? 'advanced' : 'basic';
}

export function getLocationHint(envelope?: IntentEnvelope): string {
  const locationHint = envelope?.slots?.locationHint;

  if (typeof locationHint !== 'string') {
    return '';
  }

  return locationHint.trim();
}

export function buildSearchQuery(
  query: string,
  locationHint: string,
): string {
  if (!locationHint) {
    return query;
  }

  return `${query} in ${locationHint}`;
}

/**
 * Resolve Stage-1 locationHint against stored session home city.
 * Returns null when the user asked for "near me" but no city is set.
 */
export function resolveLocationHint(
  rawLocationHint: string,
  storedLocation: string | null,
): string | null {
  if (rawLocationHint === USER_CURRENT_LOCATION) {
    if (!storedLocation) {
      return null;
    }
    return storedLocation;
  }

  return rawLocationHint;
}
