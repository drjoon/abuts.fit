import { useMemo, useState } from "react";
import {
  createUploadUrl,
  sendMail,
  type MailAttachment,
} from "@/features/admin/mail/mailApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/shared/hooks/use-toast";
import { Paperclip, Send, X } from "lucide-react";
import { formatBytes } from "./mailUi";

type UploadingAttachment = {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  key?: string;
};

type Props = {
  onSent: () => void;
};

export const AdminMailComposePanel = ({ onSent }: Props) => {
  const { toast } = useToast();

  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<UploadingAttachment[]>([]);
  const [sending, setSending] = useState(false);

  const pendingUploads = useMemo(
    () =>
      attachments.some(
        (a) => a.status === "uploading" || a.status === "pending"
      ),
    [attachments]
  );

  const normalizedTo = useMemo(
    () =>
      to
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    [to]
  );

  const parsedAttachments: MailAttachment[] = useMemo(
    () =>
      attachments
        .filter((a) => a.status === "done" && a.key)
        .map((a) => ({
          filename: a.file.name,
          contentType: a.file.type,
          size: a.file.size,
          s3Key: a.key,
        })),
    [attachments]
  );

  const removeUploadingAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;

    const newItems: UploadingAttachment[] = [];
    for (const file of Array.from(files)) {
      newItems.push({ file, status: "pending" });
    }
    setAttachments((prev) => [...prev, ...newItems]);

    for (const item of newItems) {
      try {
        item.status = "uploading";
        setAttachments((prev) => [...prev]);
        const { url, key } = await createUploadUrl({
          filename: item.file.name,
          contentType: item.file.type,
        });
        await fetch(url, {
          method: "PUT",
          body: item.file,
          headers: item.file.type
            ? { "Content-Type": item.file.type }
            : undefined,
        });
        item.status = "done";
        item.key = key;
        setAttachments((prev) => [...prev]);
      } catch (err: any) {
        item.status = "error";
        setAttachments((prev) => [...prev]);
        toast({
          title: "첨부 업로드 실패",
          description: err?.message || "업로드 중 오류",
          variant: "destructive",
        });
      }
    }
  };

  const handleSend = async () => {
    try {
      setSending(true);

      if (normalizedTo.length === 0) {
        toast({
          title: "수신자(To) 필요",
          description: "To를 입력해주세요.",
          variant: "destructive",
        });
        return;
      }

      if (pendingUploads) {
        toast({
          title: "첨부 업로드 중",
          description: "첨부 업로드가 끝난 후 발송할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }

      await sendMail({
        to: normalizedTo,
        cc: cc
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        bcc: bcc
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        subject,
        bodyHtml: body,
        bodyText: body,
        attachments: parsedAttachments,
      });

      toast({ title: "메일 발송 완료" });
      setTo("");
      setCc("");
      setBcc("");
      setSubject("");
      setBody("");
      setAttachments([]);
      onSent();
    } catch (err: any) {
      toast({
        title: "메일 발송 실패",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">메일 작성</CardTitle>
        <CardDescription>첨부파일을 포함해 메일을 발송합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>To (콤마 구분)</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>제목</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Cc</Label>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Bcc</Label>
            <Input value={bcc} onChange={(e) => setBcc(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>본문</Label>
          <Textarea
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              첨부
            </Label>
            <div className="text-xs text-muted-foreground">
              {pendingUploads ? "업로드 중..." : ""}
            </div>
          </div>
          <Input
            type="file"
            multiple
            onChange={(e) => uploadFiles(e.target.files)}
          />

          {attachments.length ? (
            <div className="space-y-2">
              {attachments.map((a, idx) => (
                <div
                  key={`${a.file.name}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm truncate">{a.file.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(a.file.size)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        a.status === "done"
                          ? "secondary"
                          : a.status === "error"
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {a.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeUploadingAttachment(idx)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              첨부파일이 없습니다.
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSend}
            disabled={sending || pendingUploads || normalizedTo.length === 0}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {sending ? "발송 중..." : "발송"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
