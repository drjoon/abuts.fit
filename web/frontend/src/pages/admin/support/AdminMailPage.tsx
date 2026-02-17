import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Inbox, Mail, Send, AlertOctagon } from "lucide-react";
import { AdminMailDetailPanel } from "./mail/AdminMailDetailPanel";
import { AdminMailListPanel } from "./mail/AdminMailListPanel";
import { AdminMailComposePanel } from "./mail/AdminMailComposePanel";
import { useAdminMailBox } from "./mail/useAdminMailBox";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/shared/hooks/use-toast";
import {
  emptySent,
  emptySpam,
  emptyTrash,
} from "@/features/admin/mail/mailApi";

export const AdminMailPage = () => {
  const { toast } = useToast();
  const {
    tab,
    setTab,
    q,
    setQ,
    mails,
    listLoading,
    selectedId,
    selected,
    detailLoading,
    selectMail,
    onSearch,
    loadMore,
    hasMore,
    handleDownload,
    handleMarkAsRead,
    handleMarkAsUnread,
    handleMoveToSpam,
    handleTrash,
    handleRestoreToSent,
    folder,
  } = useAdminMailBox();

  const handleEmptyTrash = async () => {
    try {
      await emptyTrash(true);
      toast({
        title: "휴지통을 비웠습니다",
        description: "삭제된 메일이 영구 삭제되었습니다.",
      });
      // 휴지통 탭이면 목록 갱신
      if (tab === "trash") onSearch();
    } catch (err: any) {
      toast({
        title: "휴지통 비우기 실패",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleEmptySpam = async () => {
    try {
      await emptySpam(true);
      toast({
        title: "스팸함을 비웠습니다",
        description: "스팸 메일이 영구 삭제되었습니다.",
      });
      if (tab === "spam") onSearch();
    } catch (err: any) {
      toast({
        title: "스팸함 비우기 실패",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleEmptySent = async () => {
    try {
      await emptySent(true);
      toast({
        title: "발신함을 비웠습니다",
        description: "발신 메일 기록이 영구 삭제되었습니다.",
      });
      if (tab === "sent") onSearch();
    } catch (err: any) {
      toast({
        title: "발신함 비우기 실패",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-4 space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="flex flex-wrap items-center gap-2 w-full">
          <TabsTrigger value="inbox" className="gap-2">
            <Inbox className="h-4 w-4" />
            수신함
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-2">
            <Send className="h-4 w-4" />
            발신함
          </TabsTrigger>
          <TabsTrigger value="trash" className="gap-2">
            <Trash2 className="h-4 w-4" />
            휴지통
          </TabsTrigger>
          <TabsTrigger value="spam" className="gap-2">
            <AlertOctagon className="h-4 w-4" />
            스팸함
          </TabsTrigger>
          {tab === "sent" && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-2 h-8 px-3 text-sm ml-4"
              onClick={handleEmptySent}
            >
              발신함 비우기
            </Button>
          )}
          {tab === "spam" && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-2 h-8 px-3 text-sm ml-4"
              onClick={handleEmptySpam}
            >
              스팸함 비우기
            </Button>
          )}
          {tab === "trash" && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-2 h-8 px-3 text-sm ml-4"
              onClick={handleEmptyTrash}
            >
              <Trash2 className="h-4 w-4" />
              휴지통 비우기
            </Button>
          )}
          <TabsTrigger
            value="compose"
            className="ml-auto gap-2 bg-primary text-white hover:bg-primary/90"
          >
            <Mail className="h-4 w-4" />
            작성
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <AdminMailListPanel
              q={q}
              setQ={setQ}
              loading={listLoading}
              mails={mails}
              selectedId={selectedId}
              onSearch={onSearch}
              onLoadMore={loadMore}
              hasMore={hasMore}
              onSelect={selectMail}
              variant="inbox"
            />

            <AdminMailDetailPanel
              selected={selected}
              detailLoading={detailLoading}
              onDownload={handleDownload}
              onMarkAsRead={handleMarkAsRead}
              onMarkAsUnread={handleMarkAsUnread}
              onMoveToSpam={handleMoveToSpam}
              onTrash={handleTrash}
              onRestoreToSent={handleRestoreToSent}
            />
          </div>
        </TabsContent>

        <TabsContent value="sent" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <AdminMailListPanel
              q={q}
              setQ={setQ}
              loading={listLoading}
              mails={mails}
              selectedId={selectedId}
              onSearch={onSearch}
              onLoadMore={loadMore}
              hasMore={hasMore}
              onSelect={selectMail}
              variant="sent"
            />

            <AdminMailDetailPanel
              selected={selected}
              detailLoading={detailLoading}
              onDownload={handleDownload}
              onMarkAsRead={handleMarkAsRead}
              onMarkAsUnread={handleMarkAsUnread}
              onMoveToSpam={handleMoveToSpam}
              onTrash={handleTrash}
              onRestoreToSent={handleRestoreToSent}
            />
          </div>
        </TabsContent>

        <TabsContent value="trash" className="mt-4 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <AdminMailListPanel
              q={q}
              setQ={setQ}
              loading={listLoading}
              mails={mails}
              selectedId={selectedId}
              onSearch={onSearch}
              onLoadMore={loadMore}
              hasMore={hasMore}
              onSelect={selectMail}
              variant="inbox"
            />

            <AdminMailDetailPanel
              selected={selected}
              detailLoading={detailLoading}
              onDownload={handleDownload}
              onMarkAsRead={handleMarkAsRead}
              onMarkAsUnread={handleMarkAsUnread}
              onMoveToSpam={handleMoveToSpam}
              onTrash={handleTrash}
              onRestoreToSent={handleRestoreToSent}
            />
          </div>
        </TabsContent>

        <TabsContent value="spam" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <AdminMailListPanel
              q={q}
              setQ={setQ}
              loading={listLoading}
              mails={mails}
              selectedId={selectedId}
              onSearch={onSearch}
              onLoadMore={loadMore}
              hasMore={hasMore}
              onSelect={selectMail}
              variant="inbox"
            />

            <AdminMailDetailPanel
              selected={selected}
              detailLoading={detailLoading}
              onDownload={handleDownload}
              onMarkAsRead={handleMarkAsRead}
              onMarkAsUnread={handleMarkAsUnread}
              onMoveToSpam={handleMoveToSpam}
              onTrash={handleTrash}
              onRestoreToSent={handleRestoreToSent}
            />
          </div>
        </TabsContent>

        <TabsContent value="compose" className="mt-4">
          <AdminMailComposePanel onSent={() => setTab("sent")} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminMailPage;
