import type { ListCalendarEventSummary } from '../../integrations/calendar/calendar.types';

export function filterEventsForMutation(
  events: ListCalendarEventSummary[],
  titleKeywords: string,
): ListCalendarEventSummary[] {
  const k = titleKeywords.trim().toLowerCase();
  if (!k || k === 'any' || k === '*' || k === 'unspecified') {
    return events;
  }
  const parts = k.split(/\s+/).filter((p) => p.length > 0);
  return events.filter((e) => {
    const t = e.title.toLowerCase();
    return parts.every((p) => t.includes(p));
  });
}
