'use client';

import { useRef, type ChangeEvent } from 'react';
import { ACCEPT_ATTRIBUTE } from '../../core';

/** "导入文件" and "导入文件夹" (with sub-folders, via `webkitdirectory`). Files are never modified. */
export function ImportButtons({ onFiles }: { onFiles: (files: File[]) => void }) {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) onFiles(Array.from(e.target.files));
    e.target.value = '';
  };
  return (
    <>
      <button type="button" className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700" onClick={() => files.current?.click()}>
        导入文件
      </button>
      <button type="button" className="rounded border border-blue-600 px-3 py-1 text-sm text-blue-700 hover:bg-blue-50" onClick={() => folder.current?.click()}>
        导入文件夹
      </button>
      <input ref={files} data-testid="file-input" type="file" multiple accept={ACCEPT_ATTRIBUTE} className="hidden" onChange={onChange} />
      <input ref={folder} data-testid="folder-input" type="file" multiple className="hidden" onChange={onChange} {...{ webkitdirectory: '' }} />
    </>
  );
}
