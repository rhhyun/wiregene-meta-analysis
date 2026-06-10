import { CalendarClock, CheckCircle2, Database, GitBranch, HardDrive, LibraryBig } from "lucide-react";
import type { ComponentType } from "react";

type StatusCard = {
  title: string;
  value: string;
  detail: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tone: string;
};

export function PlatformStatusPanel({ topicCount }: { topicCount: number }) {
  const cards: StatusCard[] = [
    {
      title: "저장 위치",
      value: "Google Drive",
      detail: "리포트와 항목 데이터는 Google Drive의 JSON DB 파일에 저장됩니다.",
      icon: HardDrive,
      tone: "text-sky-700 bg-sky-50 ring-sky-100",
    },
    {
      title: "실행 방식",
      value: "GitHub Actions",
      detail: "정기 검색과 요약 생성은 GitHub Actions workflow에서 실행됩니다.",
      icon: GitBranch,
      tone: "text-zinc-800 bg-zinc-100 ring-zinc-200",
    },
    {
      title: "정기 실행",
      value: "월·목 05:00 KST",
      detail: "GitHub cron은 UTC 기준 일·수 20:00에 실행됩니다.",
      icon: CalendarClock,
      tone: "text-emerald-700 bg-emerald-50 ring-emerald-100",
    },
    {
      title: "문헌 관리",
      value: "Zotero Web API",
      detail: "Zotero 버튼은 논문을 분야별 컬렉션에 저장합니다.",
      icon: LibraryBig,
      tone: "text-amber-700 bg-amber-50 ring-amber-100",
    },
  ];

  return (
    <section className="grid gap-4 lg:grid-cols-4" aria-label="저장 및 실행 상태">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.title} className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <span className={`inline-flex h-9 w-9 items-center justify-center rounded-md ring-1 ${card.tone}`}>
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-medium text-zinc-500">{card.title}</p>
                <p className="text-lg font-semibold text-zinc-950">{card.value}</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-600">{card.detail}</p>
          </div>
        );
      })}

      <div className="rounded-lg border border-zinc-200 bg-white p-4 lg:col-span-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-zinc-500">플랫폼 기준</p>
              <p className="text-base font-semibold text-zinc-950">
                Google Drive 저장 + GitHub Actions 실행 구조
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700">
            <Database className="h-4 w-4" aria-hidden />
            추적 분야 {topicCount}개
          </div>
        </div>
      </div>
    </section>
  );
}
