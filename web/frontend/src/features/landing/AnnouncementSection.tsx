import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const AnnouncementSection = () => {
  const announcements = [
    {
      id: 1,
      title: "커스텀 어벗 제작 서비스",
      description: "간편하게 STL 파일 업로드하고 의뢰해보세요",
      type: "notice",
      date: "안내",
    },
    {
      id: 2,
      title: "높은 품질, 낮은 가격",
      description: "회원 가입 후 대시보드에서 귀사의 가격을 확인해보세요.",
      type: "notice",
      date: "정책",
    },
    {
      id: 3,
      title: "묶음배송 권장",
      description: "배송비 절감을 위해 묶음배송을 권장합니다.",
      type: "new",
      date: "배송",
    },
  ];

  const getAnnouncementStyle = (type: string) => {
    switch (type) {
      case "new":
        return "border-green-200 bg-green-50 text-green-800";
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
              className={`app-glass-card app-glass-card--lg cursor-pointer ${getAnnouncementStyle(
                announcement.type,
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
