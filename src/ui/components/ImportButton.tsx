import { useRef } from 'react';
import { ACCEPT_ATTRIBUTE } from '../../core';

export function ImportButton({ onFiles }: { onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
        onClick={() => input.current?.click()}
      >
        导入
      </button>
      <input
        ref={input}
        data-testid="file-input"
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
    </>
  );
}
