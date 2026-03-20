import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { MemoryService } from '../memory/memory.service';

@Injectable()
export class MemoryPersistenceService {
  constructor(
    private readonly llmService: LlmService,
    private readonly memoryService: MemoryService
  ) {}

  async writeExtractedMemoriesIfAny(sessionId: string, message: string): Promise<void> {
    if (!sessionId) {
      return;
    }

    // We intentionally ignore extraction failures so chat remains robust.
    try {
      const memoriesToWrite = await this.extractMemoriesToWrite(message);

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

  private async extractMemoriesToWrite(latestUserMessage: string): Promise<string[]> {
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

    return memories.filter((m): m is string => typeof m === 'string').slice(0, 2);
  }

  private safeParseJson(raw: string): { memoriesToWrite: unknown } | null {
    try {
      const jsonUnknown: unknown = JSON.parse(raw);
      if (typeof jsonUnknown !== 'object' || jsonUnknown === null) return null;
      const obj = jsonUnknown as { memoriesToWrite?: unknown };
      return { memoriesToWrite: obj.memoriesToWrite };
    } catch {
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

