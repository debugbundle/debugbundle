import { z } from "zod";

/** Bounded UTF-8 counting, including replacement of lone surrogates, without host globals. */
export function utf8ByteLength(value: string, maxBytes: number): number | null {
  if (value.length > maxBytes) return null;
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes++;
    else if (code <= 0x7ff) bytes += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index++;
    } else bytes += 3;
    if (bytes > maxBytes) return null;
  }
  return bytes;
}
export function withinUtf8Budget(value: string, maxBytes: number): boolean {
  return utf8ByteLength(value, maxBytes) !== null;
}

/** Linear work bounded by the requested byte budget, without splitting a pair. */
export function truncateUtf8(value: string, maxBytes: number): string {
  let bytes = 0,
    index = 0;
  while (index < value.length && index < maxBytes) {
    const code = value.charCodeAt(index),
      next = value.charCodeAt(index + 1);
    const pair = code >= 0xd800 && code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
    const size = code <= 0x7f ? 1 : code <= 0x7ff ? 2 : pair ? 4 : 3;
    if (bytes + size > maxBytes) break;
    bytes += size;
    index += pair ? 2 : 1;
  }
  return value.slice(0, index);
}

/** Use only on normalised JSON; native error inspection and redaction precede validation. */
export function utf8String(maxBytes: number): z.ZodString {
  return z
    .string()
    .max(maxBytes)
    .refine(
      (value) => withinUtf8Budget(value, maxBytes),
      "Evidence string exceeds its UTF-8 byte budget"
    );
}
