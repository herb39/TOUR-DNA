import { describe, expect, it } from "vitest";
import { REGION_SEED } from "@/lib/fixtures/regions";

/** 지원지역 확대(2026-08-07) — REGION_SEED 자체의 무결성을 코드로 보장한다. 실제 공공데이터 API
 * 응답과의 일치 여부(지역명 대조 등)는 이 파일 범위 밖이다 — 그건 `verify:region` 스크립트와 실제
 * 동기화 실행 시점에 사람이 실 서비스키로 확인한다(docs/public-api-status.md, docs/data-dictionary.md
 * 참고). 여기서는 "코드가 코드 자체로서 일관적인가"만 검증한다. */
describe("REGION_SEED — 무결성", () => {
  it("code가 중복되지 않는다", () => {
    const codes = REGION_SEED.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("모든 SIGUNGU는 실제 존재하는 SIDO code를 parentCode로 가진다", () => {
    const sidoCodes = new Set(REGION_SEED.filter((r) => r.level === "SIDO").map((r) => r.code));
    for (const r of REGION_SEED.filter((r) => r.level === "SIGUNGU")) {
      expect(sidoCodes.has(r.parentCode!)).toBe(true);
    }
  });

  it("SIDO는 parentCode가 null이다", () => {
    for (const r of REGION_SEED.filter((r) => r.level === "SIDO")) {
      expect(r.parentCode).toBeNull();
    }
  });

  it("SIGUNGU code는 SGG_ 접두사, SIDO code는 SIDO_ 접두사를 쓴다", () => {
    for (const r of REGION_SEED) {
      if (r.level === "SIGUNGU") expect(r.code.startsWith("SGG_")).toBe(true);
      else expect(r.code.startsWith("SIDO_")).toBe(true);
    }
  });

  /** 세종특별자치시(SGG_SEJONG)는 예외다 — TourAPI ldongCode2가 시/도 목록 단계에서 이미 세종을
   * 5자리 전체 코드("36110")로 반환하고, 그 코드로 하위 목록을 다시 조회해도 자기 자신만 돌아온다
   * (실 서비스키로 확인, 2026-08-09). 즉 세종은 시군구 하위분류 자체가 없는 TourAPI 조회 단위라
   * apiSigunguCode(36110)를 apiAreaCode(36) + 시군구 3자리로 분해할 수 없다(뒤 3자리가 없음).
   *
   * 전남광주통합(SIDO_JEONNAM_GWANGJU) 산하 27곳 전체도 예외다 — TourAPI 통합체계
   * (tourApiLdongRegnCd=12)가 실제 통계청 코드(각각 46/29)와 완전히 다른 번호 체계를 쓴다는 것이
   * 2026-08-09 baseYm=202606 실 서비스키 검증으로 확인됐다(예: 동구의 tourApiLdongSignguCd="210" ≠
   * 통계청 코드 뒤 3자리 "110" — regions.ts의 SIDO_JEONNAM_GWANGJU 주석 참고). 일부는 두 체계의
   * 숫자가 우연히 같기도 하지만(예: 담양군 "710"="710") 그건 SIDO 전체가 보장하는 관계가 아니라
   * 개별 우연이므로, 이 SIDO 전체를 예외로 제외한다. 다른 모든 SIDO는 이 동일성이 성립해야 한다. */
  it("apiSigunguCode가 있으면 apiAreaCode + 뒤 3자리가 일치한다(통계청 코드 체계 자체 검증, 세종·전남광주통합 예외)", () => {
    for (const r of REGION_SEED.filter(
      (r) => r.level === "SIGUNGU" && r.code !== "SGG_SEJONG" && r.parentCode !== "SIDO_JEONNAM_GWANGJU",
    )) {
      if (r.apiSigunguCode && r.apiAreaCode) {
        expect(r.apiSigunguCode.startsWith(r.apiAreaCode)).toBe(true);
        expect(r.apiSigunguCode.slice(r.apiAreaCode.length)).toBe(r.tourApiLdongSignguCd);
      }
    }
  });

  it("세종특별자치시는 apiSigunguCode 자체가 5자리 전체 코드(36110)와 같다(시군구 하위분류 없음, 실 API 확인)", () => {
    const sejong = REGION_SEED.find((r) => r.code === "SGG_SEJONG");
    expect(sejong?.apiSigunguCode).toBe("36110");
    expect(sejong?.tourApiLdongSignguCd).toBeNull();
  });

  it("tourApiLdongRegnCd는 apiAreaCode와 항상 같다(문서에 기록된 코드 체계 동일성 전제, 세종·전남광주통합 예외)", () => {
    for (const r of REGION_SEED) {
      if (r.code === "SIDO_SEJONG" || r.code === "SGG_SEJONG") continue;
      if (r.code === "SIDO_JEONNAM_GWANGJU" || r.parentCode === "SIDO_JEONNAM_GWANGJU") continue;
      if (r.apiAreaCode && r.tourApiLdongRegnCd) {
        expect(r.tourApiLdongRegnCd).toBe(r.apiAreaCode);
      }
    }
  });

  /** 전국 단위로 보면 "중구"/"동구"/"서구"/"남구"/"북구" 같은 이름이 여러 SIDO에 걸쳐 실제로
   * 반복된다(2026-08-09 전국 확장 시 실 API로 확인 — 예: 서울/부산/대구/울산/대전에 모두 "중구"가
   * 있다). 이름 자체의 전국 유일성은 더 이상 성립하지 않으므로, 실제로 지켜야 하는 불변조건인
   * "같은 SIDO 아래에서는 이름이 겹치지 않는다"로 좁혀 검증한다 — 지역 식별은 이름이 아니라 항상
   * Region.code/parentCode 조합으로 한다는 원칙(사용자 요구사항)과 일치한다. */
  it("같은 SIDO 안에서는 SIGUNGU 지역명이 중복되지 않는다(전국 단위 동일 이름은 SIDO로 구분)", () => {
    const bySido = new Map<string, string[]>();
    for (const r of REGION_SEED.filter((r) => r.level === "SIGUNGU")) {
      const arr = bySido.get(r.parentCode!) ?? [];
      arr.push(r.name);
      bySido.set(r.parentCode!, arr);
    }
    for (const [sidoCode, names] of bySido) {
      expect(new Set(names).size, `${sidoCode} 안에서 지역명 중복`).toBe(names.length);
    }
  });

  /** 2026-08-07 지원지역 확대 Batch 1·2 — 유사지역 비교 모집단을 기존 7곳에서 넓히는 단계.
   * 정확한 최종 개수는 이 테스트가 "최소 N개"만 보장해, Batch 3에서 지역이 더 늘어도 이 테스트를
   * 깨지 않는다. */
  it("지원지역이 기존 7곳보다 늘어났다(Batch 2 이상 반영)", () => {
    const sigunguCount = REGION_SEED.filter((r) => r.level === "SIGUNGU").length;
    expect(sigunguCount).toBeGreaterThanOrEqual(27);
  });

  /** 2026-08-09 전국 Region 마스터 확장 — 실 서비스키로 ldongCode2 전체 목록을 조회해 확인한
   * 전국 16개 SIDO(서울/전남광주통합/부산/대구/인천/대전/울산/경기/충북/충남/경북/경남/제주/
   * 강원/전북/세종)를 전부 등록했는지 회귀 검증한다. 목록이 실제 API 응답과 다르면(예: 명칭이
   * 다시 개편되는 등) 이 테스트가 실패해 조용히 놓치지 않게 한다. */
  it("전국 SIDO 16개가 모두 등록되어 있다(2026-08-09 실 서비스키 ldongCode2 조회 기준)", () => {
    const sidoNames = REGION_SEED.filter((r) => r.level === "SIDO")
      .map((r) => r.name)
      .sort();
    // "전남광주통합특별시"는 광주광역시+전라남도가 통합된 실제 행정구역명이다(실 서비스키 ldongCode2
    // 응답으로 확인, 2026-08-09 — 별도의 "광주광역시"/"전라남도" 항목은 존재하지 않는다).
    expect(sidoNames).toEqual(
      [
        "강원특별자치도",
        "경기도",
        "경상남도",
        "경상북도",
        "대구광역시",
        "대전광역시",
        "부산광역시",
        "서울특별시",
        "세종특별자치시",
        "울산광역시",
        "인천광역시",
        "전남광주통합특별시",
        "전북특별자치도",
        "제주특별자치도",
        "충청남도",
        "충청북도",
      ].sort(),
    );
  });

  /** 2026-08-09 전남광주통합 통계 코드 완성 — 27곳 전부 실응답 기반으로 검증됐다: 대표 표본 2곳
   * (구 광주 동구·구 전남 목포시)은 4개 통계 소스 전부 실 조회로, 나머지 25곳은 VISITOR_CNT 전국
   * 응답(baseYm=202606)의 signguCode/signguNm을 areaCode 29/46로 필터링해 지역명과 정확히 1:1
   * 매칭한 뒤 대표 4곳(광주 서구·광산구, 전남 여수시·신안군)을 TOU_DIV_IX로 교차 검증했다(추측 없음,
   * regions.ts의 SIDO_JEONNAM_GWANGJU 주석 참고). 이제 255개 SIGUNGU 전부 통계청 코드를 보유해야
   * 한다. */
  it("전남광주통합 27곳을 포함해 255개 SIGUNGU 전부 apiAreaCode/apiSigunguCode(통계청 코드)가 채워져 있다", () => {
    const missing = REGION_SEED.filter((r) => r.level === "SIGUNGU" && (!r.apiAreaCode || !r.apiSigunguCode));
    expect(missing).toEqual([]);

    const jeonnamGwangjuSigungu = REGION_SEED.filter((r) => r.parentCode === "SIDO_JEONNAM_GWANGJU");
    expect(jeonnamGwangjuSigungu).toHaveLength(27);
    expect(jeonnamGwangjuSigungu.every((r) => r.apiAreaCode && r.apiSigunguCode)).toBe(true);
  });

  it("전남광주통합 27곳의 통계청 코드가 실응답 대조값과 정확히 일치한다(구 광주 5곳=areaCd 29, 구 전남 22곳=areaCd 46)", () => {
    const EXPECTED: Record<string, [string, string]> = {
      SGG_JEONNAM_GWANGJU_110: ["46", "46110"], // 목포시
      SGG_JEONNAM_GWANGJU_130: ["46", "46130"], // 여수시
      SGG_JEONNAM_GWANGJU_150: ["46", "46150"], // 순천시
      SGG_JEONNAM_GWANGJU_170: ["46", "46170"], // 나주시
      SGG_JEONNAM_GWANGJU_190: ["46", "46230"], // 광양시
      SGG_JEONNAM_GWANGJU_210: ["29", "29110"], // 동구
      SGG_JEONNAM_GWANGJU_240: ["29", "29140"], // 서구
      SGG_JEONNAM_GWANGJU_270: ["29", "29155"], // 남구
      SGG_JEONNAM_GWANGJU_300: ["29", "29170"], // 북구
      SGG_JEONNAM_GWANGJU_330: ["29", "29200"], // 광산구
      SGG_JEONNAM_GWANGJU_710: ["46", "46710"], // 담양군
      SGG_JEONNAM_GWANGJU_720: ["46", "46720"], // 곡성군
      SGG_JEONNAM_GWANGJU_730: ["46", "46730"], // 구례군
      SGG_JEONNAM_GWANGJU_740: ["46", "46770"], // 고흥군
      SGG_JEONNAM_GWANGJU_750: ["46", "46780"], // 보성군
      SGG_JEONNAM_GWANGJU_760: ["46", "46790"], // 화순군
      SGG_JEONNAM_GWANGJU_770: ["46", "46800"], // 장흥군
      SGG_JEONNAM_GWANGJU_780: ["46", "46810"], // 강진군
      SGG_JEONNAM_GWANGJU_790: ["46", "46820"], // 해남군
      SGG_JEONNAM_GWANGJU_800: ["46", "46830"], // 영암군
      SGG_JEONNAM_GWANGJU_810: ["46", "46840"], // 무안군
      SGG_JEONNAM_GWANGJU_820: ["46", "46860"], // 함평군
      SGG_JEONNAM_GWANGJU_830: ["46", "46870"], // 영광군
      SGG_JEONNAM_GWANGJU_840: ["46", "46880"], // 장성군
      SGG_JEONNAM_GWANGJU_850: ["46", "46890"], // 완도군
      SGG_JEONNAM_GWANGJU_860: ["46", "46900"], // 진도군
      SGG_JEONNAM_GWANGJU_870: ["46", "46910"], // 신안군
    };
    expect(Object.keys(EXPECTED)).toHaveLength(27);

    for (const [code, [areaCd, sigunguCd]] of Object.entries(EXPECTED)) {
      const region = REGION_SEED.find((r) => r.code === code);
      expect(region, `${code} 없음`).toBeDefined();
      expect(region?.apiAreaCode, `${code} apiAreaCode`).toBe(areaCd);
      expect(region?.apiSigunguCode, `${code} apiSigunguCode`).toBe(sigunguCd);
    }

    const gwangjuCount = Object.values(EXPECTED).filter(([areaCd]) => areaCd === "29").length;
    const jeonnamCount = Object.values(EXPECTED).filter(([areaCd]) => areaCd === "46").length;
    expect(gwangjuCount).toBe(5);
    expect(jeonnamCount).toBe(22);
  });
});

/** 2026-08-13 대전 지역 선택 정합성 수정 — `SGG_DAEJEON`은 대전 전국 확장(2026-08-09, 동구/중구/서구/
 * 대덕구 4개 SIGUNGU 추가) 이전에 만들어진 대전의 유일한 SIGUNGU 레코드로, code/apiSigunguCode 등은
 * 처음부터 유성구(apiSigunguCode=30200, tourApiLdongSignguCd=200) 데이터였지만 name만 "대전광역시"로
 * 남아 있었다. 시/도 드롭다운에서 대전을 고르면 실제 5개 자치구 대신 legacy "대전광역시" 항목과 나머지
 * 4개가 섞여 나오는 문제였다 — 데이터 자체를 다시 수집하지 않고 name만 실제 의미대로 바로잡았다
 * (regionQueries.ts 주석 참고). */
describe("REGION_SEED — 대전 지역 선택 정합성 수정(2026-08-13)", () => {
  it("대전 SIGUNGU는 legacy 대체 표시(대전광역시 (DNA 지표는 유성구 기준)) 없이 실제 5개 자치구만 노출된다", () => {
    const daejeon = REGION_SEED.filter((r) => r.level === "SIGUNGU" && r.parentCode === "SIDO_DAEJEON");
    const names = daejeon.map((r) => r.name).sort();
    expect(names).toEqual(["대덕구", "동구", "서구", "유성구", "중구"]);
    expect(names.some((n) => n.includes("DNA 지표는"))).toBe(false);
    expect(names).not.toContain("대전광역시"); // SIDO명이 SIGUNGU 레벨에 중복 노출되던 legacy 문제가 없다
  });

  it("SGG_DAEJEON은 code/FK를 그대로 유지한 채(기존 Project 호환) name만 유성구로 바로잡혔다", () => {
    const yuseong = REGION_SEED.find((r) => r.code === "SGG_DAEJEON");
    expect(yuseong).toBeDefined();
    expect(yuseong?.name).toBe("유성구"); // legacy "대전광역시" 표기가 아니라 실제 의미로 정정됨
    expect(yuseong?.parentCode).toBe("SIDO_DAEJEON");
    // 유성구 데이터임을 보장하는 행정 코드(apiSigunguCode=30200, tourApiLdongSignguCd=200)는 그대로다
    // — code 자체를 바꾸지 않았으므로 이 code를 참조하는 기존 Project.regionId(FK)/URL은 영향받지 않는다.
    expect(yuseong?.apiSigunguCode).toBe("30200");
    expect(yuseong?.tourApiLdongSignguCd).toBe("200");
  });

  it("다른 SIDO의 시군구 옵션은 이 수정으로 전혀 영향받지 않는다(전국 255개 시군구 개수 불변)", () => {
    const sigunguCount = REGION_SEED.filter((r) => r.level === "SIGUNGU").length;
    expect(sigunguCount).toBe(255);
    const nonDaejeonSampleNames = REGION_SEED.filter(
      (r) => r.level === "SIGUNGU" && r.parentCode === "SIDO_GANGWON",
    ).map((r) => r.name);
    expect(nonDaejeonSampleNames).toContain("강릉시");
    expect(nonDaejeonSampleNames.some((n) => n.includes("DNA 지표는"))).toBe(false);
  });
});
