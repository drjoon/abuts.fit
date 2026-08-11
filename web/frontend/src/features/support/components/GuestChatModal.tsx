// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MessageSquare, Send } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch } from "@/shared/api/apiClient";

interface GuestChatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const GuestChatModal = ({ open, onOpenChange }: GuestChatModalProps) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !message.trim()) {
      toast({
        title: "입력 오류",
        description: "모든 필드를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    const submit = async () => {
      try {
        setLoading(true);
        const res = await apiFetch<any>({
          path: "/api/support/guest-inquiries",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          jsonBody: { name, email, message },
        });

        if (!res.ok) {
          const serverMsg = res.data?.message;
          throw new Error(serverMsg || "문의 전송 중 오류가 발생했습니다.");
        }

        toast({
          title: "문의 접수 완료",
          description: "입력하신 이메일로 답변드리겠습니다.",
        });

        setName("");
        setEmail("");
        setMessage("");
        onOpenChange(false);
      } catch (error: any) {
        toast({
          title: "전송 실패",
          description: error?.message || "문의 저장 중 오류가 발생했습니다.",
          variant: "destructive",
          duration: 3000,
        });
      } finally {
        setLoading(false);
      }
    };

    void submit();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-primary-soft/60 p-0 shadow-[0_4px_12px_rgba(15,23,42,0.03)] transition-all hover:shadow-[0_8px_20px_rgba(15,23,42,0.06)] sm:max-w-md">
        <div className="border-b border-slate-100 bg-white/70 px-6 py-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary-strong">
                <MessageSquare className="h-4 w-4" />
              </span>
              문의 남기기
            </DialogTitle>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium text-slate-700">
              이름 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="이름을 입력해주세요"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="h-11 rounded-xl border-slate-200 bg-white text-slate-900 shadow-sm placeholder:text-slate-400"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-slate-700">
              이메일 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="이메일을 입력해주세요"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 rounded-xl border-slate-200 bg-white text-slate-900 shadow-sm placeholder:text-slate-400"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="message"
              className="text-sm font-medium text-slate-700"
            >
              문의 내용 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="message"
              placeholder="궁금한 내용을 입력해주세요"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              required
              className="rounded-xl border-slate-200 bg-white text-slate-900 shadow-sm placeholder:text-slate-400"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
            * 문의 남기기 기능은 비회원용입니다. 답변은 입력하신 이메일로
            발송됩니다.
          </div>

          <Button
            type="submit"
            className="h-11 w-full rounded-xl bg-primary-strong text-white shadow-sm hover:bg-primary-strong"
            disabled={loading}
          >
            <Send className="mr-2 h-4 w-4" />
            {loading ? "전송 중..." : "문의 남기기"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
