import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="no-print border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-bold tracking-tight text-slate-900">TOUR DNA</span>
          <span className="hidden text-xs text-slate-500 sm:inline">
            데이터 기반 지역 관광상품 기획 엔진
          </span>
        </Link>
        <nav aria-label="주요 메뉴" className="flex items-center gap-4">
          <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">
            프로젝트 목록
          </Link>
          <Link
            href="/projects/new"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            새 관광상품 기획
          </Link>
        </nav>
      </div>
    </header>
  );
}
