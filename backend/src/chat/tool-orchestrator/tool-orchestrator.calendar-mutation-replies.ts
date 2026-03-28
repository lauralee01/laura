import { normalizeQuickReply } from './tool-orchestrator.utils';
import type { ListCalendarEventSummary } from '../../integrations/calendar/calendar.types';

export function parseEventChoiceIndex(
  message: string,
  max: number,
): number | null {
  const t = message.trim();
  const m = /^#?(\d+)$/.exec(t);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n >= 1 && n <= max) return n;
  return null;
}

/** Confirms delete/reschedule prompts (intentionally excludes “send”). */
export function isConfirmCalendarMutation(message: string): boolean {
  const raw = message.trim().toLowerCase();
  if (raw.length > 120) return false;
  const t = normalizeQuickReply(message);
  return (
    t === 'y' ||
    t === 'yes' ||
    t === 'yep' ||
    t === 'yeah' ||
    t === 'sure' ||
    t === 'go ahead' ||
    t === 'confirm' ||
    t === 'ok' ||
    t === 'okay' ||
    t === 'do it' ||
    t === 'delete it'
  );
}

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
