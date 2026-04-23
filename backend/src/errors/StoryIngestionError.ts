export type StoryIngestionErrorCode =
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FORMAT'
  | 'EXTRACTION_FAILED';

export class StoryIngestionError extends Error {
  constructor(
    public readonly code: StoryIngestionErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'StoryIngestionError';
    Object.setPrototypeOf(this, StoryIngestionError.prototype);
  }
}
