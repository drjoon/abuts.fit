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
      <DialogContent className="sm:max-w-md border-white/15 bg-[#050915]/95 text-white shadow-[0_35px_80px_rgba(4,8,18,0.65)] backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <MessageSquare className="h-5 w-5 text-cyan-300" />
            문의 남기기
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium text-white/80">
              이름 *
            </Label>
            <Input
              id="name"
              placeholder="이름을 입력해주세요"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="h-11 border-white/10 bg-white/5 text-white placeholder:text-white/40"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="email"
              className="text-sm font-medium text-white/80"
            >
              이메일 *
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="이메일을 입력해주세요"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 border-white/10 bg-white/5 text-white placeholder:text-white/40"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="message"
              className="text-sm font-medium text-white/80"
            >
              문의 내용 *
            </Label>
            <Textarea
              id="message"
              placeholder="궁금한 내용을 입력해주세요"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              required
              className="border-white/10 bg-white/5 text-white placeholder:text-white/40"
            />
          </div>

          <div className="rounded-xl border border-white/5 bg-white/5 p-3 text-xs text-white/70">
            * 문의 남기기 기능은 비회원용입니다. 답변은 입력하신 이메일로
            발송됩니다.
          </div>

          <Button
            type="submit"
            className="w-full h-11 rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 text-slate-950 font-semibold shadow-lg shadow-cyan-500/25 hover:from-emerald-300 hover:via-cyan-300 hover:to-blue-400"
            disabled={loading}
          >
            <Send className="h-4 w-4 mr-2" />
            {loading ? "전송 중..." : "문의 남기기"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
