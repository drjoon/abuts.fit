import { useState } from "react";
import { FileIcon, Download, X, ZoomIn } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Attachment {
  fileName: string;
  fileType: string;
  fileSize: number;
  s3Key: string;
  s3Url: string;
}

interface MessageAttachmentProps {
  attachment: Attachment;
  onDownload?: () => void;
}

export function MessageAttachment({
  attachment,
  onDownload,
}: MessageAttachmentProps) {
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const isImage = attachment.fileType?.startsWith("image/");

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = attachment.s3Url;
    link.download = attachment.fileName;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onDownload?.();
  };

  if (isImage) {
    return (
      <>
        <div className="relative group inline-block max-w-xs rounded-lg overflow-hidden border border-gray-200">
          <img
            src={attachment.s3Url}
            alt={attachment.fileName}
            className="w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setImagePreviewOpen(true)}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <Button
              size="sm"
              variant="secondary"
              className="mr-2"
              onClick={() => setImagePreviewOpen(true)}
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="secondary" onClick={handleDownload}>
              <Download className="w-4 h-4" />
            </Button>
          </div>
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <p className="truncate">{attachment.fileName}</p>
            <p className="text-gray-300">
              {formatFileSize(attachment.fileSize)}
            </p>
          </div>
        </div>

        <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span className="truncate mr-4">{attachment.fileName}</span>
                <Button size="sm" variant="outline" onClick={handleDownload}>
                  <Download className="w-4 h-4 mr-2" />
                  다운로드
                </Button>
              </DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center bg-gray-100 rounded-lg p-4">
              <img
                src={attachment.s3Url}
                alt={attachment.fileName}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 max-w-xs hover:bg-gray-100 transition-colors">
      <FileIcon className="w-8 h-8 text-blue-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {attachment.fileName}
        </p>
        <p className="text-xs text-gray-500">
          {formatFileSize(attachment.fileSize)}
        </p>
      </div>
      <Button size="sm" variant="ghost" onClick={handleDownload}>
        <Download className="w-4 h-4" />
      </Button>
    </div>
  );
}
