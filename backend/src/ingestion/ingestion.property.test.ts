import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ingestFile } from './ingestFile.js';
import { StoryIngestionError } from '../errors/index.js';

/**
 * Feature: audio-drama-engine, Property 1: File ingestion round-trip
 *
 * For any valid non-empty story text string, creating a file buffer from that
 * text and ingesting it via the Story Ingestion Module should produce a
 * StoryInput whose `text` field is identical to the original string.
 *
 * Validates: Requirements 1.1
 */
describe('Property 1: File ingestion round-trip', () => {
  // Only .txt and .md support round-trip since PDF/EPUB require actual binary format
  const supportedExtensions = ['.txt', '.md'];

  it('should preserve text content through ingestFile for any valid non-empty string', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary non-empty strings that contain at least one non-whitespace character
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        // Pick a supported file extension
        fc.constantFrom(...supportedExtensions),
        async (text, ext) => {
          const buffer = Buffer.from(text, 'utf-8');

          // Only test files within the size limit (5MB)
          if (buffer.byteLength > 5 * 1024 * 1024) return;

          const result = await ingestFile(buffer, `story${ext}`);

          expect(result.text).toBe(text);
          expect(result.source).toBe('upload');
          expect(result.id).toBeDefined();
          expect(typeof result.id).toBe('string');
          expect(result.id.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should produce unique IDs for each ingestion of the same content', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
        async (text) => {
          const buffer = Buffer.from(text, 'utf-8');

          if (buffer.byteLength > 5 * 1024 * 1024) return;

          const result1 = await ingestFile(buffer, 'story.txt');
          const result2 = await ingestFile(buffer, 'story.txt');

          // Both should have the same text
          expect(result1.text).toBe(result2.text);
          // But different IDs
          expect(result1.id).not.toBe(result2.id);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Feature: audio-drama-engine, Property 2: Whitespace and empty file rejection
 *
 * For any string composed entirely of whitespace characters (spaces, tabs,
 * newlines, or zero-length), attempting to ingest it as a story file should be
 * rejected with an error, and no StoryInput should be produced.
 *
 * Validates: Requirements 1.3
 */
describe('Property 2: Whitespace and empty file rejection', () => {
  const supportedExtensions = ['.txt', '.md', '.pdf', '.epub'];

  it('should reject any string composed entirely of whitespace characters', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate strings composed only of whitespace characters
        fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'), { minLength: 1 }),
        // Only test .txt and .md for whitespace rejection (PDF/EPUB need binary format)
        fc.constantFrom('.txt', '.md'),
        async (whitespaceText, ext) => {
          const buffer = Buffer.from(whitespaceText, 'utf-8');

          // Skip if exceeds size limit (tested separately)
          if (buffer.byteLength > 5 * 1024 * 1024) return;

          await expect(ingestFile(buffer, `story${ext}`)).rejects.toThrow(StoryIngestionError);
          try {
            await ingestFile(buffer, `story${ext}`);
          } catch (e) {
            expect(e).toBeInstanceOf(StoryIngestionError);
            expect((e as StoryIngestionError).code).toBe('EMPTY_FILE');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject zero-length (empty) files', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Only test .txt and .md for empty file rejection
        fc.constantFrom('.txt', '.md'),
        async (ext) => {
          const buffer = Buffer.from('', 'utf-8');

          await expect(ingestFile(buffer, `story${ext}`)).rejects.toThrow(StoryIngestionError);
          try {
            await ingestFile(buffer, `story${ext}`);
          } catch (e) {
            expect(e).toBeInstanceOf(StoryIngestionError);
            expect((e as StoryIngestionError).code).toBe('EMPTY_FILE');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject files with mixed whitespace combinations of arbitrary length', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arrays of whitespace characters and join them
        fc.array(fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v', '  ', '\t\t', '\n\n'), {
          minLength: 1,
          maxLength: 200,
        }),
        // Only test .txt and .md
        fc.constantFrom('.txt', '.md'),
        async (parts, ext) => {
          const whitespaceText = parts.join('');
          const buffer = Buffer.from(whitespaceText, 'utf-8');

          if (buffer.byteLength > 5 * 1024 * 1024) return;

          await expect(ingestFile(buffer, `story${ext}`)).rejects.toThrow(StoryIngestionError);
          try {
            await ingestFile(buffer, `story${ext}`);
          } catch (e) {
            expect(e).toBeInstanceOf(StoryIngestionError);
            expect((e as StoryIngestionError).code).toBe('EMPTY_FILE');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
