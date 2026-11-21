import { buildLauraChatExtraContext, buildLauraSystemBasePrompt } from './laura-system-prompt';

describe('laura system prompt — reminder / todo honesty', () => {
  it('forbids inventing todos or reminders without a calendar tool', () => {
    const base = buildLauraSystemBasePrompt('warm');
    expect(base).toMatch(/does not have a separate to-do list/i);
    expect(base).toMatch(/Never claim that you added something to a to-do list/i);
    expect(base).toMatch(/Google Calendar/i);
  });

  it('adds anti-hallucination guidance for general_chat and pending_confirm', () => {
    for (const intent of ['general_chat', 'pending_confirm'] as const) {
      const extra = buildLauraChatExtraContext({
        sessionTimeZone: 'America/New_York',
        storedLocation: null,
        memories: [],
        intent,
      });
      expect(extra).toMatch(/Do not invent that you already completed/i);
      expect(extra).toMatch(/Laura has no separate to-do list/i);
      expect(extra).toMatch(/Connect Google/i);
    }
  });

  it('keeps clarify follow-up guidance with expanded no-invent list', () => {
    const extra = buildLauraChatExtraContext({
      sessionTimeZone: null,
      storedLocation: null,
      memories: [],
      intent: 'clarify',
    });
    expect(extra).toMatch(/Ask exactly one clear/i);
    expect(extra).toMatch(/to-do, or reminder action/i);
  });
});
