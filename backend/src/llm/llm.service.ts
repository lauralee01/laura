import { Injectable } from '@nestjs/common';

type GenerateInput = {
  systemPrompt: string;
  userMessage: string;
};

@Injectable()
export class LlmService {
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
      contents: [
        {
          role: 'user',
          parts: [
            {
              text:
                input.systemPrompt +
                '\n\nUser request:\n' +
                input.userMessage,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
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

    const json = (await res.json()) as any;
    const reply =
      json?.candidates?.[0]?.content?.parts?.[0]?.text ??
      json?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    return String(reply ?? 'Sorry—no response generated.');
  }
}

