import type { PetTourDetailRawItem, PetTourListItem } from "../public-data/adapters/petTour";

export const PET_CONDITION_TYPE = "PET" as const;

export type PetTourAvailability = "CONFIRMED" | "CONDITIONAL" | "UNKNOWN";
export type PetTourScope = "ALL" | "PARTIAL" | "UNKNOWN";

export interface NormalizedPetTourEvidence {
  availability: PetTourAvailability;
  scope: PetTourScope;
  requirements: string[];
  capacityNote: string | null;
  riskNote: string | null;
  facilityNote: string | null;
}

export interface PetTourTarget extends PetTourListItem {
  sourceModifiedTime: string | null;
  sourceShowFlag: string;
}

export interface PetTourLocalPoi {
  id: string;
  externalId: string | null;
  regionId: string;
  sourceType: string;
  category: string;
  regionCode: string;
  regionName: string;
}

export interface ExistingPetTourEvidence {
  contentId: string;
  status: "SUCCESS" | "EMPTY" | "ERROR";
  sourceModifiedTime: string | null;
  sourceShowFlag: string | null;
}

export interface PetTourTargetSelection {
  officialItems: PetTourTarget[];
  hiddenItems: PetTourTarget[];
  matchedPois: PetTourLocalPoi[];
  unmatchedContentIds: string[];
  cacheHits: PetTourTarget[];
  changedTargets: PetTourTarget[];
  fetchTargets: PetTourTarget[];
}

function nonBlank(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getField(item: PetTourDetailRawItem, key: keyof PetTourDetailRawItem): string | null {
  const value = item[key];
  return typeof value === "string" ? nonBlank(value) : null;
}

function joinLabeledFields(item: PetTourDetailRawItem, fields: Array<[keyof PetTourDetailRawItem, string]>): string | null {
  const values = fields
    .map(([key, label]) => {
      const value = getField(item, key);
      return value ? `${label}: ${value}` : null;
    })
    .filter((value): value is string => value !== null);
  return values.length > 0 ? values.join(" | ") : null;
}

/**
 * 공식 원문을 최소 신호로만 정규화한다.
 * 빈 값·애매한 문구는 UNKNOWN으로 남기며, 이름·카테고리·주소로 가능 여부를 추론하지 않는다.
 */
export function normalizePetTourDetail(item: PetTourDetailRawItem): NormalizedPetTourEvidence {
  const typeText = getField(item, "acmpyTypeCd");
  const normalizedTypeText = typeText?.replace(/\s+/g, "") ?? "";
  const explicitlyPossible = normalizedTypeText.includes("동반가능");
  const confirmsAll = explicitlyPossible && normalizedTypeText.includes("전구역");

  let availability: PetTourAvailability = "UNKNOWN";
  let scope: PetTourScope = "UNKNOWN";
  if (confirmsAll) {
    availability = "CONFIRMED";
    scope = "ALL";
  } else if (explicitlyPossible) {
    availability = "CONDITIONAL";
    scope = "PARTIAL";
  }

  const requirements = getField(item, "acmpyNeedMtr") ? [getField(item, "acmpyNeedMtr") as string] : [];
  return {
    availability,
    scope,
    requirements,
    capacityNote: getField(item, "acmpyPsblCpam"),
    riskNote: getField(item, "relaAcdntRiskMtr"),
    facilityNote: joinLabeledFields(item, [
      ["relaPosesFclty", "동반 가능 시설"],
      ["relaFrnshPrdlst", "동반 편의 물품"],
      ["etcAcmpyInfo", "기타 동반 정보"],
      ["relaPurcPrdlst", "구매 가능 물품"],
      ["relaRntlPrdlst", "대여 가능 물품"],
    ]),
  };
}

function compareModifiedTime(left: PetTourTarget, right: PetTourTarget): number {
  const leftTime = left.sourceModifiedTime ?? "";
  const rightTime = right.sourceModifiedTime ?? "";
  return leftTime.localeCompare(rightTime) || left.contentid.localeCompare(right.contentid);
}

function toTarget(item: PetTourListItem): PetTourTarget {
  return {
    ...item,
    sourceModifiedTime: item.modifiedtime ?? null,
    sourceShowFlag: item.showflag ?? "1",
  };
}

/** 목록 중복을 contentId별 최신 modifiedtime으로 접는다. showflag=0은 상세 호출 대상에서 제외한다. */
export function deduplicatePetTourList(items: PetTourListItem[]): PetTourTarget[] {
  const byContentId = new Map<string, PetTourTarget>();
  for (const item of items) {
    const target = toTarget(item);
    const previous = byContentId.get(target.contentid);
    if (!previous || compareModifiedTime(previous, target) < 0) byContentId.set(target.contentid, target);
  }
  return [...byContentId.values()].sort((left, right) => left.contentid.localeCompare(right.contentid));
}

function isFreshCache(target: PetTourTarget, evidence: ExistingPetTourEvidence | undefined): boolean {
  return Boolean(
    evidence &&
      (evidence.status === "SUCCESS" || evidence.status === "EMPTY") &&
      target.sourceModifiedTime !== null &&
      evidence.sourceModifiedTime === target.sourceModifiedTime &&
      evidence.sourceShowFlag === target.sourceShowFlag,
  );
}

/** 공식 contentId와 local Poi.externalId의 교집합만 상세 대상이 되도록 선택한다. */
export function selectPetTourTargets(params: {
  officialItems: PetTourListItem[];
  localPois: PetTourLocalPoi[];
  existingEvidence: ExistingPetTourEvidence[];
  maxItems: number;
  /** 런타임에서 계산한 사용자 노출 우선순위. 없으면 기존 contentId 순서를 유지한다. */
  priorityContentIds?: string[];
}): PetTourTargetSelection {
  const allOfficialItems = deduplicatePetTourList(params.officialItems);
  const hiddenItems = allOfficialItems.filter((item) => item.sourceShowFlag === "0");
  const officialItems = allOfficialItems.filter((item) => item.sourceShowFlag !== "0");
  const poisByExternalId = new Map(
    params.localPois
      .filter((poi) => poi.sourceType === "API" && poi.externalId !== null)
      .map((poi) => [poi.externalId as string, poi]),
  );
  const evidenceByContentId = new Map(params.existingEvidence.map((evidence) => [evidence.contentId, evidence]));
  const matchedPois: PetTourLocalPoi[] = [];
  const unmatchedContentIds: string[] = [];
  const cacheHits: PetTourTarget[] = [];
  const changedTargets: PetTourTarget[] = [];

  for (const target of officialItems) {
    const poi = poisByExternalId.get(target.contentid);
    if (!poi) {
      unmatchedContentIds.push(target.contentid);
      continue;
    }
    matchedPois.push(poi);
    const evidence = evidenceByContentId.get(target.contentid);
    if (isFreshCache(target, evidence)) cacheHits.push(target);
    else changedTargets.push(target);
  }

  const priority = new Map(params.priorityContentIds?.map((contentId, index) => [contentId, index]) ?? []);
  const prioritizedChangedTargets = [...changedTargets].sort(
    (left, right) =>
      (priority.get(left.contentid) ?? Number.MAX_SAFE_INTEGER) - (priority.get(right.contentid) ?? Number.MAX_SAFE_INTEGER) ||
      left.contentid.localeCompare(right.contentid),
  );

  return {
    officialItems,
    hiddenItems,
    matchedPois,
    unmatchedContentIds,
    cacheHits,
    changedTargets,
    fetchTargets: prioritizedChangedTargets.slice(0, params.maxItems),
  };
}

/** 테스트용으로도 사용하는 지역 코드 비교기. 공식 시군구 코드는 3자리일 수 있다. */
export function matchesPetTourRegion(
  item: Pick<PetTourListItem, "lDongRegnCd" | "lDongSignguCd">,
  region: Pick<PetTourLocalPoi, "regionCode"> & { lDongRegnCd: string; lDongSignguCd: string },
): boolean {
  return item.lDongRegnCd === region.lDongRegnCd && item.lDongSignguCd === region.lDongSignguCd;
}

/** 런타임에서 Prisma Json을 받더라도 조건 상세 객체 외의 값을 추론하지 않는다. */
export function parsePetTourDetailJson(value: unknown): PetTourDetailRawItem | null {
  const record = asRecord(value);
  return typeof record.contentid === "string" ? (record as PetTourDetailRawItem) : null;
}
