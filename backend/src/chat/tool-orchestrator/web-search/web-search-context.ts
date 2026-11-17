import { DateTime } from 'luxon';
import type { SearchFreshness } from './web-search-query';

export const DEFAULT_WEB_SEARCH_TIME_ZONE = 'America/Chicago';

export function buildCurrentContext(input: {
  freshness: SearchFreshness;
  timeZone: string;
}): string | null {
  if (input.freshness !== 'live' && input.freshness !== 'recent') {
    return null;
  }

  const now = DateTime.now().setZone(input.timeZone);

  return [
    `Today is ${now.toFormat('cccc, LLLL d, yyyy')}.`,
    `Current timezone: ${input.timeZone}.`,
    'Use current information for this date when the request is date-sensitive.',
    'Prefer official or highly reliable sources.',
  ].join('\n');
}
