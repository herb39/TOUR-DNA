import { spawn } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import {
  findFestivalAnchorItems,
  insertFestivalAnchorIntoCourse,
  removeFestivalAnchorFromCourse,
  validateFestivalAnchorCourseDays,
} from "../src/lib/domain/festivalAnchorCourse";
import type { CourseDay, TransportCode } from "../src/lib/domain/planBuilder";

const QA_PROJECT_NAMES = {
  gyeongju: "[QA E2E] 경주 문화역사",
  cheongju: "[QA E2E] 청주 흥덕구 자연웰니스",
  anchorDaejeon: "[QA E2E] 대전 축제 Anchor",
  anchorSejong: "[QA E2E] 세종 축제 Anchor",
  anchorJecheon: "[QA E2E] 제천 no-candidate Anchor",
  petAccessibility: "[QA PET 사용자] 경주",
} as const;

/**
 * 2026-08-26 한국관광공사 행사정보 조회(searchFestival2)로 확인한 대전 유성구 2026년 9월
 * Anchor 후보다. local QA fixture는 Production DB나 보호 dump를 수정하지 않고, 이 공식 최소
 * 스냅샷과 사용자 지정 연계 조건을 기준으로 매 실행 시 정합성을 확인한다.
 */
const DAEJEON_ANCHOR_FIXTURE = {
  source: "TOUR_API_FESTIVAL",
  sourceId: "4098134",
  contentTypeId: "15",
  name: "유성온날",
  eventStartDate: "2026-08-14",
  eventEndDate: "2026-12-11",
  plannedDate: "2026-09-10",
  plannedDayIndex: 1,
  timeStatus: "USER_CONFIRMED",
  timeSlot: "CUSTOM",
  timeStart: "15:00",
  timeEnd: "17:00",
  regionCode: "SGG_DAEJEON",
  address: "대전광역시 유성구 온천로 89 (봉명동)",
  lat: 36.3548338694,
  lng: 127.3478052748,
  sourceSnapshot: {
    source: "TOUR_API_FESTIVAL",
    sourceId: "4098134",
    contentTypeId: "15",
    name: "유성온날",
    eventStartDate: "2026-08-14",
    eventEndDate: "2026-12-11",
    address: "대전광역시 유성구 온천로 89 (봉명동)",
    lat: 36.3548338694,
    lng: 127.3478052748,
  },
  provenance: {
    provider: "한국관광공사",
    dataset: "행사정보 조회(searchFestival2)",
    regionCode: "SGG_DAEJEON",
    travelYear: 2026,
    travelMonth: 9,
    eventStartDate: "2026-09-01",
    eventEndDate: "2026-09-30",
    fetchedAt: "2026-08-26T08:36:34.660Z",
    apiItemCount: 1,
    matchedItemCount: 1,
    officialRegionCode: "30",
    officialSigunguCode: "200",
  },
} as const;

type FixtureKey = keyof typeof QA_PROJECT_NAMES;

type QaFixture = {
  id: string;
  name: string;
  coursePoiIds: string[];
  courseItemCount: number;
  hasAnchor: boolean;
  anchor: {
    sourceId: string;
    name: string;
    eventStartDate: string;
    eventEndDate: string;
    plannedDate: string;
  } | null;
  petEvidenceCount: number;
  accessibilityEvidenceCount: number;
};

type FixtureMap = Record<FixtureKey, QaFixture>;

function assertLocalDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL이 없습니다. .env.local을 확인해주세요.");

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL 형식을 확인할 수 없습니다.");
  }

  const host = url.hostname.toLowerCase();
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  if (!isLoopback || databaseName !== "tour_dna_local") {
    throw new Error("E2E fixture setup은 localhost의 tour_dna_local에서만 실행할 수 있습니다.");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function courseItems(course: unknown): Array<{ poiId?: string }> {
  const days = Array.isArray(asRecord(course).days) ? (asRecord(course).days as Array<Record<string, unknown>>) : [];
  return days.flatMap((day) => [
    ...(Array.isArray(day.items) ? (day.items as Array<{ poiId?: string }>) : []),
    ...(day.lodging && typeof day.lodging === "object" ? [day.lodging as { poiId?: string }] : []),
  ]);
}

async function findExactProject(prisma: PrismaClient, name: string) {
  const projects = await prisma.project.findMany({
    where: { name },
    select: {
      id: true,
      name: true,
      travelYear: true,
      travelMonth: true,
      region: { select: { code: true } },
      input: { select: { preferredThemes: true, transport: true } },
      selectedPlan: { select: { course: true } },
      anchor: {
        select: {
          id: true,
          status: true,
          updatedAt: true,
          source: true,
          sourceId: true,
          contentTypeId: true,
          name: true,
          eventStartDate: true,
          eventEndDate: true,
          plannedDate: true,
          plannedDayIndex: true,
          timeStatus: true,
          timeSlot: true,
          timeStart: true,
          timeEnd: true,
          regionCode: true,
          address: true,
          lat: true,
          lng: true,
          sourceSnapshot: true,
          provenance: true,
        },
      },
    },
  });

  if (projects.length !== 1) {
    throw new Error(`QA 프로젝트 '${name}'는 정확히 1개여야 합니다. 현재 ${projects.length}개입니다.`);
  }
  return projects[0];
}

function matchesDaejeonAnchorFixture(anchor: NonNullable<Awaited<ReturnType<typeof findExactProject>>["anchor"]>) {
  const checks = {
    source: anchor.source === DAEJEON_ANCHOR_FIXTURE.source,
    sourceId: anchor.sourceId === DAEJEON_ANCHOR_FIXTURE.sourceId,
    contentTypeId: anchor.contentTypeId === DAEJEON_ANCHOR_FIXTURE.contentTypeId,
    name: anchor.name === DAEJEON_ANCHOR_FIXTURE.name,
    eventStartDate: anchor.eventStartDate === DAEJEON_ANCHOR_FIXTURE.eventStartDate,
    eventEndDate: anchor.eventEndDate === DAEJEON_ANCHOR_FIXTURE.eventEndDate,
    plannedDate: anchor.plannedDate === DAEJEON_ANCHOR_FIXTURE.plannedDate,
    plannedDayIndex: anchor.plannedDayIndex === DAEJEON_ANCHOR_FIXTURE.plannedDayIndex,
    timeStatus: anchor.timeStatus === DAEJEON_ANCHOR_FIXTURE.timeStatus,
    timeSlot: anchor.timeSlot === DAEJEON_ANCHOR_FIXTURE.timeSlot,
    timeStart: anchor.timeStart === DAEJEON_ANCHOR_FIXTURE.timeStart,
    timeEnd: anchor.timeEnd === DAEJEON_ANCHOR_FIXTURE.timeEnd,
    regionCode: anchor.regionCode === DAEJEON_ANCHOR_FIXTURE.regionCode,
    address: anchor.address === DAEJEON_ANCHOR_FIXTURE.address,
    lat: anchor.lat === DAEJEON_ANCHOR_FIXTURE.lat,
    lng: anchor.lng === DAEJEON_ANCHOR_FIXTURE.lng,
    sourceSnapshot: stableJson(anchor.sourceSnapshot) === stableJson(DAEJEON_ANCHOR_FIXTURE.sourceSnapshot),
    provenance: stableJson(anchor.provenance) === stableJson(DAEJEON_ANCHOR_FIXTURE.provenance),
  };
  if (!Object.values(checks).every(Boolean)) {
    console.log(`대전 Anchor fixture 불일치 필드: ${Object.entries(checks).filter(([, matches]) => !matches).map(([field]) => field).join(", ")}`);
  }
  return Object.values(checks).every(Boolean);
}

async function ensureDaejeonAnchorFixture(
  prisma: PrismaClient,
  project: Awaited<ReturnType<typeof findExactProject>>,
) {
  if (!project.anchor) throw new Error(`Anchor QA 프로젝트 '${project.name}'에 ProjectAnchor가 없습니다.`);
  if (project.travelYear !== 2026 || project.travelMonth !== 9 || project.region.code !== DAEJEON_ANCHOR_FIXTURE.regionCode) {
    throw new Error(`대전 Anchor QA fixture의 지역·여행월이 예상과 다릅니다: ${project.name}`);
  }
  if (matchesDaejeonAnchorFixture(project.anchor)) return false;

  const updated = await prisma.projectAnchor.update({
    where: { id: project.anchor.id },
    data: {
      source: DAEJEON_ANCHOR_FIXTURE.source,
      sourceId: DAEJEON_ANCHOR_FIXTURE.sourceId,
      contentTypeId: DAEJEON_ANCHOR_FIXTURE.contentTypeId,
      name: DAEJEON_ANCHOR_FIXTURE.name,
      eventStartDate: DAEJEON_ANCHOR_FIXTURE.eventStartDate,
      eventEndDate: DAEJEON_ANCHOR_FIXTURE.eventEndDate,
      plannedDate: DAEJEON_ANCHOR_FIXTURE.plannedDate,
      plannedDayIndex: DAEJEON_ANCHOR_FIXTURE.plannedDayIndex,
      timeStatus: DAEJEON_ANCHOR_FIXTURE.timeStatus,
      timeSlot: DAEJEON_ANCHOR_FIXTURE.timeSlot,
      timeStart: DAEJEON_ANCHOR_FIXTURE.timeStart,
      timeEnd: DAEJEON_ANCHOR_FIXTURE.timeEnd,
      regionCode: DAEJEON_ANCHOR_FIXTURE.regionCode,
      address: DAEJEON_ANCHOR_FIXTURE.address,
      lat: DAEJEON_ANCHOR_FIXTURE.lat,
      lng: DAEJEON_ANCHOR_FIXTURE.lng,
      sourceSnapshot: DAEJEON_ANCHOR_FIXTURE.sourceSnapshot,
      provenance: DAEJEON_ANCHOR_FIXTURE.provenance,
    },
  });
  project.anchor = { ...project.anchor, ...updated };
  return true;
}

function courseDays(course: unknown): CourseDay[] {
  const days = asRecord(course).days;
  return Array.isArray(days) ? (days as CourseDay[]) : [];
}

async function ensureAnchorCourse(
  prisma: PrismaClient,
  project: Awaited<ReturnType<typeof findExactProject>>,
) {
  if (!project.input || !project.selectedPlan || !project.anchor) {
    throw new Error(`Anchor QA 프로젝트 '${project.name}'에 입력·저장 코스·ProjectAnchor가 모두 필요합니다.`);
  }
  if (project.anchor.status !== "CONFIRMED" || project.anchor.timeStatus !== "USER_CONFIRMED") {
    throw new Error(`Anchor QA 프로젝트 '${project.name}'의 Anchor가 확정 시각 상태가 아닙니다.`);
  }

  const days = courseDays(project.selectedPlan.course);
  const anchor = {
    ...project.anchor,
    updatedAt: project.anchor.updatedAt.toISOString(),
  };
  const current = findFestivalAnchorItems(days);
  const validation = validateFestivalAnchorCourseDays(days, anchor);
  if (current.length === 1 && current[0].item.anchorId === anchor.id && validation.ok) return false;

  const transport = project.input.transport as TransportCode;
  let normalizedDays = days;
  for (const existing of current) {
    if (existing.item.anchorId) normalizedDays = removeFestivalAnchorFromCourse(normalizedDays, existing.item.anchorId, transport);
  }
  const inserted = insertFestivalAnchorIntoCourse(normalizedDays, anchor, transport);
  if (!inserted.ok) throw new Error(`Anchor QA 코스 정규화 실패: ${project.name} — ${inserted.message}`);

  const normalizedCourse = { ...asRecord(project.selectedPlan.course), days: inserted.days } as unknown as Prisma.InputJsonValue;
  await prisma.selectedPlan.update({
    where: { projectId: project.id },
    data: { course: normalizedCourse },
  });
  project.selectedPlan.course = normalizedCourse as unknown as Prisma.JsonValue;
  return true;
}

async function prepareFixtures(): Promise<FixtureMap> {
  assertLocalDatabase();
  const connectionString = process.env.DATABASE_URL!;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const rows = await Promise.all(
      (Object.entries(QA_PROJECT_NAMES) as Array<[FixtureKey, string]>).map(async ([key, name]) => [
        key,
        await findExactProject(prisma, name),
      ] as const),
    );
    const projects = Object.fromEntries(rows) as Record<FixtureKey, Awaited<ReturnType<typeof findExactProject>>>;

    const daejeonAnchorUpdated = await ensureDaejeonAnchorFixture(prisma, projects.anchorDaejeon);
    console.log(
      daejeonAnchorUpdated
        ? "대전 Anchor QA fixture를 공식 행사 스냅샷으로 정합화했습니다."
        : "대전 Anchor QA fixture가 이미 공식 행사 스냅샷과 일치합니다.",
    );

    await Promise.all(
      (["anchorDaejeon", "anchorSejong", "anchorJecheon"] as const).map(async (key) => [
        key,
        await ensureAnchorCourse(prisma, projects[key]),
      ] as const),
    );

    const petAccessibility = projects.petAccessibility;
    if (!petAccessibility.input || !petAccessibility.selectedPlan) {
      throw new Error("PET/ACCESSIBILITY QA 프로젝트에 입력 또는 저장 코스가 없습니다.");
    }

    const currentInput = asRecord(petAccessibility.input.preferredThemes);
    const currentConditions = Array.isArray(currentInput.travelConditions)
      ? currentInput.travelConditions.filter((value): value is string => typeof value === "string")
      : [];
    const nextConditions = [...new Set([...currentConditions, "CONDITION_PET_FRIENDLY", "CONDITION_ACCESSIBLE"])];
    if (JSON.stringify(currentConditions) !== JSON.stringify(nextConditions)) {
      await prisma.projectInput.update({
        where: { projectId: petAccessibility.id },
        data: {
          preferredThemes: {
            ...currentInput,
            travelConditions: nextConditions,
          },
        },
      });
    }

    const fixtureRows = await Promise.all(
      (Object.entries(projects) as Array<[FixtureKey, (typeof projects)[FixtureKey]]>).map(async ([key, project]) => {
        if (!project.selectedPlan) throw new Error(`QA 프로젝트 '${project.name}'에 저장 코스가 없습니다.`);
        const items = courseItems(project.selectedPlan.course);
        const poiIds = [...new Set(items.map((item) => item.poiId).filter((id): id is string => Boolean(id)))];
        if (poiIds.length === 0) throw new Error(`QA 프로젝트 '${project.name}'의 코스에 POI가 없습니다.`);

        const evidence = await prisma.poiConditionEvidence.findMany({
          where: { poiId: { in: poiIds }, conditionType: { in: ["PET", "ACCESSIBILITY"] } },
          select: { conditionType: true },
        });

        const fixture: QaFixture = {
          id: project.id,
          name: project.name,
          coursePoiIds: poiIds,
          courseItemCount: items.length,
          hasAnchor: Boolean(project.anchor),
          anchor: project.anchor
            ? {
                sourceId: project.anchor.sourceId,
                name: project.anchor.name,
                eventStartDate: project.anchor.eventStartDate,
                eventEndDate: project.anchor.eventEndDate,
                plannedDate: project.anchor.plannedDate,
              }
            : null,
          petEvidenceCount: evidence.filter((row) => row.conditionType === "PET").length,
          accessibilityEvidenceCount: evidence.filter((row) => row.conditionType === "ACCESSIBILITY").length,
        };

        if (["anchorDaejeon", "anchorSejong", "anchorJecheon"].includes(key) && !fixture.hasAnchor) {
          throw new Error(`Anchor QA 프로젝트 '${project.name}'에 ProjectAnchor가 없습니다.`);
        }
        if (key === "petAccessibility" && (fixture.petEvidenceCount === 0 || fixture.accessibilityEvidenceCount === 0)) {
          throw new Error(`PET/ACCESSIBILITY 공식 evidence가 부족합니다: ${project.name}`);
        }
        return [key, fixture] as const;
      }),
    );

    return Object.fromEntries(fixtureRows) as FixtureMap;
  } finally {
    await prisma.$disconnect();
  }
}

function printEnvironment(fixtures: FixtureMap) {
  const anchor = fixtures.anchorDaejeon.anchor;
  if (!anchor) throw new Error("대전 Anchor QA fixture에 확정 Anchor가 없습니다.");
  const environment = {
    QA_GYEONGJU_ID: fixtures.gyeongju.id,
    QA_CHEONGJU_ID: fixtures.cheongju.id,
    QA_ANCHOR_PROJECT_ID: fixtures.anchorDaejeon.id,
    QA_SEJONG_ANCHOR_PROJECT_ID: fixtures.anchorSejong.id,
    QA_JECHEON_EMPTY_ANCHOR_PROJECT_ID: fixtures.anchorJecheon.id,
    QA_PET_PROJECT_ID: fixtures.petAccessibility.id,
    QA_ACCESSIBILITY_PROJECT_ID: fixtures.petAccessibility.id,
    QA_ANCHOR_EVENT_SOURCE_ID: anchor.sourceId,
    QA_ANCHOR_EVENT_NAME: anchor.name,
    QA_ANCHOR_EVENT_START_DATE: anchor.eventStartDate,
    QA_ANCHOR_EVENT_END_DATE: anchor.eventEndDate,
    QA_ANCHOR_EVENT_PLANNED_DATE: anchor.plannedDate,
  };

  console.log("로컬 QA fixture 확인 완료");
  for (const [key, value] of Object.entries(environment)) console.log(`${key}=${value}`);
  console.log("QA_ANCHOR_STALE/QA_ANCHOR_ORPHAN은 별도 예외 상태 fixture가 없어 선택적 skip으로 유지합니다.");
  console.log(
    `코스 상태: 경주 ${fixtures.gyeongju.courseItemCount}개, 청주 ${fixtures.cheongju.courseItemCount}개, ` +
      `대전 Anchor ${fixtures.anchorDaejeon.courseItemCount}개, 세종 Anchor ${fixtures.anchorSejong.courseItemCount}개, ` +
      `제천 빈 후보 Anchor ${fixtures.anchorJecheon.courseItemCount}개`,
  );
  console.log(
    `공식 evidence: PET ${fixtures.petAccessibility.petEvidenceCount}건, ` +
      `ACCESSIBILITY ${fixtures.petAccessibility.accessibilityEvidenceCount}건`,
  );
  return environment;
}

function quoteWindowsArgument(value: string) {
  if (/^[A-Za-z0-9_./\\:@=!?-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

async function runPlaywright(environment: Record<string, string>, args: string[]) {
  const isWindows = process.platform === "win32";
  const command = isWindows ? process.env.ComSpec ?? "cmd.exe" : "npx";
  const commandArgs = isWindows
    ? ["/d", "/s", "/c", ["npx", "playwright", "test", ...args].map(quoteWindowsArgument).join(" ")]
    : ["playwright", "test", ...args];
  const child = spawn(command, commandArgs, {
    cwd: process.cwd(),
    env: { ...process.env, ...environment },
    stdio: "inherit",
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  process.exitCode = exitCode;
}

async function main() {
  const fixtures = await prepareFixtures();
  const environment = printEnvironment(fixtures);
  const args = process.argv.slice(2).filter((argument) => argument !== "--run");
  if (process.argv.includes("--run")) await runPlaywright(environment, args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
