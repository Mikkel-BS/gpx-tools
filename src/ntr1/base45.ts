export const BASE45_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const values = new Map(Array.from(BASE45_ALPHABET, (character, index) => [character, index]));

export function base45EncodedLength(byteLength: number): number {
  if (!Number.isInteger(byteLength) || byteLength < 0) throw new Error('Invalid byte length.');
  return 3 * Math.floor(byteLength / 2) + (byteLength % 2 ? 2 : 0);
}

export function encodeBase45(bytes: Uint8Array): string {
  let output = '';
  let index = 0;
  while (index + 1 < bytes.length) {
    let value = bytes[index] * 256 + bytes[index + 1];
    const c = value % 45;
    value = Math.floor(value / 45);
    const d = value % 45;
    const e = Math.floor(value / 45);
    output += BASE45_ALPHABET[c] + BASE45_ALPHABET[d] + BASE45_ALPHABET[e];
    index += 2;
  }
  if (index < bytes.length) {
    const value = bytes[index];
    output += BASE45_ALPHABET[value % 45] + BASE45_ALPHABET[Math.floor(value / 45)];
  }
  return output;
}

export function decodeBase45(text: string): Uint8Array {
  const output: number[] = [];
  let index = 0;
  while (index + 2 < text.length) {
    const a = values.get(text[index]);
    const b = values.get(text[index + 1]);
    const c = values.get(text[index + 2]);
    if (a === undefined || b === undefined || c === undefined) throw new Error('Invalid Base45 character.');
    const value = a + 45 * b + 2025 * c;
    if (value > 65535) throw new Error('Invalid Base45 triplet.');
    output.push((value >> 8) & 0xff, value & 0xff);
    index += 3;
  }
  if (index < text.length) {
    if (index + 1 >= text.length) throw new Error('Invalid final Base45 group.');
    const a = values.get(text[index]);
    const b = values.get(text[index + 1]);
    if (a === undefined || b === undefined) throw new Error('Invalid Base45 character.');
    const value = a + 45 * b;
    if (value > 255) throw new Error('Invalid final Base45 pair.');
    output.push(value);
  }
  return new Uint8Array(output);
}
