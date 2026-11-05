import type { PhotoAsset } from '../../core';

export function PreviewPane({ asset }: { asset?: PhotoAsset }) {
  return (
    <section className="flex min-w-0 flex-1 items-center justify-center p-4">
      {!asset && <p className="text-sm text-neutral-500">未选择照片</p>}
      {asset?.status === 'loading' && <p className="text-sm text-neutral-500">读取中…</p>}
      {asset?.status === 'error' && <p className="text-sm text-red-600">{asset.error}</p>}
      {asset?.previewUrl && <img data-testid="preview-image" src={asset.previewUrl} alt={asset.name} className="max-h-full max-w-full object-contain shadow" />}
    </section>
  );
}
