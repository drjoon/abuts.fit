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

      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length > 0) {
        onFilesRef.current(files);
      }
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
