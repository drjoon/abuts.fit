import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/ui/cn";

type PageFileDropZoneChildren =
  | ReactNode
  | ((state: { isDragActive: boolean }) => ReactNode);

type PageFileDropZoneProps = {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
  activeClassName?: string;
  children: PageFileDropZoneChildren;
};

const hasFiles = (event: DragEvent) => {
  const types = Array.from(event.dataTransfer?.types || []);
  return types.includes("Files");
};

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

const dedupeFiles = (input: File[]) => {
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

const extractDroppedFiles = async (dataTransfer: DataTransfer | null) => {
  if (!dataTransfer) return [];

  const items = Array.from(dataTransfer.items || []);

  if (!items.length) {
    return dedupeFiles(Array.from(dataTransfer.files || []));
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

  const directFiles = Array.from(dataTransfer.files || []);
  return dedupeFiles([...all, ...directFiles]);
};

export function PageFileDropZone({
  onFiles,
  disabled,
  className,
  activeClassName,
  children,
}: PageFileDropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounterRef = useRef(0);
  const onFilesRef = useRef(onFiles);

  useEffect(() => {
    onFilesRef.current = onFiles;
  }, [onFiles]);

  useEffect(() => {
    if (disabled) return;

    const handleDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragCounterRef.current += 1;
      setIsDragActive(true);
    };

    const handleDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
    };

    const handleDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragActive(false);
      }
    };

    const handleDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsDragActive(false);

      void (async () => {
        const files = await extractDroppedFiles(event.dataTransfer || null);
        if (files.length > 0) {
          onFilesRef.current(files);
        }
      })();
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [disabled]);

  const content = useMemo(() => {
    if (typeof children === "function") {
      return children({ isDragActive });
    }
    return children;
  }, [children, isDragActive]);

  return (
    <div
      className={cn(
        "relative",
        className,
        isDragActive ? activeClassName : undefined
      )}
    >
      {content}
    </div>
  );
}
