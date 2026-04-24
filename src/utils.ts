export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nowMs(): number {
  return Date.now();
}

export function shortId(publicKey: string): string {
  return publicKey.substring(0, 16);
}

export function isValidHex(str: string, expectedLength?: number): boolean {
  if (expectedLength !== undefined && str.length !== expectedLength) {
    return false;
  }
  return /^[0-9a-f]+$/.test(str);
}
