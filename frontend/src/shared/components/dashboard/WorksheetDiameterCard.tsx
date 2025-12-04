import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type DiameterBucket = {
  diameter: number | string;
  shipLabel: string;
  ratio: number;
  count: number;
};

export type DiameterStats = {
  buckets: DiameterBucket[];
  total: number;
};

export const WorksheetDiameterCard = ({ stats }: { stats: DiameterStats }) => {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium mb-2">
          커스텀 어벗먼트 최대 직경별 진행 현황
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-center gap-3 max-w-md mx-auto">
          {stats.buckets.map((bucket, index) => {
            const isLast = index === stats.buckets.length - 1;
            const label = isLast ? "10+mm" : `${bucket.diameter}mm`;

            return (
              <div
                key={bucket.diameter}
                className="flex flex-col items-center gap-1 w-16"
                title="지금 의뢰시 예상 발송일을 표시함"
              >
                <div className="mb-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-sm">
                  {bucket.shipLabel}
                </div>
                <div
                  className="w-full h-36 bg-muted rounded-md flex items-end overflow-hidden border border-border"
                  title="가공 대기중인 어벗먼트 개수"
                >
                  <div
                    className="w-full relative rounded-t-md border border-white/60 bg-gradient-to-t from-blue-600 via-blue-500 to-blue-400"
                    style={{ height: `${bucket.ratio * 100}%` }}
                  />
                </div>
                <div className="-mt-7 mb-0.5 text-[11px] font-extrabold text-slate-900 drop-shadow-[0_0_4px_rgba(255,255,255,0.9)]">
                  {bucket.count.toLocaleString()}개
                </div>
                <div className="text-xs text-muted-foreground flex flex-col items-center mt-0.5">
                  <span>{label}</span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground text-right">
          총 {stats.total.toLocaleString()}건 대기중
        </p>
      </CardContent>
    </Card>
  );
};
