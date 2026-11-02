import type { IntentId } from '../intent.types';

/**
 * Expected Stage-1 intents for regression cases (prompt batch-g-v5+).
 * Used by unit tests that assert prompt guidance / routing policy —
 * not live LLM calls.
 */
export type IntentRoutingFixture = {
  userMessage: string;
  expectedIntent: IntentId;
  note: string;
};

export const DATETIME_ROUTING_FIXTURES: IntentRoutingFixture[] = [
  {
    userMessage: 'What time is it?',
    expectedIntent: 'current_datetime',
    note: 'Pure clock ask',
  },
  {
    userMessage: "What's today's date?",
    expectedIntent: 'current_datetime',
    note: 'Pure date ask',
  },
  {
    userMessage: 'What day is it today?',
    expectedIntent: 'current_datetime',
    note: 'Pure weekday ask',
  },
  {
    userMessage: 'How many days left in the year?',
    expectedIntent: 'general_chat',
    note: 'Date math must not hit the clock template',
  },
  {
    userMessage: 'How many days until New Year?',
    expectedIntent: 'general_chat',
    note: 'Countdown / remaining days',
  },
  {
    userMessage: 'What day will it be in 40 days?',
    expectedIntent: 'general_chat',
    note: 'Forward date arithmetic',
  },
];
