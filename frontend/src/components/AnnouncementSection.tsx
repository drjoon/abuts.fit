import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Announcement Section Component
export const AnnouncementSection = () => {
  const announcements = [
    {
      id: 1,
      title: "🎉 신규 제작사 파트너 모집",
      description:
        "우수한 치과기공소 제작사분들을 모집하고 있습니다. 지금 가입하시고 많은 의뢰를 받아보세요!",
      type: "new",
      date: "2025-07-15",
    },
    {
      id: 2,
      title: "🔥 이달의 HOT 제작사",
      description:
        "프리미엄 어벗먼트가 높은 품질과 빠른 납기로 고객 만족도 1위를 달성했습니다!",
      type: "hot",
      date: "2025-07-14",
    },
    {
      id: 3,
      title: "📢 서비스 수수료 무료 연장",
      description:
        "더 많은 분들이 서비스를 이용할 수 있도록 당분간 모든 수수료를 면제합니다.",
      type: "notice",
      date: "2025-07-13",
    },
  ];

  const getAnnouncementStyle = (type: string) => {
    switch (type) {
      case "new":
        return "border-green-200 bg-green-50 text-green-800";
      case "hot":
        return "border-red-200 bg-red-50 text-red-800";
      case "notice":
        return "border-blue-200 bg-blue-50 text-blue-800";
      default:
        return "border-gray-200 bg-gray-50 text-gray-800";
    }
  };

  return (
    <section className="py-16 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold bg-gradient-hero bg-clip-text text-transparent mb-4">
            공지사항 & 업데이트
          </h2>
          <p className="text-muted-foreground text-lg">
            최신 소식과 중요한 알림을 확인하세요
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {announcements.map((announcement) => (
            <Card
              key={announcement.id}
              className={`transition-all hover:shadow-elegant cursor-pointer ${getAnnouncementStyle(
                announcement.type
              )}`}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg leading-tight">
                    {announcement.title}
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {announcement.date}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">
                  {announcement.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
