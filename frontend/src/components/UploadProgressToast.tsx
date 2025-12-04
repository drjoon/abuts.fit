import React from "react";

interface UploadProgressToastProps {
  progress: number; // 0~100
  label?: string;
}

export const UploadProgressToast: React.FC<UploadProgressToastProps> = ({
  progress,
  label = "파일 업로드 중...",
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className="space-y-2 w-64">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{clamped}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
};
