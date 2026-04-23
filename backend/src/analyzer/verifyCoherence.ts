import type { StoryInput, StoryMetadata, AnnotatedScript, VerifiedScript } from '../types/index.js';
import type { LLMClient } from '../ingestion/generateFromPrompt.js';

/**
 * Round 4: Verify coherence of the annotated script against the original story and metadata.
 * Checks for missing characters, missing plot points, continuity errors, pacing issues,
 * and (when creativeMode is true) creative appropriateness.
 * Returns a VerifiedScript.
 */
export async function verifyCoherence(
  original: StoryInput,
  metadata: StoryMetadata,
  script: AnnotatedScript,
  creativeMode: boolean,
  llmClient: LLMClient
): Promise<VerifiedScript> {
  const systemPrompt = buildSystemPrompt(creativeMode);
  const userPrompt = buildUserPrompt(original, metadata, script);

  const response = await llmClient.generateText(systemPrompt, userPrompt);
  const result = JSON.parse(response) as {
    issues: Array<{
      type: 'information-loss' | 'inconsistency' | 'pacing' | 'creative-fidelity';
      description: string;
      severity: 'low' | 'medium' | 'high';
    }>;
  };

  return {
    ...script,
    verified: true,
    issues: result.issues,
  };
}

function buildSystemPrompt(creativeMode: boolean): string {
  const parts = [
    'You are an expert story editor and quality assurance reviewer for audio dramas.',
    '',
    '## Task',
    'Review the adapted script against the original story and metadata. Check for:',
    '1. Missing characters — any character from metadata not appearing in the script',
    '2. Missing plot points — any narrative arc element not represented',
    '3. Continuity errors — inconsistencies in character behavior, timeline, or setting',
    '4. Pacing issues — scenes that feel rushed or overly drawn out',
  ];

  if (creativeMode) {
    parts.push(
      '5. Creative appropriateness — verify all creative additions are contextually appropriate, stylistically consistent, and do not introduce contradictions or information loss',
    );
  }

  parts.push(
    '',
    '## Output Format',
    'Output ONLY valid JSON matching the VerifiedScript schema:',
    '{',
    '  "verified": boolean,',
    '  "issues": [{ "type": "information-loss"|"inconsistency"|"pacing"|"creative-fidelity", "description": string, "severity": "low"|"medium"|"high" }],',
    '  "scenes": [... the corrected AnnotatedScene array if issues were found, or the original if clean ...]',
    '}',
    '',
    'If no issues are found, return { "issues": [] }.',
  );

  return parts.join('\n');
}

function buildUserPrompt(original: StoryInput, metadata: StoryMetadata, script: AnnotatedScript): string {
  return [
    '## Original Story',
    original.text,
    '',
    '## Story Metadata',
    JSON.stringify(metadata, null, 2),
    '',
    '## Full Adapted Script',
    JSON.stringify(script, null, 2),
  ].join('\n');
}
