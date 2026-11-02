import { buildIntentClassificationSystemPrompt } from '../intent-router.prompt';
import { DATETIME_ROUTING_FIXTURES } from './intent-routing.fixtures';

describe('datetime routing policy (prompt)', () => {
  const prompt = buildIntentClassificationSystemPrompt();

  it('narrows current_datetime to pure clock/date asks', () => {
    expect(prompt).toMatch(/Use current_datetime ONLY/i);
    expect(prompt).toMatch(/Do NOT use current_datetime for date math/i);
    expect(prompt).toContain('How many days left in the year?');
  });

  it('documents date-math examples as general_chat', () => {
    for (const fixture of DATETIME_ROUTING_FIXTURES) {
      if (fixture.expectedIntent !== 'general_chat') {
        continue;
      }
      expect(prompt).toContain(fixture.userMessage);
    }
  });
});
