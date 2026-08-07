import { Injectable } from '@nestjs/common';

/** One turn in the visible chat (matches frontend naming: assistant = model in Gemini). */
export type LlmChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type GenerateInput = {
  systemPrompt: string;
  userMessage: string;
  history?: LlmChatTurn[];
  temperature?: number;
  maxOutputTokens?: number;
  /** Instruct model to output JSON directly via constrained decoding. */
  responseMimeType?: 'application/json' | 'text/plain';
  /** Override the default GEMINI_MODEL for fast/light tier execution. */
  model?: string;
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

class GeminiApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly model: string,
  ) {
    super(`Gemini API failed for ${model} with status ${status}`);
  }
}

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

  async generateStream(
    input: GenerateInput,
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    const geminiKey = process.env.GEMINI_API_KEY?.trim();

    if (!geminiKey) {
      throw new Error('No LLM API key found');
    }

    const model = input.model?.trim() || process.env.GEMINI_MODEL?.trim();

    if (!model) {
      throw new Error('GEMINI_MODEL is missing (set backend/.env)');
    }

    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) +
      ':streamGenerateContent?alt=sse&key=' +
      encodeURIComponent(geminiKey);

    const generationConfig: Record<string, unknown> = {
      temperature: input.temperature ?? 0.4,
      maxOutputTokens: input.maxOutputTokens ?? 2000,
    };

    if (input.responseMimeType) {
      generationConfig.responseMimeType = input.responseMimeType;
    }

    const payload = {
      systemInstruction: {
        parts: [{ text: input.systemPrompt }],
      },
      contents: this.buildGeminiContents(input),
      generationConfig,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new GeminiApiError(res.status, errText, model);
    }

    if (!res.body) {
      throw new Error('No response body from Gemini stream');
    }

    let fullReply = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const json = JSON.parse(jsonStr) as GeminiGenerateResponse;
          const candidate = json.candidates?.[0];
          const text = candidate?.content?.parts?.[0]?.text;
          if (text) {
            fullReply += text;
            onChunk(text);
          }
        } catch {
          // ignore chunk parse errors
        }
      }
    }

    if (buffer.trim().startsWith('data:')) {
      try {
        const jsonStr = buffer.trim().slice(5).trim();
        const json = JSON.parse(jsonStr) as GeminiGenerateResponse;
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          fullReply += text;
          onChunk(text);
        }
      } catch {
        // ignore parse error
      }
    }

    return fullReply;
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

  private async generateWithGeminiModel(
    apiKey: string,
    input: GenerateInput,
    model: string,
  ): Promise<string> {
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) +
      ':generateContent?key=' +
      encodeURIComponent(apiKey);

    const generationConfig: Record<string, unknown> = {
      temperature: input.temperature ?? 0.4,
      maxOutputTokens: input.maxOutputTokens ?? 2000,
    };

    if (input.responseMimeType) {
      generationConfig.responseMimeType = input.responseMimeType;
    }

    const payload = {
      systemInstruction: {
        parts: [{ text: input.systemPrompt }],
      },
      contents: this.buildGeminiContents(input),
      generationConfig,
    };

    let lastStatus = 0;
    let lastErrorText = '';

    for (let attempt = 1; attempt <= 2; attempt++) {
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

        console.error(
          'Gemini API empty reply or block. Response:',
          JSON.stringify(json, null, 2),
        );

        if (blockReason || finishReason) {
          return 'I couldn’t produce a reply just now. Try rephrasing your message or sending a shorter version.';
        }

        return 'I didn’t get any text back from the model. Please try again in a moment.';
      }

      lastStatus = res.status;
      lastErrorText = await res.text().catch(() => '');

      if (this.isRetryableStatus(res.status) && attempt < 2) {
        await this.sleep(attempt * 300);
        continue;
      }

      break;
    }

    throw new GeminiApiError(lastStatus, lastErrorText, model);
  }

  private async generateWithGemini(
    apiKey: string,
    input: GenerateInput,
  ): Promise<string> {
    const primaryModel =
      input.model?.trim() || process.env.GEMINI_MODEL?.trim();

    if (!primaryModel) {
      throw new Error('GEMINI_MODEL is missing (set backend/.env)');
    }

    const fallbackModel = process.env.GEMINI_FALLBACK_MODEL?.trim();

    try {
      return await this.generateWithGeminiModel(apiKey, input, primaryModel);
    } catch (err) {
      if (!(err instanceof GeminiApiError)) {
        throw err;
      }

      const canFallback =
        fallbackModel &&
        fallbackModel !== primaryModel &&
        this.isRetryableStatus(err.status);

      if (!canFallback) {
        console.error(
          `Gemini API error after retries (${err.status}) on ${err.model}. ${err.detail ? 'Details: ' + err.detail : ''
          }`,
        );

        return this.getFriendlyGeminiError(err.status);
      }

      console.warn(
        `Gemini primary model failed (${err.status}) on ${primaryModel}. Trying fallback model ${fallbackModel}.`,
      );

      try {
        return await this.generateWithGeminiModel(apiKey, input, fallbackModel);
      } catch (fallbackErr) {
        if (fallbackErr instanceof GeminiApiError) {
          console.error(
            `Gemini fallback model also failed (${fallbackErr.status}) on ${fallbackErr.model}. ${fallbackErr.detail ? 'Details: ' + fallbackErr.detail : ''
            }`,
          );

          return this.getFriendlyGeminiError(fallbackErr.status);
        }

        throw fallbackErr;
      }
    }
  }
}