import { formatExposure, megapixels, type PhotoAsset } from '../../core';

export function ExifPanel({ asset }: { asset?: PhotoAsset }) {
  const e = asset?.exif;
  const rows: [string, string | undefined][] = e
    ? [
        ['相机', [e.cameraMake, e.cameraModel].filter(Boolean).join(' ') || undefined],
        ['镜头', e.lensModel],
        ['ISO', e.iso?.toString()],
        ['快门', formatExposure(e.exposureTime)],
        ['光圈', e.aperture ? `f/${Number(e.aperture.toFixed(1))}` : undefined],
        ['焦距', e.focalLength ? `${Math.round(e.focalLength)} mm` : undefined],
        ['尺寸', `${e.width} × ${e.height} (${megapixels(e).toFixed(1)} MP)`],
        ['拍摄时间', e.captureDate?.toLocaleString('zh-CN')],
      ]
    : [];
  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l border-neutral-200 bg-white p-4" data-testid="exif-panel">
      <h2 className="mb-2 text-xs font-semibold text-neutral-500">EXIF</h2>
      {!e && <p className="text-xs text-neutral-500">—</p>}
      <dl className="space-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2" data-testid={`exif-${k}`}>
            <dt className="text-neutral-500">{k}</dt>
            <dd className="text-right">{v ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
