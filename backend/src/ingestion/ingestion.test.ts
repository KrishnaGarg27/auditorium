import { describe, it, expect } from 'vitest';
import { ingestFile } from './ingestFile.js';
import { generateFromPrompt, type LLMClient } from './generateFromPrompt.js';
import { StoryIngestionError } from '../errors/index.js';

describe('ingestFile', () => {
  it('should extract text from a valid .txt file', async () => {
    const content = 'Once upon a time, there was a brave knight.';
    const buffer = Buffer.from(content, 'utf-8');

    const result = await ingestFile(buffer, 'story.txt');

    expect(result.text).toBe(content);
    expect(result.source).toBe('upload');
    expect(result.id).toBeDefined();
  });

  it('should extract text from a valid .md file', async () => {
    const content = '# Chapter 1\n\nThe adventure begins.';
    const buffer = Buffer.from(content, 'utf-8');

    const result = await ingestFile(buffer, 'story.md');

    expect(result.text).toBe(content);
    expect(result.source).toBe('upload');
  });

  it('should be case-insensitive for file extensions', async () => {
    const buffer = Buffer.from('Hello world', 'utf-8');

    const result = await ingestFile(buffer, 'story.TXT');
    expect(result.source).toBe('upload');
  });

  it('should reject unsupported file formats with UNSUPPORTED_FORMAT', async () => {
    const buffer = Buffer.from('content', 'utf-8');

    await expect(ingestFile(buffer, 'story.docx')).rejects.toThrow(StoryIngestionError);
    try {
      await ingestFile(buffer, 'story.docx');
    } catch (e) {
      expect((e as StoryIngestionError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('should reject files with no extension', async () => {
    const buffer = Buffer.from('content', 'utf-8');

    await expect(ingestFile(buffer, 'story')).rejects.toThrow(StoryIngestionError);
    try {
      await ingestFile(buffer, 'story');
    } catch (e) {
      expect((e as StoryIngestionError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('should reject files exceeding 5MB with FILE_TOO_LARGE', async () => {
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1, 'a');

    await expect(ingestFile(largeBuffer, 'story.txt')).rejects.toThrow(StoryIngestionError);
    try {
      await ingestFile(largeBuffer, 'story.txt');
    } catch (e) {
      expect((e as StoryIngestionError).code).toBe('FILE_TOO_LARGE');
    }
  });

  it('should accept a file at exactly 5MB', async () => {
    const exactBuffer = Buffer.alloc(5 * 1024 * 1024, 'a');

    const result = await ingestFile(exactBuffer, 'story.txt');
    expect(result.source).toBe('upload');
  });

  it('should reject empty files with EMPTY_FILE', async () => {
    const buffer = Buffer.from('', 'utf-8');

    await expect(ingestFile(buffer, 'story.txt')).rejects.toThrow(StoryIngestionError);
    try {
      await ingestFile(buffer, 'story.txt');
    } catch (e) {
      expect((e as StoryIngestionError).code).toBe('EMPTY_FILE');
    }
  });

  it('should reject whitespace-only files with EMPTY_FILE', async () => {
    const buffer = Buffer.from('   \n\t\n   ', 'utf-8');

    await expect(ingestFile(buffer, 'story.txt')).rejects.toThrow(StoryIngestionError);
    try {
      await ingestFile(buffer, 'story.txt');
    } catch (e) {
      expect((e as StoryIngestionError).code).toBe('EMPTY_FILE');
    }
  });
});

describe('ingestFile - boundary and encoding tests', () => {
  it('should accept a file at exactly 5MB (boundary)', async () => {
    const exactBuffer = Buffer.alloc(5 * 1024 * 1024, 'x');
    const result = await ingestFile(exactBuffer, 'story.txt');
    expect(result.text.length).toBe(5 * 1024 * 1024);
    expect(result.source).toBe('upload');
  });

  it('should reject a file at 5MB + 1 byte', async () => {
    const overBuffer = Buffer.alloc(5 * 1024 * 1024 + 1, 'x');
    await expect(ingestFile(overBuffer, 'story.txt')).rejects.toThrow(StoryIngestionError);
    try {
      await ingestFile(overBuffer, 'story.txt');
    } catch (e) {
      expect((e as StoryIngestionError).code).toBe('FILE_TOO_LARGE');
      expect((e as StoryIngestionError).message).toContain('5MB');
    }
  });

  it('should accept a file at 5MB - 1 byte', async () => {
    const underBuffer = Buffer.alloc(5 * 1024 * 1024 - 1, 'y');
    const result = await ingestFile(underBuffer, 'story.md');
    expect(result.source).toBe('upload');
  });

  it('should handle UTF-8 encoded text with multibyte characters', async () => {
    const utf8Text = 'こんにちは世界 — The café résumé naïve';
    const buffer = Buffer.from(utf8Text, 'utf-8');
    const result = await ingestFile(buffer, 'story.txt');
    expect(result.text).toBe(utf8Text);
  });

  it('should handle text with emoji and special Unicode characters', async () => {
    const emojiText = 'The hero 🗡️ fought the dragon 🐉 bravely.';
    const buffer = Buffer.from(emojiText, 'utf-8');
    const result = await ingestFile(buffer, 'story.txt');
    expect(result.text).toBe(emojiText);
  });

  it('should handle Latin-1 encoded text read as UTF-8', async () => {
    const latin1Text = 'El ni\u00f1o comi\u00f3 pi\u00f1a';
    const buffer = Buffer.from(latin1Text, 'utf-8');
    const result = await ingestFile(buffer, 'story.txt');
    expect(result.text).toBe(latin1Text);
  });

  it('should handle text with BOM (byte order mark)', async () => {
    const bom = '\uFEFF';
    const text = 'A story with BOM prefix.';
    const buffer = Buffer.from(bom + text, 'utf-8');
    const result = await ingestFile(buffer, 'story.txt');
    expect(result.text).toBe(bom + text);
    expect(result.source).toBe('upload');
  });

  it('should handle text with mixed line endings (CRLF, LF, CR)', async () => {
    const mixedEndings = 'Line one\r\nLine two\nLine three\rLine four';
    const buffer = Buffer.from(mixedEndings, 'utf-8');
    const result = await ingestFile(buffer, 'story.txt');
    expect(result.text).toBe(mixedEndings);
  });

  it('should reject .docx files with UNSUPPORTED_FORMAT', async () => {
    const buffer = Buffer.from('content', 'utf-8');
    await expect(ingestFile(buffer, 'document.docx')).rejects.toThrow(StoryIngestionError);
    try {
      await ingestFile(buffer, 'document.docx');
    } catch (e) {
      expect((e as StoryIngestionError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('should reject .html files with UNSUPPORTED_FORMAT', async () => {
    const buffer = Buffer.from('<html>content</html>', 'utf-8');
    await expect(ingestFile(buffer, 'page.html')).rejects.toThrow(StoryIngestionError);
    try {
      await ingestFile(buffer, 'page.html');
    } catch (e) {
      expect((e as StoryIngestionError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('should reject .rtf files with UNSUPPORTED_FORMAT', async () => {
    const buffer = Buffer.from('content', 'utf-8');
    await expect(ingestFile(buffer, 'story.rtf')).rejects.toThrow(StoryIngestionError);
    try {
      await ingestFile(buffer, 'story.rtf');
    } catch (e) {
      expect((e as StoryIngestionError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('should reject .json files with UNSUPPORTED_FORMAT', async () => {
    const buffer = Buffer.from('{"story": "content"}', 'utf-8');
    await expect(ingestFile(buffer, 'data.json')).rejects.toThrow(StoryIngestionError);
    try {
      await ingestFile(buffer, 'data.json');
    } catch (e) {
      expect((e as StoryIngestionError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('should reject files with no extension', async () => {
    const buffer = Buffer.from('content', 'utf-8');
    await expect(ingestFile(buffer, 'README')).rejects.toThrow(StoryIngestionError);
    try {
      await ingestFile(buffer, 'README');
    } catch (e) {
      expect((e as StoryIngestionError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('should reject files with double extensions where final is unsupported', async () => {
    const buffer = Buffer.from('content', 'utf-8');
    await expect(ingestFile(buffer, 'story.txt.docx')).rejects.toThrow(StoryIngestionError);
    try {
      await ingestFile(buffer, 'story.txt.docx');
    } catch (e) {
      expect((e as StoryIngestionError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });
});


describe('generateFromPrompt', () => {
  const mockLLMClient: LLMClient = {
    async generateText(_system: string, _user: string): Promise<string> {
      return 'A generated story about a hero on a quest.';
    },
  };

  it('should return a StoryInput with source "generated"', async () => {
    const result = await generateFromPrompt('Write a fantasy story', mockLLMClient);

    expect(result.source).toBe('generated');
    expect(result.text).toBe('A generated story about a hero on a quest.');
    expect(result.id).toBeDefined();
  });

  it('should pass style option to the LLM system prompt', async () => {
    let capturedSystem = '';
    const capturingClient: LLMClient = {
      async generateText(system: string, _user: string): Promise<string> {
        capturedSystem = system;
        return 'noir story';
      },
    };

    await generateFromPrompt('A detective story', capturingClient, { style: 'noir' });

    expect(capturedSystem).toContain('noir');
    expect(capturedSystem).toContain('World-weary, sardonic first-person narration');
    expect(capturedSystem).toContain('Terse, cynical dialogue');
    expect(capturedSystem).toContain('Slow, deliberate');
  });

  it('should pass length preference to the LLM system prompt', async () => {
    let capturedSystem = '';
    const capturingClient: LLMClient = {
      async generateText(system: string, _user: string): Promise<string> {
        capturedSystem = system;
        return 'short story';
      },
    };

    await generateFromPrompt('A quick tale', capturingClient, { lengthPreference: 'short' });

    expect(capturedSystem).toContain('500-1000 words');
  });
});


describe('ingestFile - PDF and EPUB extraction', () => {
  it('should reject invalid PDF content with EXTRACTION_FAILED', async () => {
    const buffer = Buffer.from('not a real pdf', 'utf-8');
    await expect(ingestFile(buffer, 'story.pdf')).rejects.toThrow(StoryIngestionError);
    try {
      await ingestFile(buffer, 'story.pdf');
    } catch (e) {
      expect((e as StoryIngestionError).code).toBe('EXTRACTION_FAILED');
    }
  });

  it('should reject invalid EPUB content with EXTRACTION_FAILED', async () => {
    const buffer = Buffer.from('not a real epub', 'utf-8');
    await expect(ingestFile(buffer, 'story.epub')).rejects.toThrow(StoryIngestionError);
    try {
      await ingestFile(buffer, 'story.epub');
    } catch (e) {
      expect((e as StoryIngestionError).code).toBe('EXTRACTION_FAILED');
    }
  });

  it('should accept .pdf extension as a supported format', async () => {
    // Even though the content is invalid, the format check should pass
    // (EXTRACTION_FAILED, not UNSUPPORTED_FORMAT)
    const buffer = Buffer.from('fake pdf content', 'utf-8');
    try {
      await ingestFile(buffer, 'story.pdf');
    } catch (e) {
      expect((e as StoryIngestionError).code).not.toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('should accept .epub extension as a supported format', async () => {
    const buffer = Buffer.from('fake epub content', 'utf-8');
    try {
      await ingestFile(buffer, 'story.epub');
    } catch (e) {
      expect((e as StoryIngestionError).code).not.toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('UNSUPPORTED_FORMAT error message lists all four supported formats', async () => {
    const buffer = Buffer.from('content', 'utf-8');
    try {
      await ingestFile(buffer, 'story.docx');
    } catch (e) {
      const msg = (e as StoryIngestionError).message;
      expect(msg).toContain('.txt');
      expect(msg).toContain('.md');
      expect(msg).toContain('.pdf');
      expect(msg).toContain('.epub');
    }
  });
});
