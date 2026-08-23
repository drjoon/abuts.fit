// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { usePeriodStore } from "@/store/usePeriodStore";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import {
  emptySent,
  emptySpam,
  emptyTrash,
} from "@/features/admin/mail/mailApi";
import { useIsMobile } from "@/shared/hooks/use-mobile";

export const AdminMailPage = () => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [mobileShowList, setMobileShowList] = useState(true);
  const { period, setPeriod } = usePeriodStore();
  const [searchParams] = useSearchParams();
  const initialUnreadOnly = useMemo(
    () => searchParams.get("unread") === "1",
    [searchParams],
  );
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
    unreadOnly,
    setUnreadOnly,
  } = useAdminMailBox({ initialUnreadOnly });

  useEffect(() => {
    setMobileShowList(true);
  }, [tab]);

  useEffect(() => {
    if (!selectedId) {
      setMobileShowList(true);
    }
  }, [selectedId]);

  useEffect(() => {
    if (!isMobile) return;
    setMobileShowList(!selectedId);
  }, [isMobile]);

  const handleSelectMail = useCallback(
    (id: string) => {
      selectMail(id);
      if (isMobile) {
        setMobileShowList(false);
      }
    },
    [isMobile, selectMail],
  );

  const handleBackToList = useCallback(() => {
    setMobileShowList(true);
  }, []);

  const showListPanel = !isMobile || mobileShowList;
  const showDetailPanel = !isMobile || !mobileShowList;

  const renderMailPanels = (variant: "inbox" | "sent") => (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {showListPanel ? (
        <AdminMailListPanel
          q={q}
          setQ={setQ}
          loading={listLoading}
          mails={mails}
          selectedId={selectedId}
          onSearch={onSearch}
          onLoadMore={loadMore}
          hasMore={hasMore}
          onSelect={handleSelectMail}
          variant={variant}
        />
      ) : null}

      {showDetailPanel ? (
        <AdminMailDetailPanel
          selected={selected}
          detailLoading={detailLoading}
          onDownload={handleDownload}
          onMarkAsRead={handleMarkAsRead}
          onMarkAsUnread={handleMarkAsUnread}
          onMoveToSpam={handleMoveToSpam}
          onTrash={handleTrash}
          onRestoreToSent={handleRestoreToSent}
          showBackButton={isMobile && !mobileShowList}
          onBack={handleBackToList}
        />
      ) : null}
    </div>
  );

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
    <div className="p-2 sm:p-4 space-y-4">
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
          {tab === "inbox" && (
            <Button
              variant={unreadOnly ? "default" : "outline"}
              size="sm"
              className="gap-2 h-8 px-3 text-sm ml-4"
              onClick={() => setUnreadOnly(!unreadOnly)}
            >
              {unreadOnly ? "안읽음만 보는 중" : "안읽음만 보기"}
            </Button>
          )}
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
          {renderMailPanels("inbox")}
        </TabsContent>

        <TabsContent value="sent" className="mt-4">
          {renderMailPanels("sent")}
        </TabsContent>

        <TabsContent value="trash" className="mt-4 space-y-3">
          {renderMailPanels("inbox")}
        </TabsContent>

        <TabsContent value="spam" className="mt-4">
          {renderMailPanels("inbox")}
        </TabsContent>

        <TabsContent value="compose" className="mt-4">
          <AdminMailComposePanel onSent={() => setTab("sent")} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminMailPage;
