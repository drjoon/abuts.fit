import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const NotificationsTab = () => {
  const { toast } = useToast();

  const [notificationData, setNotificationData] = useState({
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    marketingEmails: false,
    newRequests: true,
    statusUpdates: true,
    payments: true
  });

  const handleSave = () => {
    toast({
      title: "설정이 저장되었습니다",
      description: "알림 설정이 성공적으로 업데이트되었습니다.",
    });
  };

  const toggleNotification = (key: keyof typeof notificationData) => {
    setNotificationData(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <Card className="shadow-elegant">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          알림 설정
        </CardTitle>
        <CardDescription>
          알림 수신 방법과 유형을 관리하세요
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Notification Methods */}
        <div>
          <h3 className="text-lg font-medium mb-4">알림 수신 방법</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="emailNotifications" className="font-medium">이메일 알림</Label>
                <p className="text-sm text-muted-foreground">중요 알림을 이메일로 받습니다</p>
              </div>
              <Switch 
                id="emailNotifications"
                checked={notificationData.emailNotifications}
                onCheckedChange={() => toggleNotification('emailNotifications')}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="smsNotifications" className="font-medium">SMS 알림</Label>
                <p className="text-sm text-muted-foreground">중요 알림을 SMS로 받습니다</p>
              </div>
              <Switch 
                id="smsNotifications"
                checked={notificationData.smsNotifications}
                onCheckedChange={() => toggleNotification('smsNotifications')}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="pushNotifications" className="font-medium">앱 푸시 알림</Label>
                <p className="text-sm text-muted-foreground">앱에서 푸시 알림을 받습니다</p>
              </div>
              <Switch 
                id="pushNotifications"
                checked={notificationData.pushNotifications}
                onCheckedChange={() => toggleNotification('pushNotifications')}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="marketingEmails" className="font-medium">마케팅 이메일</Label>
                <p className="text-sm text-muted-foreground">프로모션 및 마케팅 정보를 받습니다</p>
              </div>
              <Switch 
                id="marketingEmails"
                checked={notificationData.marketingEmails}
                onCheckedChange={() => toggleNotification('marketingEmails')}
              />
            </div>
          </div>
        </div>

        {/* Notification Types */}
        <div>
          <h3 className="text-lg font-medium mb-4">알림 유형</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="newRequests" className="font-medium">새 의뢰 알림</Label>
                <p className="text-sm text-muted-foreground">새로운 의뢰가 접수되면 알림을 받습니다</p>
              </div>
              <Switch 
                id="newRequests"
                checked={notificationData.newRequests}
                onCheckedChange={() => toggleNotification('newRequests')}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="statusUpdates" className="font-medium">상태 업데이트 알림</Label>
                <p className="text-sm text-muted-foreground">의뢰 상태가 변경되면 알림을 받습니다</p>
              </div>
              <Switch 
                id="statusUpdates"
                checked={notificationData.statusUpdates}
                onCheckedChange={() => toggleNotification('statusUpdates')}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="payments" className="font-medium">결제 알림</Label>
                <p className="text-sm text-muted-foreground">결제 관련 정보를 알림으로 받습니다</p>
              </div>
              <Switch 
                id="payments"
                checked={notificationData.payments}
                onCheckedChange={() => toggleNotification('payments')}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            저장하기
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
