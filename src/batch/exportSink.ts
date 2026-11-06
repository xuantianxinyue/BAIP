import type { ExportSink, ProcessedPhoto } from './batch';

/** `IMG.jpg`, then `IMG (1).jpg`, `IMG (2).jpg`, ...: a name that `exists` does not know. */
export async function uniqueName(fileName: string, exists: (name: string) => Promise<boolean>): Promise<string> {
  const dot = fileName.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [fileName.slice(0, dot), fileName.slice(dot)] : [fileName, ''];
  let name = fileName;
  for (let n = 1; await exists(name); n++) name = `${stem} (${n})${ext}`;
  return name;
}

/** The part of FileSystemDirectoryHandle used here. */
export interface DirectoryLike {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>;
}

/** Writes into a directory the user picked. Existing files are never overwritten. */
export class DirectorySink implements ExportSink {
  constructor(private readonly directory: DirectoryLike) {}

  async write(photo: ProcessedPhoto): Promise<void> {
    const exists = (name: string) =>
      this.directory.getFileHandle(name).then(
        () => true,
        (e: DOMException) => {
          if (e.name === 'NotFoundError') return false;
          throw e;
        },
      );
    const handle = await this.directory.getFileHandle(await uniqueName(photo.fileName, exists), { create: true });
    const writable = await handle.createWritable();
    await writable.write(photo.blob);
    await writable.close();
  }
}

/** Browser download, for browsers without directory access or pages that are not a secure context. */
export class DownloadSink implements ExportSink {
  async write(photo: ProcessedPhoto): Promise<void> {
    const url = URL.createObjectURL(photo.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = photo.fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
