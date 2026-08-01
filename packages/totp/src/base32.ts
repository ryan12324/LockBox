/**
 * RFC 4648 Base32 encoding/decoding
 * https://www.rfc-editor.org/rfc/rfc4648
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Decode a base32-encoded string to Uint8Array
 */
export function base32Decode(str: string): Uint8Array {
  // Accept the common grouped presentation used by authenticator setup pages,
  // while still rejecting misplaced padding and non-Base32 characters.
  const compact = str.trim().toUpperCase().replace(/[\s-]+/g, '');
  if (!compact) {
    throw new Error('Base32 secret must not be empty');
  }
  if (compact.length > 4096 || !/^[A-Z2-7]+=*$/.test(compact)) {
    throw new Error('Invalid base32 secret');
  }

  // Padding carries no secret bits. Some older importers and QR exporters add
  // the wrong number of trailing '=' characters, so accept and canonicalize
  // trailing padding while still rejecting '=' in the middle of a key.
  const input = compact.replace(/=+$/, '');
  if ([1, 3, 6].includes(input.length % 8)) {
    throw new Error('Invalid base32 length');
  }
  
  const bytes: number[] = [];
  let buffer = 0;
  let bufferLength = 0;
  
  for (let i = 0; i < input.length; i++) {
    const index = ALPHABET.indexOf(input[i]);
    if (index === -1) {
      throw new Error(`Invalid base32 character: ${input[i]}`);
    }
    
    // Add 5 bits to buffer
    buffer = (buffer << 5) | index;
    bufferLength += 5;
    
    // Extract complete bytes
    if (bufferLength >= 8) {
      bufferLength -= 8;
      bytes.push((buffer >> bufferLength) & 0xff);
    }
  }
  
  return new Uint8Array(bytes);
}

/**
 * Encode a Uint8Array to base32 string
 */
export function base32Encode(bytes: Uint8Array): string {
  if (bytes.byteLength === 0) {
    throw new Error('Base32 input must not be empty');
  }
  let result = '';
  let buffer = 0;
  let bufferLength = 0;
  
  for (let i = 0; i < bytes.length; i++) {
    // Add byte to buffer
    buffer = (buffer << 8) | bytes[i];
    bufferLength += 8;
    
    // Extract complete 5-bit groups
    while (bufferLength >= 5) {
      bufferLength -= 5;
      result += ALPHABET[(buffer >> bufferLength) & 0x1f];
    }
  }
  
  // Handle remaining bits
  if (bufferLength > 0) {
    result += ALPHABET[(buffer << (5 - bufferLength)) & 0x1f];
  }
  
  // Add padding
  const padding = (8 - (result.length % 8)) % 8;
  result += '='.repeat(padding);
  
  return result;
}
