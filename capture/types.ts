export type FeedSource = 'linkedin' | 'x';

export interface CapturedItem {
  source: FeedSource;
  author: string;
  authorHeadline?: string | null;
  excerpt: string;
  url: string;
  postedAt?: string | null;
}

/** Thrown when capture must stop (login wall or captcha). Never retry aggressively. */
export class CaptureAbortError extends Error {
  constructor(
    public readonly reason: 'login' | 'captcha',
    public readonly source: FeedSource,
    message?: string,
  ) {
    super(message ?? `Capture aborted (${reason}) on ${source}`);
    this.name = 'CaptureAbortError';
  }
}

export const DEFAULT_MAX_ITEMS = 150;
