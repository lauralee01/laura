import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { MemoryService } from '../memory/memory.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly llmService: LlmService,
    private readonly memoryService: MemoryService
  ) {}

  async replyTo(sessionId: string, message: string): Promise<string> {
    // Phase 1 MVP: single-turn chat with retrieved memory (if sessionId is present).
    const systemBasePrompt =
      'You are laura, a helpful personalized AI agent. ' +
      'Be concise, ask clarifying questions when needed, and follow the user’s intent.';

    let systemPrompt = systemBasePrompt;

    // If we have a sessionId, retrieve relevant memory and provide it to the model.
    if (sessionId) {
      const memories = await this.memoryService.searchMemories({
        userId: sessionId,
        query: message,
        topK: 3,
      });

      if (memories.length > 0) {
        const memoryContext = memories
          .map((m) => `- ${m.content}`)
          .join('\n');
        console.log('memoryContext', memoryContext);

        systemPrompt =
          systemBasePrompt +
          '\n\nUser session preferences / facts (use as hard constraints):\n' +
          memoryContext +
          '\n\nWhen generating your reply, follow these constraints exactly. ' +
          'If a requested detail conflicts with a constraint, ask a clarifying question.';
        console.log('systemPrompt', systemPrompt);
      } else {
        systemPrompt =
          systemBasePrompt +
          '\n\nNo relevant memories found for this session. Proceed normally.';
      }
    }

    // Phase 1 (user-visible): generate the reply using retrieved memory context.
    const reply = await this.llmService.generate({
      systemPrompt,
      userMessage: message,
    });

    // Phase 2 (seamless personalization): after generating the reply,
    // extract "durable preferences/facts" from ONLY the latest user message.
    // If something qualifies, store it to Postgres+pgvector for future turns.
    if (sessionId) {
      // We intentionally ignore extraction failures so chat remains robust.
      try {
        const memoriesToWrite = await this.extractMemoriesToWrite(message);
        console.log('memoriesToWrite', memoriesToWrite);
        // Smallest dedupe:
        // 1) remove duplicate strings in the same extraction pass
        // 2) skip write if nearest existing memory is too similar
        const uniqueCandidates = Array.from(
          new Set(memoriesToWrite.map((m) => m.trim()).filter((m) => m.length > 0))
        );

        for (const m of uniqueCandidates) {
          const shouldWrite = await this.shouldWriteMemoryCandidate(sessionId, m);
          if (shouldWrite) {
            await this.memoryService.writeMemory({ userId: sessionId, content: m });
          } else {
            console.log('memory write skipped (too similar):', m);
          }
        }
      } catch (e) {
        // Learning project: keep logs to understand extraction behavior.
        console.log('memory extraction skipped due to error:', e);
      }
    }

    return reply;
  }

  private async extractMemoriesToWrite(latestUserMessage: string): Promise<string[]> {
    console.log('latestUserMessage', latestUserMessage);
    const extractionSystemPrompt = `
You are a memory extraction assistant for laura.

Task: From the user's latest message, decide if there is any NEW durable preference or fact worth storing for session personalization.

Output: JSON ONLY (no markdown, no extra keys, no explanation) with this exact schema:
{ "memoriesToWrite": string[] }

Rules:
- Add at most 2 items.
- Each item must be a single short sentence (no bullets needed).
- Store ONLY if the message contains:
  (1) explicit preferences/constraints about how laura should respond (tone/length/format/structure), OR
  (2) stable goals, project context, or roles the user states, OR
  (3) durable actionable instructions the user states.
- Do NOT store:
  - thanks / greetings / small talk
  - one-off details likely irrelevant later
  - assistant text

If nothing qualifies, return { "memoriesToWrite": [] }.
`.trim();

    const raw = await this.llmService.generate({
      systemPrompt: extractionSystemPrompt,
      userMessage: latestUserMessage,
    });

    const parsed = this.safeParseJson(raw);
    if (!parsed) {
      return [];
    }

    const memories = parsed.memoriesToWrite;
    if (!Array.isArray(memories)) {
      return [];
    }

    // Keep only strings to avoid unpredictable types.
    return memories.filter((m): m is string => typeof m === 'string').slice(0, 2);
  }

  private safeParseJson(raw: string): { memoriesToWrite: unknown } | null {
    try {
      const jsonUnknown: unknown = JSON.parse(raw);
      if (typeof jsonUnknown !== 'object' || jsonUnknown === null) return null;
      const obj = jsonUnknown as { memoriesToWrite?: unknown };
      return { memoriesToWrite: obj.memoriesToWrite };
    } catch {
      // Try to recover if the model wraps JSON in text (best-effort).
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
      try {
        const slice = raw.slice(firstBrace, lastBrace + 1);
        const jsonUnknown: unknown = JSON.parse(slice);
        if (typeof jsonUnknown !== 'object' || jsonUnknown === null) return null;
        const obj = jsonUnknown as { memoriesToWrite?: unknown };
        return { memoriesToWrite: obj.memoriesToWrite };
      } catch {
        return null;
      }
    }
  }

  private async shouldWriteMemoryCandidate(
    sessionId: string,
    candidate: string
  ): Promise<boolean> {
    const thresholdRaw = process.env.MEMORY_DEDUPE_DISTANCE_THRESHOLD?.trim();
    const threshold = thresholdRaw ? Number(thresholdRaw) : 0.12;

    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new Error('MEMORY_DEDUPE_DISTANCE_THRESHOLD must be >= 0');
    }

    const nearest = await this.memoryService.searchMemories({
      userId: sessionId,
      query: candidate,
      topK: 1,
    });

    if (nearest.length === 0) {
      return true;
    }

    const nearestDistance = nearest[0].distance;
    return nearestDistance > threshold;
  }
}
