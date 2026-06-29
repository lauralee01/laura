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
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{
    finishReason?: string;
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
  private readonly retryableStatuses = new Set([429, 500, 502, 503, 504]);

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

    if (!geminiKey) {
      throw new Error('No LLM API key found');
    }

    return this.generateWithGemini(geminiKey, input);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableStatus(status: number): boolean {
    return this.retryableStatuses.has(status);
  }

  private getFriendlyGeminiError(status: number): string {
    if (status === 429) {
      return (
        'Laura is receiving too many requests right now. Please wait a moment and try again.'
      );
    }

    if ([500, 502, 503, 504].includes(status)) {
      return (
        'Laura is having trouble reaching the AI model right now. Please try again in a moment.'
      );
    }

    return (
      'Laura could not complete the request right now. Please try again or rephrase your message.'
    );
  }

  private async generateWithGemini(
    apiKey: string,
    input: GenerateInput,
  ): Promise<string> {
    const model = process.env.GEMINI_MODEL?.trim();

    if (!model) {
      throw new Error('GEMINI_MODEL is missing (set backend/.env)');
    }

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
        // How creative the model is.
        temperature: 0.4,

        // Max number of tokens to generate.
        maxOutputTokens: 2000,
      },
    };

    let lastStatus = 0;
    let lastErrorText = '';

    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const jsonUnknown: unknown = await res.json();

        if (typeof jsonUnknown !== 'object' || jsonUnknown === null) {
          throw new Error('Gemini API returned an unexpected response shape');
        }

        const json = jsonUnknown as GeminiGenerateResponse;
        const candidate = json.candidates?.[0];

        const reply =
          candidate?.content?.parts?.[0]?.text ??
          candidate?.content?.parts?.[0]?.inlineData?.data;

        if (reply != null && String(reply).trim() !== '') {
          return String(reply);
        }

        const blockReason = json.promptFeedback?.blockReason;
        const finishReason = candidate?.finishReason;

        if (finishReason === 'UNEXPECTED_TOOL_CALL') {
          return 'I realize I need a tool to answer that, but I don’t have access to the internet or real-time data like the weather. How else can I help?';
        }

        console.error('Gemini API empty reply or block. Response:', JSON.stringify(json, null, 2));

        if (blockReason || finishReason) {
          return (
            'I couldn’t produce a reply just now. Try rephrasing your message or sending a shorter version.'
          );
        }

        return 'I didn’t get any text back from the model. Please try again in a moment.';
      }

      lastStatus = res.status;
      lastErrorText = await res.text().catch(() => '');

      if (this.isRetryableStatus(res.status) && attempt < 3) {
        await this.sleep(attempt * 1000);
        continue;
      }

      break;
    }

    console.error(
      `Gemini API error after retries (${lastStatus}). ${lastErrorText ? 'Details: ' + lastErrorText : ''
      }`,
    );

    return this.getFriendlyGeminiError(lastStatus);
  }
}