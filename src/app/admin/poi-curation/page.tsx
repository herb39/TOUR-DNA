import Link from "next/link";
import { PoiCurationManager, type PoiCurationManagerRow } from "@/components/admin/PoiCurationManager";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { poiCategoryLabel } from "@/lib/format";
import { PoiCurationStatus, PoiRepresentation } from "@/generated/prisma/enums";
import { decidePoiRecommendation, type PoiRecommendationStatus } from "@/lib/domain/poiRecommendation";
import { prisma } from "@/lib/db";
import {
  extractLclsSystm1FromRawPayload,
  extractLclsSystm2FromRawPayload,
} from "@/lib/services/poiDetails";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = ["ALL", ...Object.values(PoiCurationStatus)] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_LABEL: Record<StatusFilter, string> = {
  ALL: "전체",
  UNREVIEWED: "미검수",
  APPROVED: "승인",
  REJECTED: "제외",
};

const SOURCE_TYPE_LABEL: Record<string, string> = {
  API: "공공데이터 API",
  FIXTURE: "관리자·시드 데이터",
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatReviewedAt(value: Date | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function decisionLabel(status: PoiRecommendationStatus): string {
  return status === "ALLOW" ? "자동 후보" : status === "DEMOTE" ? "보조 후보" : "자동 제외";
}

function buildWhere(regionId: string | null, status: StatusFilter, query: string): Prisma.PoiWhereInput {
  return {
    ...(regionId ? { regionId } : { id: "__no_region__" }),
    ...(status !== "ALL" ? { curation: { status } } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { address: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

async function loadPageData(regionId: string | null, status: StatusFilter, query: string) {
  const baseWhere = regionId ? { regionId } : { id: "__no_region__" };
  const where = buildWhere(regionId, status, query);
  const [pois, total, unreviewed, approved, rejected] = await Promise.all([
    prisma.poi.findMany({
      where,
      include: { curation: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
    prisma.poi.count({ where: baseWhere }),
    prisma.poi.count({ where: { ...baseWhere, curation: { status: PoiCurationStatus.UNREVIEWED } } }),
    prisma.poi.count({ where: { ...baseWhere, curation: { status: PoiCurationStatus.APPROVED } } }),
    prisma.poi.count({ where: { ...baseWhere, curation: { status: PoiCurationStatus.REJECTED } } }),
  ]);

  const rows: PoiCurationManagerRow[] = pois.map((poi) => {
    const lclsSystm1 = extractLclsSystm1FromRawPayload(poi.rawPayload);
    const lclsSystm2 = extractLclsSystm2FromRawPayload(poi.rawPayload);
    const curation = poi.curation;
    const decision = decidePoiRecommendation(
      {
        name: poi.name,
        category: poi.category,
        lclsSystm1,
        lclsSystm2,
        curationStatus: curation?.status ?? "UNREVIEWED",
        representation: curation?.representation ?? "UNKNOWN",
      },
      [],
    );

    return {
      id: poi.id,
      name: poi.name,
      categoryLabel: poiCategoryLabel(poi.category),
      address: poi.address,
      sourceTypeLabel: SOURCE_TYPE_LABEL[poi.sourceType] ?? poi.sourceType,
      externalId: poi.externalId,
      officialClassification: [lclsSystm1, lclsSystm2].filter(Boolean).join(" / ") || "확인 안 됨",
      status: curation?.status ?? PoiCurationStatus.UNREVIEWED,
      representation: curation?.representation ?? PoiRepresentation.UNKNOWN,
      representativeness: curation?.representativeness ?? null,
      reason: curation?.reason ?? "",
      sourceLabel: curation?.sourceLabel ?? "",
      reviewedAt: formatReviewedAt(curation?.reviewedAt ?? null),
      currentDecisionLabel: decisionLabel(decision.status),
      currentDecisionTone: decision.status === "ALLOW" ? "allow" : decision.status === "DEMOTE" ? "demote" : "exclude",
    };
  });

  return { rows, counts: { total, unreviewed, approved, rejected } };
}

export default async function PoiCurationPage({
  searchParams,
}: {
  searchParams: Promise<{
    regionCode?: string | string[];
    status?: string | string[];
    query?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const requestedStatus = firstParam(params.status);
  const status: StatusFilter = STATUS_FILTERS.includes(requestedStatus as StatusFilter)
    ? (requestedStatus as StatusFilter)
    : "ALL";
  const query = firstParam(params.query).trim().slice(0, 100);
  const regions = await prisma.region.findMany({
    where: { level: "SIGUNGU" },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });
  const requestedRegionCode = firstParam(params.regionCode);
  const selectedRegion = regions.find((region) => region.code === requestedRegionCode) ?? regions[0] ?? null;
  const { rows, counts } = await loadPageData(selectedRegion?.id ?? null, status, query);

  const filterParams = new URLSearchParams();
  if (selectedRegion) filterParams.set("regionCode", selectedRegion.code);
  if (status !== "ALL") filterParams.set("status", status);
  if (query) filterParams.set("query", query);
  const currentQuery = filterParams.toString();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">운영자 도구</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">POI 큐레이션</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              원천 POI를 삭제하거나 지역명으로 차단하지 않고, 관광상품 대표성 검수 결과를 별도 레이어로 관리합니다.
              승인된 목적지는 자동 후보로, 보조 자원은 보조 후보로, 제외된 POI는 추천에서 숨겨집니다.
            </p>
          </div>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
            프로젝트 목록으로
          </Link>
        </div>

        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
          <form method="get" className="grid gap-4 lg:grid-cols-[260px_180px_1fr_auto] lg:items-end">
            <label className="block text-xs font-medium text-slate-700">
              검수 지역
              <select
                name="regionCode"
                defaultValue={selectedRegion?.code ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {regions.length === 0 ? <option value="">등록된 시군구 없음</option> : null}
                {regions.map((region) => (
                  <option key={region.code} value={region.code}>
                    {region.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-700">
              검수 상태
              <select
                name="status"
                defaultValue={status}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {STATUS_FILTERS.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_LABEL[option]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-700">
              POI 이름·주소 검색
              <input
                name="query"
                defaultValue={query}
                placeholder="예: 문암, 호텔, 공원"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
              조회
            </button>
          </form>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([
              ["전체 POI", counts.total, "ALL"],
              ["미검수", counts.unreviewed, "UNREVIEWED"],
              ["승인", counts.approved, "APPROVED"],
              ["제외", counts.rejected, "REJECTED"],
            ] as const).map(([label, count, filter]) => {
              const hrefParams = new URLSearchParams();
              if (selectedRegion) hrefParams.set("regionCode", selectedRegion.code);
              if (filter !== "ALL") hrefParams.set("status", filter);
              if (query) hrefParams.set("query", query);
              return (
                <Link
                  key={filter}
                  href={`/admin/poi-curation?${hrefParams.toString()}`}
                  className={`rounded-lg border px-3 py-3 ${status === filter ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:bg-slate-50"}`}
                >
                  <span className="block text-xs text-slate-500">{label}</span>
                  <span className="mt-1 block text-xl font-semibold text-slate-900">{count.toLocaleString("ko-KR")}</span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-6 flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {selectedRegion ? `${selectedRegion.name} · ` : ""}
            {query ? `‘${query}’ 검색 · ` : ""}
            {status === "ALL" ? "전체 상태" : STATUS_LABEL[status]} · {rows.length}건 표시
            {rows.length === 100 ? " (최대 100건)" : ""}
          </p>
          {currentQuery ? <Link href="/admin/poi-curation" className="text-slate-700 underline">필터 초기화</Link> : null}
        </section>

        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-800">
          <strong>검수 기준 안내:</strong> 대표성은 지역 현장성·중복 여부·관광상품에서의 역할을 기준으로 판단합니다.
          ‘제외’는 원천 데이터를 지우지 않고 자동 추천에서만 숨기며, ‘미검수’는 자동 코스에서 보수적으로 다뤄지고 보조 후보 패널에는 남을 수 있습니다.
        </div>

        <div className="mt-5">
          <PoiCurationManager rows={rows} />
        </div>
      </main>
    </>
  );
}
