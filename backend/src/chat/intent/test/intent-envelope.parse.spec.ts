import { parseIntentEnvelopeFromModelText } from '../intent-envelope.parse';
import { IntentEnvelopeParseError } from '../intent.types';

describe('parseIntentEnvelopeFromModelText', () => {
  it('parses minimal valid JSON with defaults', () => {
    const raw = `{
      "version": 1,
      "intent": "general_chat",
      "confidence": 0.8,
      "missingSlots": [],
      "slots": {}
    }`;
    const e = parseIntentEnvelopeFromModelText(raw);
    expect(e.intent).toBe('general_chat');
    expect(e.confidence).toBe(0.8);
    expect(e.missingSlots).toEqual([]);
    expect(e.slots).toEqual({});
  });

  it('defaults confidence and missingSlots when omitted', () => {
    const raw = '{"version":1,"intent":"clarify","slots":{}}';
    const e = parseIntentEnvelopeFromModelText(raw);
    expect(e.confidence).toBe(0.5);
    expect(e.missingSlots).toEqual([]);
  });

  it('extracts JSON from surrounding text', () => {
    const raw = 'Here you go: {"version":1,"intent":"calendar_list","slots":{}} thanks';
    const e = parseIntentEnvelopeFromModelText(raw);
    expect(e.intent).toBe('calendar_list');
  });

  it('parses JSON inside markdown code fences', () => {
    const raw = '```json\n{"version":1,"intent":"email_draft_revise","confidence":1,"missingSlots":[],"slots":{}}\n```';
    const e = parseIntentEnvelopeFromModelText(raw);
    expect(e.intent).toBe('email_draft_revise');
  });

  it('throws on bad intent string', () => {
    expect(() =>
      parseIntentEnvelopeFromModelText(
        '{"version":1,"intent":"unknown_intent","slots":{}}',
      ),
    ).toThrow(IntentEnvelopeParseError);
  });

  it('throws on wrong version', () => {
    expect(() =>
      parseIntentEnvelopeFromModelText(
        '{"version":2,"intent":"general_chat","slots":{}}',
      ),
    ).toThrow(IntentEnvelopeParseError);
  });
});
