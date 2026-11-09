import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { MemoryService } from '../memory/memory.service';

@Injectable()
export class MemoryPersistenceService {
  constructor(
    private readonly llmService: LlmService,
    private readonly memoryService: MemoryService,
  ) { }

  async writeExtractedMemoriesIfAny(
    userId: string | undefined,
    message: string,
  ): Promise<void> {
    if (!userId) {
      console.warn(
        '[memory-persistence] No userId; skipping memory extraction',
      );
      return;
    }

    const extractedMemories =
      await this.extractMemoriesToWrite(message);

    if (extractedMemories.length === 0) {
      return;
    }

    let savedCount = 0;
    let skippedDuplicates = 0;

    /*
     * Candidates are independent: embed+dedupe+write in parallel (max 2).
     * Each candidate still uses a single embedding for dedupe and insert.
     */
    const results = await Promise.all(
      extractedMemories.map((memory) =>
        this.memoryService.writeMemoryIfNovel({
          userId,
          content: memory,
        }),
      ),
    );

    for (const result of results) {
      if (result.status === 'written') {
        savedCount += 1;
      } else if (result.status === 'duplicate') {
        skippedDuplicates += 1;
      }
    }

    if (savedCount > 0 || skippedDuplicates > 0) {
      console.log('[memory-persistence] Memories processed', {
        userId,
        savedCount,
        skippedDuplicates,
      });
    }
  }

  private async extractMemoriesToWrite(
    latestUserMessage: string,
  ): Promise<string[]> {
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

    return memories
      .filter((m): m is string => typeof m === 'string')
      .slice(0, 2);
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
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace)
        return null;
      try {
        const slice = raw.slice(firstBrace, lastBrace + 1);
        const jsonUnknown: unknown = JSON.parse(slice);
        if (typeof jsonUnknown !== 'object' || jsonUnknown === null)
          return null;
        const obj = jsonUnknown as { memoriesToWrite?: unknown };
        return { memoriesToWrite: obj.memoriesToWrite };
      } catch {
        return null;
      }
    }
  }
}
