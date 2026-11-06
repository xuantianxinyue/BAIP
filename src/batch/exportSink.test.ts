import { describe, expect, it } from 'vitest';
import type { ProcessedPhoto } from './batch';
import { DirectorySink, uniqueName, type DirectoryLike } from './exportSink';

const photo = (fileName: string, content = 'x'): ProcessedPhoto => ({ fileName, blob: new Blob([content]), width: 1, height: 1, timings: { decode: 0, encode: 0, total: 0 } });

function memoryDirectory() {
  const files = new Map<string, Blob>();
  const directory: DirectoryLike = {
    async getFileHandle(name, options) {
      if (!files.has(name) && !options?.create) throw new DOMException('missing', 'NotFoundError');
      return { createWritable: async () => ({ write: async (data) => void files.set(name, data), close: async () => {} }) };
    },
  };
  return { directory, files };
}

describe('exportFileName collisions', () => {
  it('numbers names that exist', async () => {
    const taken = new Set(['a.jpg', 'a (1).jpg']);
    expect(await uniqueName('a.jpg', async (n) => taken.has(n))).toBe('a (2).jpg');
    expect(await uniqueName('b.jpg', async (n) => taken.has(n))).toBe('b.jpg');
  });
});

describe('DirectorySink', () => {
  it('never overwrites an existing file', async () => {
    const { directory, files } = memoryDirectory();
    const sink = new DirectorySink(directory);
    await sink.write(photo('a.jpg', 'first'));
    await sink.write(photo('a.jpg', 'second'));
    expect([...files.keys()]).toEqual(['a.jpg', 'a (1).jpg']);
    expect(await files.get('a.jpg')!.text()).toBe('first');
  });

  it('surfaces errors other than a missing file', async () => {
    const directory: DirectoryLike = { getFileHandle: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) };
    await expect(new DirectorySink(directory).write(photo('a.jpg'))).rejects.toThrow('denied');
  });
});
