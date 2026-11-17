import { DateTime } from 'luxon';
import type { CalendarMutationExtraction } from '../tool-orchestrator-llm-extractors';
import {
  getMonToSunRangeLocal,
  getNextDaysRangeLocal,
  getSingleDayRangeLocal,
} from './calendar-ranges';

export function resolveMutationSearchRange(
  extracted: CalendarMutationExtraction,
  timeZone: string,
): { startLocal: string; endLocal: string } {
  const now = DateTime.now().setZone(timeZone);

  if (extracted.searchWholeWeek) {
    return getMonToSunRangeLocal(now, extracted.weekOffset ?? 0);
  }

  if (extracted.dayOffset !== null) {
    return getSingleDayRangeLocal(now, extracted.dayOffset);
  }

  return getNextDaysRangeLocal(
    now,
    extracted.searchNextDays ?? 14,
  );
}
