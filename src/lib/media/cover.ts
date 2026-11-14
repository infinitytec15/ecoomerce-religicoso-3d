/** Center-crops an image to a square and re-encodes it as a small WebP cover. */
export async function squareCover(file: File, size = 320): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Não foi possível ler a imagem. Use JPG, PNG ou WebP.');
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height),
      canvas = document.createElement('canvas'),
      context = canvas.getContext('2d');
    canvas.width = size;
    canvas.height = size;
    if (!context) throw new Error('Não foi possível preparar a capa.');
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85),
    );
    if (!blob) throw new Error('Não foi possível preparar a capa.');
    const base = file.name.replace(/\.[^.]+$/, '') || 'capa',
      type = blob.type || 'image/webp',
      extension = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : 'webp';
    return new File([blob], `${base}.${extension}`, { type });
  } finally {
    bitmap.close?.();
  }
}
