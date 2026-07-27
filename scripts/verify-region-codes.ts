/**
 * 새 지역을 REGION_SEED(src/lib/fixtures/regions.ts)에 추가하기 전에, 후보 코드가 실제로 그 지역을
 * 가리키는지 실 서비스키로 확인하는 스크립트다.
 *
 * 지금까지는 이 확인을 사람이 직접 curl로 호출하고 JSON을 눈으로 읽어가며 했다(여러 번 잘못된 코드를
 * 추측해 다른 지역이 반환되는 걸 사후에 발견한 적이 있다). 이 스크립트는 같은 확인을 자동화해서 응답의
 * areaNm/signguNm(통계청 코드) 또는 ldongCode2 목록(TourAPI 신 법정동 코드)을 그대로 보여준다 —
 * 최종 판단(이름이 실제로 일치하는지)은 여전히 사람이 하지만, API 호출과 파싱은 반복하지 않아도 된다.
 *
 * 2026-07-27: TourAPI 구코드(areaCode2) → 신 법정동 코드(ldongCode2) 전환에 맞춰 이 스크립트도
 * ldongCode2를 호출하도록 갱신했다. lclsSystmCode2(신 분류체계 코드) 조회 헬퍼도 함께 추가했다 —
 * `src/lib/public-data/adapters/tourInfo.ts`의 FOOD_SUBCATEGORY_NAME_BY_LCLS_SYSTM3(현재 빈 테이블)를
 * 채울 실제 코드값을 확인할 때 쓴다.
 *
 * 사용법:
 *   npm run verify:region -- --name 여수시 --area-cd 46 --signgu-cd 46230 --ldong-regn-cd 38
 *   npm run verify:region -- --name (분류확인용, 무시됨) --lcls-systm1 FD
 */
import { z } from "zod";
import { fetchPublicDataJson } from "../src/lib/public-data/client";
import { parsePublicDataEnvelope } from "../src/lib/public-data/types";
import { DATA_SOURCE_SEED } from "../src/lib/fixtures/dataSources";
import { DEFAULT_BASE_YM } from "../src/lib/fixtures/metrics";

const passthroughItemSchema = z.object({}).passthrough();

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      out[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

function baseUrlFor(code: string): string {
  const source = DATA_SOURCE_SEED.find((d) => d.code === code);
  if (!source) throw new Error(`DATA_SOURCE_SEED에 ${code}가 없습니다.`);
  return source.baseUrl;
}

/** 통계청 행정표준코드(areaCd/signguCd)가 실제 존재하는 지역을 가리키는지, 다양성 API로 확인한다. */
async function checkStatCode(serviceKey: string, areaCd: string, signguCd: string, baseYm: string) {
  const qs = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    areaCd,
    signguCd,
    baseYm,
    touDivIxCd: "3101",
    numOfRows: "5",
    pageNo: "1",
    _type: "json",
  });
  const url = `${baseUrlFor("TOU_DIV_IX")}/areaTouDivList?${qs.toString()}`;
  const res = await fetchPublicDataJson(url, { sourceCode: "VERIFY:STAT_CODE" });
  if (!res.ok) return { ok: false as const, reason: res.errorMessage ?? "요청 실패" };
  const parsed = parsePublicDataEnvelope(passthroughItemSchema, res.data);
  return { ok: parsed.status === "SUCCESS", status: parsed.status, resultMsg: parsed.resultMsg, items: parsed.items };
}

/** TourAPI(KorService2) ldongCode2 오퍼레이션으로 법정동 코드 전체 목록을 가져온다(추측이 아니라
 * 원본 목록). lDongRegnCd 없이 호출하면 시/도 목록, lDongRegnCd를 주면 그 시/도의 시군구 목록이 온다
 * (신 법정동 체계 문서 기준 — 이번 세션은 401로 실제 응답 스키마를 확인하지 못했으므로, 응답 필드는
 * passthrough로 그대로 사람이 눈으로 확인해야 한다). */
async function listLdongCodes(serviceKey: string, lDongRegnCd?: string) {
  const qs = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    numOfRows: "50",
    pageNo: "1",
    _type: "json",
  });
  if (lDongRegnCd) qs.set("lDongRegnCd", lDongRegnCd);
  const url = `${baseUrlFor("TOUR_INFO")}/ldongCode2?${qs.toString()}`;
  const res = await fetchPublicDataJson(url, { sourceCode: "VERIFY:TOUR_API_LDONG" });
  if (!res.ok) return { ok: false as const, reason: res.errorMessage ?? "요청 실패", items: [] as unknown[] };
  const parsed = parsePublicDataEnvelope(passthroughItemSchema, res.data);
  return { ok: parsed.status === "SUCCESS", items: parsed.items };
}

/** TourAPI(KorService2) lclsSystmCode2 오퍼레이션으로 신 분류체계 코드 목록을 가져온다. lclsSystm1
 * (대분류, 예: 음식)만 주면 그 아래 lclsSystm2 목록, lclsSystm1+2를 주면 lclsSystm3(소분류) 목록이
 * 온다 — src/lib/public-data/adapters/tourInfo.ts의 FOOD_SUBCATEGORY_NAME_BY_LCLS_SYSTM3(현재 빈
 * 테이블)을 실제 코드값으로 채울 때 이 결과를 사람이 직접 확인해서 채워 넣어야 한다. */
async function listLclsSystmCodes(serviceKey: string, lclsSystm1?: string, lclsSystm2?: string) {
  const qs = new URLSearchParams({
    serviceKey,
    MobileOS: "ETC",
    MobileApp: "TourDNA",
    numOfRows: "50",
    pageNo: "1",
    _type: "json",
  });
  if (lclsSystm1) qs.set("lclsSystm1", lclsSystm1);
  if (lclsSystm2) qs.set("lclsSystm2", lclsSystm2);
  const url = `${baseUrlFor("TOUR_INFO")}/lclsSystmCode2?${qs.toString()}`;
  const res = await fetchPublicDataJson(url, { sourceCode: "VERIFY:TOUR_API_LCLS_SYSTM" });
  if (!res.ok) return { ok: false as const, reason: res.errorMessage ?? "요청 실패", items: [] as unknown[] };
  const parsed = parsePublicDataEnvelope(passthroughItemSchema, res.data);
  return { ok: parsed.status === "SUCCESS", items: parsed.items };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const serviceKey = process.env.TOUR_API_SERVICE_KEY;
  if (!serviceKey) {
    console.error("TOUR_API_SERVICE_KEY가 설정되지 않았습니다(.env.local 확인).");
    process.exitCode = 1;
    return;
  }
  if (!args.name && !args["lcls-systm1"]) {
    console.error(
      "사용법: npm run verify:region -- --name <지역명> [--area-cd <시도2자리> --signgu-cd <시군구5자리>] [--ldong-regn-cd <신 법정동 코드>]\n" +
        "       npm run verify:region -- --lcls-systm1 <대분류 코드> [--lcls-systm2 <중분류 코드>] (분류 코드만 확인할 때, --name 생략 가능)",
    );
    process.exitCode = 1;
    return;
  }

  const baseYm = args["base-ym"] ?? process.env.TOUR_DATA_BASE_YM ?? DEFAULT_BASE_YM;
  console.log(`\n=== "${args.name}" 지역 코드 검증 (baseYm=${baseYm}) ===\n`);

  if (args["area-cd"] && args["signgu-cd"]) {
    console.log(`[통계청 행정표준코드] areaCd=${args["area-cd"]}, signguCd=${args["signgu-cd"]}`);
    const result = await checkStatCode(serviceKey, args["area-cd"], args["signgu-cd"], baseYm);
    if (result.ok) {
      console.log("  PASS — 응답 원본:");
      console.log("  " + JSON.stringify(result.items, null, 2).replace(/\n/g, "\n  "));
      console.log(`  ↑ 위 항목의 areaNm/signguNm이 "${args.name}"과(와) 일치하는지 직접 확인하세요.`);
    } else {
      console.log(
        `  FAIL — status=${"status" in result ? result.status : "N/A"} resultMsg=${
          "resultMsg" in result ? result.resultMsg : result.reason
        }`,
      );
    }
  } else {
    console.log("[통계청 행정표준코드] --area-cd/--signgu-cd 미입력 — 건너뜀");
  }

  if (args["ldong-regn-cd"]) {
    console.log(`\n[TourAPI 신 법정동 코드] ldongRegnCd=${args["ldong-regn-cd"]}`);
    const result = await listLdongCodes(serviceKey);
    if (result.ok) {
      const match = result.items.find((item) => (item as Record<string, unknown>).code === args["ldong-regn-cd"]);
      if (match) {
        console.log(`  PASS — ${JSON.stringify(match)}`);
        console.log(`  ↑ name이 "${args.name}"이(가) 속한 시/도명과 일치하는지 확인하세요.`);
      } else {
        console.log(`  FAIL — ldongCode2 전체 목록에서 code=${args["ldong-regn-cd"]}를 찾을 수 없습니다.`);
        console.log("  전체 목록: " + JSON.stringify(result.items));
      }
    } else {
      console.log(`  FAIL — ${result.reason}`);
    }
  } else {
    console.log("\n[TourAPI 신 법정동 코드] --ldong-regn-cd 미입력 — 건너뜀");
  }

  if (args["lcls-systm1"]) {
    console.log(`\n[TourAPI 신 분류체계 코드] lclsSystm1=${args["lcls-systm1"]} lclsSystm2=${args["lcls-systm2"] ?? "(없음)"}`);
    const result = await listLclsSystmCodes(serviceKey, args["lcls-systm1"], args["lcls-systm2"]);
    if (result.ok) {
      console.log("  PASS — 응답 원본(사람이 직접 확인 후 tourInfo.ts의 관련 테이블에 반영):");
      console.log("  " + JSON.stringify(result.items, null, 2).replace(/\n/g, "\n  "));
    } else {
      console.log(`  FAIL — ${result.reason}`);
    }
  }

  console.log(
    "\n지역 코드 검증이 끝나면 src/lib/fixtures/regions.ts의 REGION_SEED(tourApiLdongRegnCd/" +
      "tourApiLdongSignguCd)에 반영하고 npm run db:seed를 실행하세요. 분류 코드 검증이 끝나면 " +
      "src/lib/public-data/adapters/tourInfo.ts의 FOOD_SUBCATEGORY_NAME_BY_LCLS_SYSTM3/" +
      "NON_MEAL_FOOD_LCLS_SYSTM3_CODES에 반영하세요.\n",
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
