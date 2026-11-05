import type { PhotoAsset } from '../../core';

interface Props {
  assets: PhotoAsset[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

export function AssetList({ assets, selectedId, onSelect }: Props) {
  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white" data-testid="asset-list">
      {assets.length === 0 && <p className="p-4 text-xs text-neutral-500">点击「导入」添加 RAW / JPG 文件</p>}
      {assets.map((a) => (
        <button
          key={a.id}
          type="button"
          data-testid="asset-item"
          data-status={a.status}
          data-load-ms={a.loadMs?.toFixed(0)}
          onClick={() => onSelect(a.id)}
          className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${a.id === selectedId ? 'bg-blue-600 text-white' : 'hover:bg-neutral-100'}`}
        >
          <div className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-neutral-200">
            {a.previewUrl ? <img src={a.previewUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-[10px]">{a.status === 'error' ? '!' : '…'}</span>}
          </div>
          <div className="min-w-0">
            <div className="truncate">{a.name}</div>
            <div className="opacity-70">{a.status === 'error' ? a.error : a.name.split('.').pop()?.toUpperCase()}</div>
          </div>
        </button>
      ))}
    </aside>
  );
}
