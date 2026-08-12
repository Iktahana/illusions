/** Convert Rust UTF-8 byte offsets to JavaScript UTF-16 string indices. */
export class Utf8SourceOffsets {
  private readonly byteBoundaries: number[] = [0];
  private readonly utf16Boundaries: number[] = [0];

  constructor(source: string) {
    const encoder = new TextEncoder();
    let bytes = 0;
    let utf16 = 0;
    for (const character of source) {
      bytes += encoder.encode(character).length;
      utf16 += character.length;
      this.byteBoundaries.push(bytes);
      this.utf16Boundaries.push(utf16);
    }
  }

  toUtf16(byteOffset: number): number {
    let low = 0;
    let high = this.byteBoundaries.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (this.byteBoundaries[middle] < byteOffset) low = middle + 1;
      else high = middle - 1;
    }
    if (this.byteBoundaries[low] === byteOffset) return this.utf16Boundaries[low];
    return this.utf16Boundaries[Math.max(0, high)];
  }
}

/** Convert a Rust byte offset into a one-based source line and column. */
export function sourceLocationAtByteOffset(
  source: string,
  byteOffset: number,
): { line: number; column: number } {
  const utf16Offset = new Utf8SourceOffsets(source).toUtf16(byteOffset);
  const before = source.slice(0, utf16Offset);
  const lines = before.split(/\r\n|\r|\n/);
  return { line: lines.length, column: Array.from(lines.at(-1) ?? "").length + 1 };
}
