// related files:
// - web/frontend/src/features/requests/components/PageFileDropZone.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferFileDropTarget.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferFilePane.tsx

type WebkitFileSystemEntry = {
  isFile: boolean;
  isDirectory: boolean;
  file?: (callback: (file: File) => void) => void;
  createReader?: () => {
    readEntries: (callback: (entries: WebkitFileSystemEntry[]) => void) => void;
  };
};

type DataTransferItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => WebkitFileSystemEntry | null;
};

export const dataTransferHasFiles = (
  event: Pick<DragEvent, "dataTransfer"> | { dataTransfer: DataTransfer | null },
) => {
  const types = Array.from(event.dataTransfer?.types || []);
  return types.includes("Files");
};

export const dedupeFiles = (input: File[]) => {
  const map = new Map<string, File>();
  for (const file of input) {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (!map.has(key)) map.set(key, file);
  }
  return [...map.values()];
};

const readAllEntries = async (reader: {
  readEntries: (callback: (entries: WebkitFileSystemEntry[]) => void) => void;
}): Promise<WebkitFileSystemEntry[]> => {
  const all: WebkitFileSystemEntry[] = [];

  while (true) {
    const chunk = await new Promise<WebkitFileSystemEntry[]>((resolve) => {
      reader.readEntries((entries) => resolve(entries || []));
    });
    if (!chunk.length) break;
    all.push(...chunk);
  }

  return all;
};

const traverseDroppedEntry = async (
  entry: WebkitFileSystemEntry,
): Promise<File[]> => {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File | null>((resolve) => {
      try {
        entry.file?.((f) => resolve(f));
      } catch {
        resolve(null);
      }
    });
    return file ? [file] : [];
  }

  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const entries = await readAllEntries(reader);
    const nested = await Promise.all(entries.map((child) => traverseDroppedEntry(child)));
    return nested.flat();
  }

  return [];
};

/** DataTransfer에서 파일(폴더 포함)을 추출. Page/Element 드롭존 공통. */
export const extractDroppedFiles = async (
  droppedItems: DataTransferItem[],
  droppedDirectFiles: File[],
) => {
  const items = Array.from(droppedItems || []);

  if (!items.length) {
    return dedupeFiles(Array.from(droppedDirectFiles || []));
  }

  const all: File[] = [];

  for (const item of items) {
    const withHandle = item as DataTransferItem & {
      getAsFileSystemHandle?: () => Promise<unknown>;
    };
    if (typeof withHandle.getAsFileSystemHandle === "function") {
      try {
        const handle = await withHandle.getAsFileSystemHandle();
        if (
          handle &&
          (handle as { kind?: string }).kind === "file" &&
          typeof (handle as { getFile?: () => Promise<File> }).getFile === "function"
        ) {
          const file = await (handle as { getFile: () => Promise<File> }).getFile();
          if (file) {
            all.push(file);
            continue;
          }
        }
      } catch {
        // fallback to webkit/dataTransfer path
      }
    }

    const withEntry = item as DataTransferItemWithEntry;
    const entry = withEntry.webkitGetAsEntry?.();
    if (entry) {
      const filesFromEntry = await traverseDroppedEntry(entry);
      all.push(...filesFromEntry);
      continue;
    }
    const file = item.getAsFile();
    if (file) all.push(file);
  }

  const directFiles = Array.from(droppedDirectFiles || []);
  return dedupeFiles([...all, ...directFiles]);
};
