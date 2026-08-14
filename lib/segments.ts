export interface SegmentError {
  offset: number;
  length: number;
}

export interface Segment<E> {
  text: string;
  error?: E;
}

export function buildSegments<E extends SegmentError>(text: string, errors: E[]): Segment<E>[] {
  const sorted = [...errors].sort((a, b) => a.offset - b.offset);
  const segments: Segment<E>[] = [];
  let cursor = 0;

  for (const error of sorted) {
    if (error.offset < cursor) continue;
    if (error.offset > cursor) segments.push({ text: text.slice(cursor, error.offset) });
    segments.push({ text: text.slice(error.offset, error.offset + error.length), error });
    cursor = error.offset + error.length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
