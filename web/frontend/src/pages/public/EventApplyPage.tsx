// related files:
// - web/frontend/src/shared/events/eventsApi.ts
// - web/frontend/src/shared/events/EventPlaceSuggestInput.tsx
// - web/frontend/src/pages/public/EventsPage.tsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Info } from "lucide-react";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
  PUBLIC_PAGE_EYEBROW,
  PUBLIC_PAGE_TITLE,
} from "./components/PublicPageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/shared/hooks/use-toast";
import EventPlaceSuggestInput from "@/shared/events/EventPlaceSuggestInput";
import {
  eventsApi,
  type EventPlaceFields,
  type EventPlaceSuggest,
  type MarketingEvent,
} from "@/shared/events/eventsApi";

const emptyPlace = (): EventPlaceFields => ({
  name: "",
  representativeName: "",
  phone: "",
  address: "",
  lat: null,
  lng: null,
});

function applyPlacePick(
  prev: EventPlaceFields,
  item: EventPlaceSuggest,
): EventPlaceFields {
  return {
    ...prev,
    name: item.name || prev.name,
    phone: item.phone || prev.phone,
    address: item.address || prev.address,
    lat: item.lat ?? prev.lat,
    lng: item.lng ?? prev.lng,
    representativeName:
      item.representativeName || prev.representativeName,
  };
}

export default function EventApplyPage() {
  const { slug = "" } = useParams();
  const { toast } = useToast();
  const [event, setEvent] = useState<MarketingEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [practice, setPractice] = useState<EventPlaceFields>(emptyPlace);
  const [directorName, setDirectorName] = useState("");
  const [dealer, setDealer] = useState<EventPlaceFields>(emptyPlace);
  const [applicantPhone, setApplicantPhone] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");
  const [memo, setMemo] = useState("");

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    void eventsApi
      .getPublic(slug)
      .then((ev) => {
        if (cancelled) return;
        setEvent(ev);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setEvent(null);
        setError(
          e instanceof Error ? e.message : "이벤트를 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event || submitting) return;
    setSubmitting(true);
    try {
      await eventsApi.apply(event.slug, {
        practice,
        directorName: directorName.trim(),
        dealer,
        applicantPhone: applicantPhone.trim() || practice.phone,
        applicantEmail: applicantEmail.trim(),
        memo: memo.trim(),
      });
      setDone(true);
      toast({
        title: "신청이 접수되었습니다",
        description: "담당 팀이 확인 후 안내드리겠습니다.",
      });
    } catch (err) {
      toast({
        title: "신청 실패",
        description:
          err instanceof Error ? err.message : "잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicPageLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link
            to="/events"
            className="inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            이벤트 목록
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        ) : error || !event ? (
          <Card className={PUBLIC_CARD_CLASS}>
            <CardContent className="space-y-3 py-8 text-center">
              <p className="text-sm text-slate-600">
                {error || "이벤트를 찾을 수 없습니다."}
              </p>
              <Button asChild variant="outline">
                <Link to="/events">목록으로</Link>
              </Button>
            </CardContent>
          </Card>
        ) : done ? (
          <Card className={PUBLIC_CARD_CLASS}>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              <h2 className="text-xl font-semibold text-slate-900">
                신청이 완료되었습니다
              </h2>
              <p className="max-w-md text-sm leading-relaxed text-slate-600">
                {event.title} 신청을 접수했습니다. 거래 지역 재료상을 통해
                안내드릴 예정입니다.
              </p>
              <Button asChild className="mt-2">
                <Link to="/events">다른 이벤트 보기</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-2">
              <p className={PUBLIC_PAGE_EYEBROW}>apply</p>
              <h1 className={`${PUBLIC_PAGE_TITLE} text-3xl sm:text-4xl`}>
                {event.title}
              </h1>
              {event.summary ? (
                <p className="text-slate-600">{event.summary}</p>
              ) : null}
            </div>

            {event.description ? (
              <Card className={PUBLIC_CARD_CLASS}>
                <CardContent className="whitespace-pre-line py-5 text-sm leading-relaxed text-slate-700">
                  {event.description}
                </CardContent>
              </Card>
            ) : null}

            <form onSubmit={onSubmit} className="space-y-5">
              <Card className={PUBLIC_CARD_CLASS}>
                <CardHeader>
                  <CardTitle className="text-base text-slate-900">
                    치과 · 원장
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="practiceName">
                      치과명 <span className="text-destructive">*</span>
                    </Label>
                    <EventPlaceSuggestInput
                      kind="practice"
                      value={practice.name}
                      placeholder="치과명 검색 (예: 강남 미소)"
                      listMode="inline"
                      onChange={(name) =>
                        setPractice((p) => ({ ...p, name }))
                      }
                      onPick={(item) =>
                        setPractice((p) => applyPlacePick(p, item))
                      }
                    />
                    {practice.address ? (
                      <p className="text-xs text-slate-500">
                        {practice.address}
                        {practice.phone ? ` · ${practice.phone}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="directorName">
                      원장명 <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="directorName"
                      value={directorName}
                      onChange={(e) => setDirectorName(e.target.value)}
                      placeholder="예: 김원장"
                      required
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="practicePhone">치과 전화</Label>
                      <Input
                        id="practicePhone"
                        value={practice.phone}
                        onChange={(e) =>
                          setPractice((p) => ({
                            ...p,
                            phone: e.target.value,
                          }))
                        }
                        placeholder="02-0000-0000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="applicantPhone">신청자 휴대폰</Label>
                      <Input
                        id="applicantPhone"
                        value={applicantPhone}
                        onChange={(e) => setApplicantPhone(e.target.value)}
                        placeholder="010-0000-0000"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {event.formConfig.requireDealer ? (
                <Card className={PUBLIC_CARD_CLASS}>
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-base text-slate-900">
                      거래 지역 재료상
                    </CardTitle>
                    <div className="flex gap-2 rounded-xl border border-sky-100 bg-sky-50/80 px-3 py-2.5 text-sm leading-relaxed text-sky-900">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                      <p>
                        {event.formConfig.dealerHelpText ||
                          "거래하시는 재료상을 통해 잘 쓰실 수 있도록 안내드립니다."}
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>
                        재료상명 <span className="text-destructive">*</span>
                      </Label>
                      <EventPlaceSuggestInput
                        kind="dealer"
                        value={dealer.name}
                        placeholder="재료상명 검색"
                        listMode="inline"
                        onChange={(name) =>
                          setDealer((d) => ({ ...d, name }))
                        }
                        onPick={(item) =>
                          setDealer((d) => applyPlacePick(d, item))
                        }
                      />
                      {dealer.address ? (
                        <p className="text-xs text-slate-500">
                          {dealer.address}
                          {dealer.phone ? ` · ${dealer.phone}` : ""}
                        </p>
                      ) : null}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="dealerRep">
                          대표명 <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="dealerRep"
                          value={dealer.representativeName}
                          onChange={(e) =>
                            setDealer((d) => ({
                              ...d,
                              representativeName: e.target.value,
                            }))
                          }
                          placeholder="재료상 대표 성함"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dealerPhone">
                          전화번호 <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="dealerPhone"
                          value={dealer.phone}
                          onChange={(e) =>
                            setDealer((d) => ({
                              ...d,
                              phone: e.target.value,
                            }))
                          }
                          placeholder="02-0000-0000"
                          required
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <Card className={PUBLIC_CARD_CLASS}>
                <CardHeader>
                  <CardTitle className="text-base text-slate-900">
                    추가 연락처 · 메모
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">이메일</Label>
                    <Input
                      id="email"
                      type="email"
                      value={applicantEmail}
                      onChange={(e) => setApplicantEmail(e.target.value)}
                      placeholder="name@clinic.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="memo">메모</Label>
                    <Textarea
                      id="memo"
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      placeholder="전달할 내용이 있으면 적어 주세요"
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={submitting}
              >
                {submitting ? "처리 중…" : "신청하기"}
              </Button>
            </form>
          </>
        )}
      </div>
    </PublicPageLayout>
  );
}
