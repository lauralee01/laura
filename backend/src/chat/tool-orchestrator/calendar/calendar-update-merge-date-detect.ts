/**
 * Returns true when the user's message appears to contain a calendar date.
 *
 * When the user explicitly names a date, we should trust the date returned
 * by the calendar update extractor instead of forcing the update onto the
 * matched event's existing day.
 */
export function userMessageSpecifiesCalendarDate(
  userMessage: string,
): boolean {
  const normalizedUserMessage = userMessage.toLowerCase();

  return (
    /\b(today|tomorrow|yesterday)\b/.test(normalizedUserMessage) ||
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(
      normalizedUserMessage,
    ) ||
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(
      normalizedUserMessage,
    ) ||
    /\b(this|next|last)\s+(week|weekend|month|year)\b/.test(
      normalizedUserMessage,
    ) ||
    /\b(?:in\s+)?\d+\s+(?:day|days|week|weeks|month|months|year|years)(?:\s+from\s+now)?\b/.test(
      normalizedUserMessage,
    ) ||
    /\b\d{1,2}(?:st|nd|rd|th)\b/.test(normalizedUserMessage) ||
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(normalizedUserMessage) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(normalizedUserMessage)
  );
}
