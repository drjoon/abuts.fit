import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

type Props = {
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFilesSelected: (files: File[]) => void;
};

export function NewRequestUploadSection({
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFilesSelected,
}: Props) {
  return (
    <div className="w-full">
      <div
        className={`app-glass-card app-glass-card--lg relative flex flex-col border-2 border-gray-300 p-2 md:p-2`}
      >
        <div
          className={`border-2 border-dashed rounded-2xl p-4 md:p-6 text-center transition-colors ${
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-gray-300 hover:border-primary/50 bg-white"
          }`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <Button
            variant="outline"
            className="text-xs md:text-sm"
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <Upload className="h-6 md:h-8 w-6 md:w-8 mx-auto text-muted-foreground" />{" "}
            커스텀 어벗 STL 파일 드롭
          </Button>
          <p className="text-xs md:text-sm text-muted-foreground mt-2">
            파일명에서 치과이름, 환자이름, 치아번호를 자동 인식합니다.
          </p>
          <input
            id="file-input"
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const fileList = e.currentTarget.files;
              if (fileList) {
                onFilesSelected(Array.from(fileList));
              }
              e.currentTarget.value = "";
            }}
            accept=".stl"
          />
        </div>
      </div>
    </div>
  );
}
