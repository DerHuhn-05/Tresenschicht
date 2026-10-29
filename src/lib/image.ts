import { AVATAR_MAX_SIDE, AVATAR_TARGET_BYTES, PHOTO_MAX_SIDE, PHOTO_TARGET_BYTES } from './rules';

// G3: Foto auf dem Gerät verkleinern. Das Neu-Kodieren über Canvas entfernt auch die EXIF-Daten (GPS).
// So klein wie möglich, ohne dass es pixelig wirkt: erst in Stufen sauber herunterrechnen (kein Treppeneffekt),
// dann die JPEG-Qualität senken, aber nie unter MIN_QUALITY. Reicht das nicht, wird das Bild etwas kleiner.
const MIN_QUALITY = 0.62; // darunter werden Blockartefakte sichtbar
const MIN_SIDE = 900; // kleiner als das wirkt ein Foto auf dem iPhone unscharf

export async function shrinkPhoto(file: Blob, kind: 'photo' | 'avatar' = 'photo'): Promise<Blob> {
  const maxSide = kind === 'avatar' ? AVATAR_MAX_SIDE : PHOTO_MAX_SIDE;
  const target = kind === 'avatar' ? AVATAR_TARGET_BYTES : PHOTO_TARGET_BYTES;
  const minSide = kind === 'avatar' ? AVATAR_MAX_SIDE : MIN_SIDE;
  const bitmap = await createImageBitmap(file);
  let side = Math.min(maxSide, Math.max(bitmap.width, bitmap.height));
  let best: Blob | null = null;
  try {
    for (;;) {
      const canvas = resize(bitmap, side);
      for (let q = 0.8; q >= MIN_QUALITY - 0.001; q -= 0.06) {
        const blob = await toBlob(canvas, q);
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= target) return blob;
      }
      if (side <= minSide) return best!;
      side = Math.max(minSide, Math.round(side * 0.85));
    }
  } finally {
    bitmap.close();
  }
}

/** In Halbierungsschritten auf die Zielgröße rechnen: schärfer und ohne Treppen als ein einziger großer Sprung. */
function resize(bitmap: ImageBitmap, side: number): HTMLCanvasElement {
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  let src: CanvasImageSource = bitmap;
  let sw = bitmap.width;
  let sh = bitmap.height;
  while (sw / 2 >= w && sh / 2 >= h) {
    const step = canvasOf(Math.round(sw / 2), Math.round(sh / 2));
    draw(step, src);
    src = step;
    sw = step.width;
    sh = step.height;
  }
  const out = canvasOf(w, h);
  draw(out, src);
  return out;
}

function canvasOf(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function draw(c: HTMLCanvasElement, src: CanvasImageSource) {
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
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
