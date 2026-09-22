import jsQR from 'jsqr';
import { ITEM_QR_PREFIX, decodeItemQrPayload } from '../../shared/itemQr.js';

/*
  Local QR reading for the scanner page. Every pixel is decoded in the browser with the bundled jsQR,
  so neither camera frames nor selected images ever leave the device, and no native
  BarcodeDetector support is required.
*/

// Large photos are scaled down first: a label still decodes, and a 12 MP image stays fast.
const MAX_IMAGE_SIDE = 1600;

// Reads the text of the first QR code in a drawable source, or returns null when there is none.
export function decodeQrFrom(source, width, height, canvas = document.createElement('canvas'), thorough = false) {
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  // Live frames skip inverted codes to stay light; a single chosen image can afford both passes.
  const code = jsQR(data, canvas.width, canvas.height, { inversionAttempts: thorough ? 'attemptBoth' : 'dontInvert' });
  return code ? code.data : null;
}

export async function decodeQrFromFile(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('This file could not be read as an image.');
  }
  try {
    return decodeQrFrom(bitmap, bitmap.width, bitmap.height, undefined, true);
  } finally {
    bitmap.close();
  }
}

// Turns scanned text into { uuid } or { error } with the message the scanner shows.
export function readScannedText(text) {
  try {
    return { uuid: decodeItemQrPayload(text) };
  } catch {
    const ours = String(text).trim().startsWith(`${ITEM_QR_PREFIX}:`);
    return {
      error: ours
        ? 'This Inventory Atlas QR code is invalid or uses an unsupported format.'
        : 'This is not an Inventory Atlas QR code.'
    };
  }
}
