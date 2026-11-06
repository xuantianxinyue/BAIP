import { classifyFile, extensionOf, type ImageKind } from './imageFormat';
import type { PhotoAsset } from './photoAsset';

export type SortKey = 'captureDate' | 'name';
export type SortDirection = 'asc' | 'desc';

export interface Arrangement {
  sortKey: SortKey;
  direction: SortDirection;
  groupByFormat: boolean;
}

export const DEFAULT_ARRANGEMENT: Arrangement = { sortKey: 'captureDate', direction: 'asc', groupByFormat: false };

export interface AssetGroup {
  /** Format label such as "NEF" or "JPG"; null when grouping is off. */
  format: string | null;
  assets: PhotoAsset[];
}

type FileIdentity = Pick<File, 'name' | 'size' | 'lastModified'>;

/** Identity used for de-duplication: same name, size and modification time = same file. */
export function fileKey(file: FileIdentity): string {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
}

export interface ImportPlan<F extends FileIdentity> {
  accepted: { file: F; kind: ImageKind; key: string }[];
  /** Files with an unsupported extension, or hidden files such as macOS `._*` sidecars. */
  unsupported: number;
  /** Files already in the library or repeated within this import. */
  duplicates: number;
}

/** Decides which files of an import enter the library. Unsupported files are dropped, never listed. */
export function planImport<F extends FileIdentity>(files: Iterable<F>, existingKeys: ReadonlySet<string>): ImportPlan<F> {
  const plan: ImportPlan<F> = { accepted: [], unsupported: 0, duplicates: 0 };
  const seen = new Set(existingKeys);
  for (const file of files) {
    const kind = file.name.startsWith('.') ? null : classifyFile(file.name);
    if (!kind) {
      plan.unsupported++;
      continue;
    }
    const key = fileKey(file);
    if (seen.has(key)) {
      plan.duplicates++;
      continue;
    }
    seen.add(key);
    plan.accepted.push({ file, kind, key });
  }
  return plan;
}

export function importSummary(plan: { accepted: unknown[]; unsupported: number; duplicates: number }): string {
  const parts = [plan.accepted.length > 0 ? `导入 ${plan.accepted.length} 张` : '没有可导入的新照片'];
  if (plan.unsupported > 0) parts.push(`跳过 ${plan.unsupported} 个不支持的文件`);
  if (plan.duplicates > 0) parts.push(`${plan.duplicates} 个重复`);
  return parts.join(' · ');
}

/** Group label for a file name: upper-case extension, with JPEG folded into JPG. */
export function formatGroupOf(fileName: string): string {
  const ext = extensionOf(fileName).toUpperCase();
  return ext === 'JPEG' ? 'JPG' : ext;
}

const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

/**
 * Orders two assets. Assets without a capture date always sort last (in both directions);
 * ties fall back to the file name, ascending.
 */
export function compareAssets(a: PhotoAsset, b: PhotoAsset, sortKey: SortKey, direction: SortDirection): number {
  const sign = direction === 'asc' ? 1 : -1;
  if (sortKey === 'captureDate') {
    const ta = a.exif?.captureDate?.getTime();
    const tb = b.exif?.captureDate?.getTime();
    if (ta !== undefined && tb !== undefined && ta !== tb) return sign * (ta - tb);
    if (ta === undefined && tb !== undefined) return 1;
    if (ta !== undefined && tb === undefined) return -1;
    return collator.compare(a.name, b.name);
  }
  return sign * collator.compare(a.name, b.name) || 0;
}

/** RAW formats alphabetically first, then the bitmap formats in a fixed order. */
const BITMAP_GROUP_ORDER = ['JPG', 'PNG'];

function compareGroups(a: { format: string; kind: ImageKind }, b: { format: string; kind: ImageKind }): number {
  if (a.kind !== b.kind) return a.kind === 'raw' ? -1 : 1;
  if (a.kind === 'bitmap') return BITMAP_GROUP_ORDER.indexOf(a.format) - BITMAP_GROUP_ORDER.indexOf(b.format);
  return a.format.localeCompare(b.format);
}

/** Sorts (and optionally groups) the library. `order` is the flat display order used for navigation and range selection. */
export function arrangeAssets(assets: readonly PhotoAsset[], arrangement: Arrangement): { groups: AssetGroup[]; order: PhotoAsset[] } {
  const sorted = [...assets].sort((a, b) => compareAssets(a, b, arrangement.sortKey, arrangement.direction));
  if (!arrangement.groupByFormat) return { groups: [{ format: null, assets: sorted }], order: sorted };
  const byFormat = new Map<string, { format: string; kind: ImageKind; assets: PhotoAsset[] }>();
  for (const asset of sorted) {
    const format = formatGroupOf(asset.name);
    let group = byFormat.get(format);
    if (!group) byFormat.set(format, (group = { format, kind: asset.kind, assets: [] }));
    group.assets.push(asset);
  }
  const groups = [...byFormat.values()].sort(compareGroups).map(({ format, assets }) => ({ format, assets }));
  return { groups, order: groups.flatMap((g) => g.assets) };
}

/** Ids from `fromId` to `toId` inclusive, in display order (either direction). */
export function rangeIds(order: readonly string[], fromId: string, toId: string): string[] {
  const a = order.indexOf(fromId);
  const b = order.indexOf(toId);
  if (a < 0 || b < 0) return b < 0 ? [] : [toId];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/** The asset to show after removing `removed`: the next remaining one after `currentId`, else the previous one. */
export function neighborAfterRemoval(order: readonly string[], currentId: string | undefined, removed: ReadonlySet<string>): string | undefined {
  if (currentId !== undefined && !removed.has(currentId) && order.includes(currentId)) return currentId;
  const at = currentId === undefined ? -1 : order.indexOf(currentId);
  for (let i = at + 1; i < order.length; i++) if (!removed.has(order[i])) return order[i];
  for (let i = Math.min(at, order.length) - 1; i >= 0; i--) if (!removed.has(order[i])) return order[i];
  return order.find((id) => !removed.has(id));
}
