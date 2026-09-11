export function zigZagEncode(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error('ZigZag value out of range.');
  return value >= 0 ? 2 * value : -2 * value - 1;
}

export function zigZagDecode(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('ZigZag value out of range.');
  return value % 2 === 0 ? value / 2 : -(value + 1) / 2;
}

export function writeUleb128(output: number[], value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('ULEB128 value out of range.');
  let remaining = value;
  do {
    let byte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining) byte |= 0x80;
    output.push(byte);
  } while (remaining);
}

export function readUleb128(data: Uint8Array, start: number): { value: number; next: number } {
  let value = 0;
  let multiplier = 1;
  let position = start;
  while (true) {
    if (position >= data.length) throw new Error('Truncated LEB128 integer.');
    const byte = data[position++];
    value += (byte & 0x7f) * multiplier;
    if (!Number.isSafeInteger(value)) throw new Error('LEB128 integer too large.');
    if (!(byte & 0x80)) return { value, next: position };
    multiplier *= 128;
    if (multiplier > 2 ** 49) throw new Error('LEB128 integer too long.');
  }
}
