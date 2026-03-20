import { Injectable } from '@nestjs/common';

/** One turn in the visible chat (matches frontend naming: assistant = model in Gemini). */
export type LlmChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

type GenerateInput = {
  systemPrompt: string;
  userMessage: string;
  /** Prior turns only (optional). The current user turn is always `userMessage`. */
  history?: LlmChatTurn[];
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          data?: string;
        };
      }>;
    };
  }>;
};

@Injectable()
export class LlmService {
  /**
   * Maps our chat turns to Gemini's `contents` array.
   * Gemini uses role `model` for assistant replies (not `assistant`).
   */
  private buildGeminiContents(input: GenerateInput): Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
  }> {
    const contents: Array<{
      role: 'user' | 'model';
      parts: Array<{ text: string }>;
    }> = [];

    if (input.history) {
      for (const turn of input.history) {
        contents.push({
          role: turn.role === 'user' ? 'user' : 'model',
          parts: [{ text: turn.content }],
        });
      }
    }

    contents.push({
      role: 'user',
      parts: [{ text: input.userMessage }],
    });

    return contents;
  }

  async generate(input: GenerateInput): Promise<string> {
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (geminiKey) {
      return this.generateWithGemini(geminiKey, input);
    }

    throw new Error(
      'No LLM API key found'
    );
  }

  private async generateWithGemini(
    apiKey: string,
    input: GenerateInput
  ): Promise<string> {
    const model =
      process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest';
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) +
      ':generateContent?key=' +
      encodeURIComponent(apiKey);

    const payload = {
      // System rules + memory context live here (not repeated every turn).
      systemInstruction: {
        parts: [{ text: input.systemPrompt }],
      },
      // Conversation so far + the latest user message as the final user turn.
      contents: this.buildGeminiContents(input),
      generationConfig: {
        // how creative the model is
        temperature: 0.4,
        // max number of tokens to generate (how long the response is)
        maxOutputTokens: 900,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Gemini API error (${res.status}). ${text ? 'Details: ' + text : ''}`
      );
    }

    const jsonUnknown: unknown = await res.json();
    if (typeof jsonUnknown !== 'object' || jsonUnknown === null) {
      throw new Error('Gemini API returned an unexpected response shape');
    }

    const json = jsonUnknown as GeminiGenerateResponse;
    const reply =
      json.candidates?.[0]?.content?.parts?.[0]?.text ??
      json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    return String(reply ?? 'Sorry—no response generated.');
  }
}

