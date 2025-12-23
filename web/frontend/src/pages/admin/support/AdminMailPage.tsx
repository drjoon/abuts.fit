import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Inbox, Mail, Send } from "lucide-react";
import { AdminMailDetailPanel } from "./mail/AdminMailDetailPanel";
import { AdminMailListPanel } from "./mail/AdminMailListPanel";
import { AdminMailComposePanel } from "./mail/AdminMailComposePanel";
import { useAdminMailBox } from "./mail/useAdminMailBox";

export const AdminMailPage = () => {
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
  } = useAdminMailBox();

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              메일 관리
            </CardTitle>
            <CardDescription>
              수신/발신 메일 히스토리 조회 및 첨부 포함 발송을 관리합니다.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

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
