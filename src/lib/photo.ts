// Helpers pour upload local de photos (stockage base64 dans IndexedDB).
// Pas d'URL externe.

export async function fileToDataUrl(file: File, maxDim = 1600, quality = 0.82): Promise<string> {
  // Compression côté client : ramène à maxDim px et JPEG quality.
  const bitmap = await createImageBitmapSafe(file);
  const { width, height } = bitmap;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return dataUrl;
}

async function createImageBitmapSafe(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try { return await createImageBitmap(file); } catch {}
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.onload = () => resolve(img); img.onerror = reject; img.src = String(reader.result); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
