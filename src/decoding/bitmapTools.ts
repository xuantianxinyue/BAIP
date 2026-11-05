/** Downscales a bitmap so its long edge is at most `maxPixelSize`, closing the original. */
export async function fitBitmap(bitmap: ImageBitmap, maxPixelSize: number): Promise<ImageBitmap> {
  const scale = maxPixelSize / Math.max(bitmap.width, bitmap.height);
  if (scale >= 1) return bitmap;
  const resized = await createImageBitmap(bitmap, {
    resizeWidth: Math.round(bitmap.width * scale),
    resizeHeight: Math.round(bitmap.height * scale),
    resizeQuality: 'high',
  });
  bitmap.close();
  return resized;
}

/** Rotates a bitmap clockwise by 90/180/270°, closing the original. */
export async function rotateBitmap(bitmap: ImageBitmap, degrees: 0 | 90 | 180 | 270): Promise<ImageBitmap> {
  if (degrees === 0) return bitmap;
  const swap = degrees !== 180;
  const canvas = new OffscreenCanvas(swap ? bitmap.height : bitmap.width, swap ? bitmap.width : bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();
  return canvas.transferToImageBitmap();
}
