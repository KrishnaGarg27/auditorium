import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StoryIngestionError } from '../errors/index.js';
import type { StoryInput } from '../types/index.js';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.pdf', '.epub'];

/**
 * Accept an uploaded file buffer and filename, validate, extract text,
 * and return a StoryInput with source: 'upload'.
 */
export async function ingestFile(file: Buffer, filename: string): Promise<StoryInput> {
  const ext = getExtension(filename);

  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new StoryIngestionError(
      'UNSUPPORTED_FORMAT',
      'Only .txt, .md, .pdf, and .epub files are supported.'
    );
  }

  if (file.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new StoryIngestionError(
      'FILE_TOO_LARGE',
      'File exceeds the maximum size of 5MB.'
    );
  }

  let text: string;

  if (ext === '.pdf') {
    text = await extractPdfText(file);
  } else if (ext === '.epub') {
    text = await extractEpubText(file);
  } else {
    text = file.toString('utf-8');
  }

  if (text.trim().length === 0) {
    throw new StoryIngestionError(
      'EMPTY_FILE',
      'The uploaded file contains no extractable text.'
    );
  }

  return {
    id: uuidv4(),
    text,
    source: 'upload',
  };
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdf = (await import('pdf-parse')).default;
    const data = await pdf(buffer);
    return data.text;
  } catch {
    throw new StoryIngestionError(
      'EXTRACTION_FAILED',
      'Failed to extract text from PDF file.'
    );
  }
}

async function extractEpubText(buffer: Buffer): Promise<string> {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `epub-${uuidv4()}.epub`);

  try {
    fs.writeFileSync(tmpFile, buffer);

    const { EPub } = await import('epub2');
    const epub = await EPub.createAsync(tmpFile);

    const chapters: string[] = [];
    for (const item of epub.flow) {
      try {
        const html = await epub.getChapterAsync(item.id);
        // Strip HTML tags to get plain text
        const plainText = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (plainText.length > 0) {
          chapters.push(plainText);
        }
      } catch {
        // Skip chapters that can't be read
      }
    }

    return chapters.join('\n\n');
  } catch (e) {
    if (e instanceof StoryIngestionError) throw e;
    throw new StoryIngestionError(
      'EXTRACTION_FAILED',
      'Failed to extract text from EPUB file.'
    );
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}
