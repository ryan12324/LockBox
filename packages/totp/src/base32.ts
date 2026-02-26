/**
 * RFC 4648 Base32 encoding/decoding
 * https://www.rfc-editor.org/rfc/rfc4648
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Decode a base32-encoded string to Uint8Array
 */
export function base32Decode(str: string): Uint8Array {
  // Remove padding and convert to uppercase
  const input = str.toUpperCase().replace(/=/g, '');
  
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
