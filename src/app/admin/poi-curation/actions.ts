"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { PoiCurationStatus, PoiRepresentation } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { isValidSessionCookieValue, SITE_ACCESS_COOKIE_NAME } from "@/lib/services/siteAuth";

const CURATION_STATUSES = Object.values(PoiCurationStatus);
const REPRESENTATIONS = Object.values(PoiRepresentation);

export interface SavePoiCurationState {
  success: boolean;
  poiId?: string;
  message?: string;
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: FormDataEntryValue | null, maxLength: number): string | null | "INVALID" {
  const text = stringValue(value);
  if (text.length > maxLength) return "INVALID";
  return text || null;
}

async function hasSiteAccess(): Promise<boolean> {
  const password = process.env.SITE_ACCESS_PASSWORD;
  if (!password) return true;

  const cookieStore = await cookies();
  return isValidSessionCookieValue(cookieStore.get(SITE_ACCESS_COOKIE_NAME)?.value, password);
}

export async function savePoiCurationAction(
  _prevState: SavePoiCurationState,
  formData: FormData,
): Promise<SavePoiCurationState> {
  if (!(await hasSiteAccess())) {
    return { success: false, message: "로그인이 만료되었습니다. 다시 입장해주세요." };
  }

  const poiId = stringValue(formData.get("poiId"));
  const status = stringValue(formData.get("status"));
  const representation = stringValue(formData.get("representation"));
  const scoreRaw = stringValue(formData.get("representativeness"));
  const representativeness = scoreRaw === "" ? null : Number(scoreRaw);
  const reason = nullableText(formData.get("reason"), 1000);
  const sourceLabel = nullableText(formData.get("sourceLabel"), 200);
  const invalidScore =
    scoreRaw !== "" &&
    (typeof representativeness !== "number" ||
      !Number.isInteger(representativeness) ||
      representativeness < 0 ||
      representativeness > 100);

  if (!poiId || !CURATION_STATUSES.includes(status as (typeof CURATION_STATUSES)[number])) {
    return { success: false, poiId, message: "검수 상태를 확인해주세요." };
  }
  if (!REPRESENTATIONS.includes(representation as (typeof REPRESENTATIONS)[number])) {
    return { success: false, poiId, message: "대표성 유형을 확인해주세요." };
  }
  if (
    invalidScore ||
    reason === "INVALID" ||
    sourceLabel === "INVALID"
  ) {
    return { success: false, poiId, message: "대표성 점수는 0~100 정수, 사유는 1,000자 이하로 입력해주세요." };
  }

  const poi = await prisma.poi.findUnique({ where: { id: poiId }, select: { id: true } });
  if (!poi) return { success: false, poiId, message: "POI를 찾을 수 없습니다. 목록을 새로고침해주세요." };

  const isReviewed = status !== PoiCurationStatus.UNREVIEWED;
  await prisma.poiCuration.upsert({
    where: { poiId },
    create: {
      poiId,
      status: status as PoiCurationStatus,
      representation: representation as PoiRepresentation,
      representativeness,
      reason: reason === "INVALID" ? null : reason,
      sourceLabel: sourceLabel === "INVALID" ? null : sourceLabel,
      reviewedBy: isReviewed ? "ADMIN_UI" : null,
      reviewedAt: isReviewed ? new Date() : null,
    },
    update: {
      status: status as PoiCurationStatus,
      representation: representation as PoiRepresentation,
      representativeness,
      reason: reason === "INVALID" ? null : reason,
      sourceLabel: sourceLabel === "INVALID" ? null : sourceLabel,
      reviewedBy: isReviewed ? "ADMIN_UI" : null,
      reviewedAt: isReviewed ? new Date() : null,
    },
  });

  revalidatePath("/admin/poi-curation");
  return { success: true, poiId, message: "저장했습니다." };
}
