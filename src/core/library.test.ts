import { describe, expect, it } from 'vitest';
import { arrangeAssets, compareAssets, fileKey, formatGroupOf, importSummary, neighborAfterRemoval, planImport, rangeIds, type PhotoAsset } from './index';

const file = (name: string, size = 1, lastModified = 0) => ({ name, size, lastModified });

function asset(name: string, captureDate?: string): PhotoAsset {
  const kind = /\.(jpe?g|png)$/i.test(name) ? 'bitmap' : 'raw';
  return {
    id: name,
    name,
    key: name,
    kind,
    status: 'ready',
    file: undefined as unknown as File,
    exif: { width: 1, height: 1, orientation: 0, captureDate: captureDate ? new Date(captureDate) : undefined },
  };
}
const names = (list: PhotoAsset[]) => list.map((a) => a.name);

describe('planImport', () => {
  it('drops unsupported and hidden files and de-duplicates against the library and within the batch', () => {
    const existing = new Set([fileKey(file('a.NEF', 10, 5))]);
    const plan = planImport(
      [file('a.NEF', 10, 5), file('b.CR2'), file('b.CR2'), file('notes.txt'), file('IMG.xmp'), file('._b.CR2'), file('c.jpg'), file('a.NEF', 11, 5)],
      existing,
    );
    expect(plan.accepted.map((a) => [a.file.name, a.kind])).toEqual([
      ['b.CR2', 'raw'],
      ['c.jpg', 'bitmap'],
      ['a.NEF', 'raw'], // same name but different size → different file
    ]);
    expect(plan.unsupported).toBe(3);
    expect(plan.duplicates).toBe(2);
  });

  it('summarises an import', () => {
    expect(importSummary({ accepted: [1, 2], unsupported: 0, duplicates: 0 })).toBe('导入 2 张');
    expect(importSummary({ accepted: [1], unsupported: 13, duplicates: 3 })).toBe('导入 1 张 · 跳过 13 个不支持的文件 · 3 个重复');
    expect(importSummary({ accepted: [], unsupported: 0, duplicates: 4 })).toBe('没有可导入的新照片 · 4 个重复');
  });
});

describe('sorting and grouping', () => {
  const list = [asset('b.NEF', '2024-01-02T00:00:00Z'), asset('a10.CR2'), asset('a9.jpg', '2024-01-01T00:00:00Z'), asset('c.ARW', '2024-01-03T00:00:00Z'), asset('d.jpeg')];

  it('sorts by capture date with undated photos last in both directions', () => {
    expect(names(arrangeAssets(list, { sortKey: 'captureDate', direction: 'asc', groupByFormat: false }).order)).toEqual(['a9.jpg', 'b.NEF', 'c.ARW', 'a10.CR2', 'd.jpeg']);
    expect(names(arrangeAssets(list, { sortKey: 'captureDate', direction: 'desc', groupByFormat: false }).order)).toEqual(['c.ARW', 'b.NEF', 'a9.jpg', 'a10.CR2', 'd.jpeg']);
  });

  it('sorts names naturally', () => {
    expect(names(arrangeAssets(list, { sortKey: 'name', direction: 'asc', groupByFormat: false }).order)).toEqual(['a9.jpg', 'a10.CR2', 'b.NEF', 'c.ARW', 'd.jpeg']);
    expect(compareAssets(asset('x.NEF'), asset('X.nef'), 'name', 'desc')).toBe(0);
  });

  it('groups RAW formats alphabetically before JPG/PNG and sorts inside each group', () => {
    const more = [...list, asset('e.png'), asset('a.NEF', '2023-12-31T00:00:00Z')];
    const { groups, order } = arrangeAssets(more, { sortKey: 'captureDate', direction: 'asc', groupByFormat: true });
    expect(groups.map((g) => [g.format, names(g.assets)])).toEqual([
      ['ARW', ['c.ARW']],
      ['CR2', ['a10.CR2']],
      ['NEF', ['a.NEF', 'b.NEF']],
      ['JPG', ['a9.jpg', 'd.jpeg']],
      ['PNG', ['e.png']],
    ]);
    expect(names(order)).toEqual(['c.ARW', 'a10.CR2', 'a.NEF', 'b.NEF', 'a9.jpg', 'd.jpeg', 'e.png']);
    expect(formatGroupOf('x.JPEG')).toBe('JPG');
  });
});

describe('selection helpers', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  it('selects ranges in either direction', () => {
    expect(rangeIds(order, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(rangeIds(order, 'd', 'b')).toEqual(['b', 'c', 'd']);
    expect(rangeIds(order, 'x', 'c')).toEqual(['c']);
  });
  it('picks the next remaining photo after removal, else the previous one', () => {
    expect(neighborAfterRemoval(order, 'b', new Set(['b', 'c']))).toBe('d');
    expect(neighborAfterRemoval(order, 'e', new Set(['d', 'e']))).toBe('c');
    expect(neighborAfterRemoval(order, 'a', new Set(['c']))).toBe('a');
    expect(neighborAfterRemoval(order, 'a', new Set(order))).toBeUndefined();
  });
});
