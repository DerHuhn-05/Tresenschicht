import { PHOTO_MAX_SIDE, PHOTO_TARGET_BYTES } from './rules';

// G3: Foto auf dem Gerät verkleinern. Das Neu-Kodieren über Canvas entfernt auch die EXIF-Daten (GPS).
export async function shrinkPhoto(file: Blob, maxSide = PHOTO_MAX_SIDE): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  let quality = 0.82;
  let blob = await toBlob(canvas, quality);
  while (blob.size > PHOTO_TARGET_BYTES && quality > 0.5) {
    quality -= 0.08;
    blob = await toBlob(canvas, quality);
  }
  return blob;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht verkleinert werden.'))), 'image/jpeg', quality)
  );
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
