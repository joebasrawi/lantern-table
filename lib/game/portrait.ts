import { GameError } from './engine';
export const MAX_PORTRAIT_BYTES = 512 * 1024;
const ascii = (u: Uint8Array, a: number, b: number) =>
  String.fromCharCode(...u.slice(a, b));
/** Read dimensions without decoding untrusted image data in the worker. SVG and animated WebP are not accepted. */
export function inspectPortrait(data: ArrayBuffer, declaredType: string) {
  const u = new Uint8Array(data),
    v = new DataView(data);
  let type = '',
    width = 0,
    height = 0;
  if (u.length > MAX_PORTRAIT_BYTES)
    throw new GameError('Images must be smaller than 512 KB.', 413);
  if (u.length < 24) throw new GameError('That file is not a supported image.');
  if (
    u[0] === 137 &&
    ascii(u, 1, 4) === 'PNG' &&
    u[4] === 13 &&
    u[5] === 10 &&
    u[6] === 26 &&
    u[7] === 10 &&
    ascii(u, 12, 16) === 'IHDR'
  ) {
    type = 'image/png';
    width = v.getUint32(16);
    height = v.getUint32(20);
  } else if (u[0] === 255 && u[1] === 216) {
    type = 'image/jpeg';
    let pos = 2;
    while (pos + 9 < u.length) {
      if (u[pos] !== 255) break;
      const marker = u[pos + 1];
      if (marker === 218 || marker === 217) break;
      const length = v.getUint16(pos + 2);
      if (length < 2 || pos + 2 + length > u.length) break;
      if ([192, 193, 194].includes(marker)) {
        height = v.getUint16(pos + 5);
        width = v.getUint16(pos + 7);
        break;
      }
      pos += length + 2;
    }
  } else if (
    ascii(u, 0, 4) === 'RIFF' &&
    ascii(u, 8, 12) === 'WEBP' &&
    v.getUint32(4, true) + 8 === u.length
  ) {
    type = 'image/webp';
    const chunk = ascii(u, 12, 16);
    if (
      chunk === 'VP8 ' &&
      u.length >= 30 &&
      u[23] === 157 &&
      u[24] === 1 &&
      u[25] === 42
    ) {
      width = v.getUint16(26, true) & 16383;
      height = v.getUint16(28, true) & 16383;
    } else if (chunk === 'VP8L' && u.length >= 25 && u[20] === 47) {
      const bits = v.getUint32(21, true);
      width = (bits & 16383) + 1;
      height = ((bits >>> 14) & 16383) + 1;
    } else if (chunk === 'VP8X' && u.length >= 30 && (u[20] & 2) === 0) {
      width = 1 + u[24] + (u[25] << 8) + (u[26] << 16);
      height = 1 + u[27] + (u[28] << 8) + (u[29] << 16);
    }
  }
  if (
    type !== declaredType ||
    width < 16 ||
    height < 16 ||
    width > 2048 ||
    height > 2048
  )
    throw new GameError(
      'Use a JPG, PNG, or still WebP between 16 and 2048 pixels.',
    );
  return { type, width, height };
}
