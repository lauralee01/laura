import type { IntentEnvelope } from '../../intent/intent.types';

export function getIntentTitleHint(
  envelope?: IntentEnvelope,
): string | null {
  const titleHint = envelope?.slots?.titleHint;

  if (typeof titleHint !== 'string') {
    return null;
  }

  return titleHint.trim() || null;
}

export function resolveMutationTitleKeywords(params: {
  extractedTitleKeyword: string | null | undefined;
  intentTitleHint: string | null;
}): string {
  const normalizedExtractedTitleKeyword =
    params.extractedTitleKeyword?.trim();

  if (normalizedExtractedTitleKeyword) {
    return normalizedExtractedTitleKeyword;
  }

  return params.intentTitleHint?.trim() || '';
}
