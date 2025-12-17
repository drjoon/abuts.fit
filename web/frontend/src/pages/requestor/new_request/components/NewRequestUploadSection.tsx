import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

type Props = {
  isDragOver: boolean;
  highlight: boolean;
  sectionHighlightClass: string;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFilesSelected: (files: File[]) => void;
};

export function NewRequestUploadSection({
  isDragOver,
  highlight,
  sectionHighlightClass,
  onDragOver,
  onDragLeave,
  onDrop,
  onFilesSelected,
}: Props) {
  return (
    <div className="mb-4 lg:mb-0 mr-4">
      <div
        className={`relative flex flex-col rounded-2xl border-2 border-gray-300 p-1 md:p-1 transition-shadow hover:shadow-md ${
          highlight ? sectionHighlightClass : ""
        }`}
      >
        <div
          className={`border-2 border-dashed rounded-2xl p-4 md:p-6 text-center transition-colors ${
            isDragOver
              ? "border-primary bg-primary/5"
              : highlight
              ? "border-gray-300 hover:border-primary/50 bg-primary/5"
              : "border-gray-300 hover:border-primary/50 bg-white"
          }`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          커스텀 어벗 STL 파일 드롭
          <p className="text-base md:text-lg font-medium mb-2"></p>
          <Button
            variant="outline"
            className="text-xs md:text-sm"
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <Upload className="h-6 md:h-8 w-6 md:w-8 mx-auto text-muted-foreground" />{" "}
            파일 선택
          </Button>
          <p className="text-xs md:text-sm text-muted-foreground mt-2">
            치과이름, 환자이름, 치아번호가 순서대로 포함된 파일명으로
            업로드하시면 환자 정보가 자동으로 채워집니다.
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
