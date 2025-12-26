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
import { useToast } from "@/hooks/use-toast";
import { emptyTrash } from "@/features/admin/mail/mailApi";

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

  return (
    <div className="p-4 space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
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
            삭제됨
          </TabsTrigger>
          <TabsTrigger value="spam" className="gap-2">
            <AlertOctagon className="h-4 w-4" />
            스팸함
          </TabsTrigger>
          <TabsTrigger value="compose" className="gap-2">
            <Mail className="h-4 w-4" />
            작성
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <AdminMailListPanel
              title="메일 목록"
              description="수신 메일을 조회합니다."
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
            />
          </div>
        </TabsContent>

        <TabsContent value="sent" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <AdminMailListPanel
              title="메일 목록"
              description="발신 메일을 조회합니다."
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
            />
          </div>
        </TabsContent>

        <TabsContent value="trash" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={handleEmptyTrash}
            >
              <Trash2 className="h-4 w-4" />
              휴지통 비우기
            </Button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <AdminMailListPanel
              title="메일 목록"
              description="삭제된 메일을 조회합니다."
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
            />
          </div>
        </TabsContent>

        <TabsContent value="spam" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <AdminMailListPanel
              title="메일 목록"
              description="스팸 메일을 조회합니다."
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
              onTrash={handleTrash}
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
