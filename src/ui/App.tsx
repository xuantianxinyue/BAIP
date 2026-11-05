import { useState } from 'react';
import { AssetList } from './components/AssetList';
import { ExifPanel } from './components/ExifPanel';
import { ImportButton } from './components/ImportButton';
import { PreviewPane } from './components/PreviewPane';
import { SelfTestDialog } from './components/SelfTestDialog';
import { useLibrary } from './useLibrary';

export function App() {
  const { assets, importFiles } = useLibrary();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selfTestOpen, setSelfTestOpen] = useState(false);
  const selected = assets.find((a) => a.id === selectedId) ?? assets[0];

  return (
    <div className="flex h-full flex-col bg-neutral-100 text-neutral-900">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2">
        <h1 className="text-sm font-semibold">RAW AI 批处理</h1>
        <div className="flex gap-2">
          <ImportButton onFiles={importFiles} />
          <button
            type="button"
            data-testid="selftest-button"
            className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
            onClick={() => setSelfTestOpen(true)}
          >
            环境自检
          </button>
        </div>
      </header>
      <main className="flex min-h-0 flex-1">
        <AssetList assets={assets} selectedId={selected?.id} onSelect={setSelectedId} />
        <PreviewPane asset={selected} />
        <ExifPanel asset={selected} />
      </main>
      {selfTestOpen && <SelfTestDialog onClose={() => setSelfTestOpen(false)} />}
    </div>
  );
}
