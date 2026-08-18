# TOUR DNA — 데이터 기반 지역 관광사업 의사결정 플랫폼

TOUR-DNA는 여행사·DMC, 지자체·관광재단, 축제 기획자 실무자를 위한 B2B 관광사업 의사결정 서비스입니다.
공공데이터로 지역의 관광 DNA를 진단하고, 지역이 풀어야 할 문제와 새로운 사업 기회를 발견한 뒤
전략 수립·사전검증·실행안·홍보자료·보고서·성과관리까지 하나의 흐름으로 연결합니다.

> 단순히 관광 코스를 만들어주는 AI가 아니라, **무엇을 왜 만들어야 하는지 찾고 실제 사업으로 추진할 수
> 있는지를 근거와 함께 검증하는 플랫폼**을 지향합니다.

**주요 사용자**: 여행사/DMC 실무자, 지자체·관광재단 담당자, 축제 기획자

**운영 배포**: https://tour-dna.lib.lc (Vercel + Neon PostgreSQL)

**저장소**: https://github.com/herb39/TOUR-DNA (`main` 브랜치)

## 제품 방향과 핵심 차별점

일반적인 B2C 관광 추천 서비스가 사용자의 취향에 맞는 여행 코스를 만드는 데 집중한다면,
TOUR-DNA는 기관과 기업이 관광사업을 기획하고 예산·협력·성과 기준을 결정하는 과정을 지원합니다.

| 단계 | 핵심 질문 | 주요 결과물 |
|---|---|---|
| 지역 진단 | 이 지역의 관광 강점과 취약점은 무엇인가? | 체류·소비·다양성·서비스 수요·네트워크 DNA |
| 기회 발굴 | 지금 우선 검토할 관광사업은 무엇인가? | 계절·타깃·공급 격차 기반 사업 기회 3안 |
| 전략 설계 | 역할과 목표에 맞는 사업 구조는 무엇인가? | 지자체·관광재단·여행사별 전략 비교 |
| 사업 사전검증 | 실제 추진할 수 있으며 어떤 보완이 필요한가? | 적합성·차별성·이동·공급·위험·데이터 신뢰도 |
| 실행·성과관리 | 어떻게 운영하고 무엇으로 성과를 측정하는가? | 코스·예산 항목·협력 대상·KPI·홍보·보고서 |

### 서비스가 지키는 원칙

- 모든 분석과 추천을 출처·기준월·데이터 품질과 함께 제시합니다.
- 근거가 부족할 때 임의의 수치나 장소로 결과를 채우지 않고 판단 한계와 보완사항을 표시합니다.
- 정확한 성과 수치를 함부로 예측하지 않고 `예상 효과 + 판단 근거 + 검증 KPI`로 표현합니다.
- 전국 확장은 지역 선택지만 늘리는 방식이 아니라 데이터 완전성·유사지역 비교·운영 품질을 함께 보장합니다.
- AI 결과를 그대로 확정하지 않고 실무자가 코스·KPI·위험·홍보문구를 편집하고 저장할 수 있게 합니다.

### 역할별 맞춤 기획

동일 지역의 관광 DNA 진단(5축 점수, 유사지역 비교)은 역할과 무관하게 객관적인 데이터 기준을
그대로 유지합니다. 이후 전략 우선순위와 실행안(KPI·체크리스트·위험요소·일부 예산·협력 대상 설명)은
사용자의 역할에 따라 서로 다른 실무 관점으로 제안합니다 — 데이터를 역할에 맞게 바꾸는 것이 아니라,
같은 데이터 진단을 서로 다른 관점으로 해석하는 방식입니다.

- **여행사/DMC**: 상품성, 판매 전환, 고객 경험, 체류·소비, 예약·운영 리스크 관점
- **지자체/관광재단**: 지역 관광 활성화, 정책 성과, 지역 자원 활용, 이해관계자 협력 관점
- **축제 기획자**: 프로그램 운영, 집객, 주변 관광 연계, 혼잡·안전, 현장 운영 관점

### 유사지역 벤치마킹 포인트

유사지역 비교(DNA 5축·관광 자원 구성이 가장 비슷한 지원 지역 top3)에 이제 "무엇을 벤치마킹할 수
있는가"를 덧붙입니다. 이 지역의 가장 약한 DNA 축(최대 2개)을, 유사지역 중 그 축을 뚜렷하게(기존
벤치마킹 임계값과 동일) 앞서는 지역과 연결해 데이터 차이·해석·참고 방향 3단계로 보여줍니다. 등록
관광지 카테고리 비중 차이가 확인되면 그 근거도 함께 표시합니다. 조건을 만족하는 유사지역이 없으면
억지로 추천하지 않고 그 사실을 그대로 안내합니다("현재 유사지역 중 명확한 벤치마킹 우위가 확인되는
지역이 없습니다") — 강릉·경주·제천 대표 프로젝트에서도 실제로 결과가 지역마다 다르게 나옵니다.

2026-08-13: 분석·실행안 화면 상단에 "역할별 핵심 의사결정 요약" 한 줄을 추가했다 — DNA 5축 중
가장 약한 축을 역할별로 다른 문장(우선 검토할 판단·실행 방향)으로 풀어낸다. 전략 3안 비교표에는
"내 역할 적합도" 배지를 기본 표(더보기를 펼치지 않아도 보이는 영역)에 추가했다.

1순위 추천 전략에는 "추천 근거" 블록으로 **데이터 진단 → 해석 → 추천 이유 → 실행 방향**이 이어지는
설명을 추가했다(계산은 그대로, 이미 저장된 값만 재배열) — "왜 이 전략이 1위인가"를 전략 카드에서
바로 확인할 수 있다.

### 대상 수상과 실서비스를 함께 잡는 전략

공모전에서는 강릉·경주·제천 대표 시나리오를 완성도 높게 검증하며, 로컬 개발 DB 기준으로는 이미
전국 SIGUNGU 255/255 지역의 관광 데이터 동기화·품질 감사(PASS)·DNA 분석을 완료했습니다(2026-08-11,
아래 "현재 구현 상태" 참고 — Production 배포는 별도 확인 필요). 전국 데이터의 품질을 자동 검사하고
검증된 기준월(ACTIVE Dataset)만 분석에 사용해, 데이터가 부족하거나 아직 검증되지 않은 지역/기준월
에서는 결과를 지어내지 않는 것이 핵심 경쟁력입니다.

> 전국 관광 데이터를 기반으로 지역의 관광 문제와 사업 기회를 발견하고, 유사지역과 비교하여
> 사업전략 수립부터 사전검증·실행안·성과관리까지 지원합니다.

## 현재 구현 상태 (2026-08-11 기준)

로컬 코드 구현, 로컬 자동 테스트, GitHub 반영, DB 적용, 실제 배포는 서로 다른 단계다 — 아래 표는 이
네 가지를 섞지 않고 구분한다. 상세 근거와 커밋 단위는 [docs/implementation-status.md](docs/implementation-status.md) 참고.

### 2026-08-11 최신 라운드 요약(로컬 DB 기준, `main` 최신 커밋 `ccc09a8`까지 push 완료)

이번 라운드는 GitHub `main`에는 전부 반영됐지만, **Production Neon DB/Vercel 배포에는 아직
검증·반영하지 않았다** — 아래 항목은 전부 로컬 PostgreSQL(`tour_dna_local`) 기준이다.

- **전국 데이터 동기화**: SIGUNGU 255/255 완료, 필수 source(TAR_SVC_DEM/TOU_DIV_IX/TOU_RES_DEM/
  TOUR_INFO) 전부 SUCCESS 또는 EMPTY, ERROR 0. `npm run audit:tourism-data -- --base-ym=202606` 최종
  판정 **PASS**. DNA 분석 가능 지역 255/255, POI 미수집 지역 0. VISITOR_CNT는 SIGUNGU 255 + SIDO 15 =
  270건(기초·광역 원자적 게이트로 별도 관리). Region master는 SIDO 16 + SIGUNGU 255 = 총 271.
- **DNA normalization 개선**: 전국 255개 지역 감사에서 Demand(`tarSvcDemIxVal`/`touResDemIxVal`)와
  Spend(`tarExpDsIxVal`)가 강한 우편향 분포·극단값 민감도(소수 극단 지역만 코호트에 들고나도 나머지
  지역 점수가 크게 흔들림)를 보여, 이 세 metric에 한해 `log1p(raw) → 동일 SIGUNGU/baseYm 코호트
  min-max`를 적용했다(`src/lib/domain/normalize.ts`/`dna.ts`). Stay(`tarSjrnDsIxVal`)·
  Diversity(`touDivIxVal`)는 기존 선형 min-max 그대로, Network는 별도 산식 그대로, 방문자수 증감률은
  부호가 있는 값이라 log1p를 쓰지 않고 기존 계산식을 유지했다. percentile 방식도 비교했으나 강점/약점
  라벨이 대규모로 바뀌고 유사지역·전략 1위 결과가 흔들려 채택하지 않았다(자세한 QA 근거는
  `docs/scoring-model.md`/`docs/implementation-status.md` 참고). 사용자 화면 표시는 기존과 동일하게
  `toDisplayDnaScore`로 10~90 범위 변환한다(내부 raw는 0~100 그대로).
- **검증된 데이터셋(ACTIVE Dataset) 기반, Phase 2-A**: 신규 `Dataset`(baseYm+status:
  STAGING/ACTIVE/ARCHIVED) 레지스트리를 추가해, 분석이 "DB에 있는 가장 최신 baseYm"이 아니라
  명시적으로 검증·승격된 baseYm만 쓰도록 바꿨다(`src/lib/services/activeDataset.ts`의
  `getActiveDatasetBaseYm()`). 현재 로컬 ACTIVE는 `202606`이며, `npm run dataset:activate -- --base-ym=202606`으로
  승격했다. 새 baseYm이 일부 지역만 수집돼 있어도(STAGING) ACTIVE로 승격 전까지는 분석에 전혀
  섞이지 않는다(실제 DB에 가짜 202607 데이터를 넣어 혼입되지 않음을 확인). **Phase 2-B(source별
  최신월 저비용 탐지 + STAGING 생성 + 기존 resumable sync 재사용 증분 수집)는 구현 완료**했다 —
  `npm run dataset:discover`로 새 baseYm을 발견하면 STAGING만 생성하고(ACTIVE는 안 바뀜),
  `npm run sync:tourism-data -- --dataset=staging --all-regions --max-regions=N`으로 여러 회차에
  나눠 채운 뒤 `npm run dataset:status`로 진행률을 확인한다. **Phase 2-C(completeness/audit +
  DNA drift gate 통과 후에만 승격 허용)도 구현 완료**했다(2026-08-12) — `npm run dataset:activate`가
  이제 completeness만 보고 바로 승격하지 않고, 내부적으로 DNA 5축 drift(전국 median/p90/p95/rank
  correlation/decile churn)·strength·weakness 변화·유사지역 Top3 변화·대표 시나리오 전략 1위 변화를
  전부 확인해 PASS일 때만 승격한다. REVIEW_REQUIRED/BLOCKED면 기존 ACTIVE를 그대로 두고 사람이
  검토해야 한다 — `--force`/`--skip-drift` 같은 우회 옵션은 없다. 승격 전에 미리 결과만 보려면
  읽기 전용 `npm run dataset:drift -- --base-ym=YYYYMM`을 쓴다. threshold는 아직 실제 두 번째
  전국 dataset의 월간 drift를 관측하기 전이라 잠정값이다(`src/lib/domain/datasetDriftGate.ts`의
  `DRIFT_GATE_THRESHOLDS` 참고). **Phase 2-D(TOUR_INFO Freshness TTL + POI Reuse)도 구현
  완료**했다(2026-08-12) — TOUR_INFO(POI 목록 API)는 baseYm에 종속되지 않는 정적 API인데도 이전에는
  새 STAGING baseYm마다 전국 255개 지역을 무조건 재호출했다. 이제 region의 최근 TOUR_INFO
  SUCCESS/EMPTY가 TTL(60일) 이내면 API를 다시 호출하지 않고 기존 POI를 그대로 재사용한다(가짜
  SUCCESS snapshot을 만들지 않음). completeness/audit도 이 재사용을 함께 인정하되 TOUR_INFO를
  게이트에서 빼지 않는다 — POI 자체가 없거나 정말 오래됐으면 여전히 미완료로 판정된다. TTL을
  기다리지 않고 강제로 갱신하려면 `npm run sync:tourism-data -- --all-regions --max-regions=N
  --force-tour-info`를 쓴다.
- **홍보 콘텐츠 LLM(OpenRouter)**: provider는 OpenRouter, 기본 모델은 무료 티어
  `google/gemma-4-26b-a4b-it:free`(`OPENROUTER_API_KEY`/`OPENROUTER_PROMO_MODEL` 환경변수, Anthropic
  연동은 완전히 제거됨). 7개 채널(제안서 요약/랜딩/Instagram/블로그/카드뉴스/숏폼/역할별 콘텐츠)을
  JSON Schema structured output으로 한 번에 생성한 뒤 Zod로 재검증하고, DNA·전략·POI·실행안·유사지역
  같은 정량 계산에는 LLM을 전혀 관여시키지 않는다. 무료 모델이 timeout·429·구조화 출력 실패 등으로
  응답하지 못하면 예외 없이 기존 결정론적 rule 생성기로 자동 대체된다(`generatedBy: "ai" | "rule"`로
  구분 저장) — 실제 QA에서 한국어 품질·역할별 차별화는 확인됐지만 무료 endpoint의 응답 지연·429·
  timeout이 반복 관찰돼, **공모전 라이브 시연에서 실시간 생성 버튼에 의존하지 않는 것을 권장**한다.
  대표 프로젝트(강릉/경주/제천)는 이번 라운드에서 최신 normalization으로 재분석했고, 홍보자료는
  LLM을 호출하지 않고 rule 생성기로만 재생성해 현재 `generatedBy: "rule"` 상태로 저장돼 있다.

상세 근거·QA 수치·코드 경로는 [docs/implementation-status.md](docs/implementation-status.md)의
"2026-08-11 종합 갱신" 절 참고.

| 기능 영역 | 로컬 구현 | 로컬 자동 테스트 | GitHub `main` 반영 | DB migration 적용 | 운영 배포 |
|---|---|---|---|---|---|
| DNA 진단·전략 3안·실행안 편집·인쇄 | 완료 | 완료 | 완료 | 완료 | 완료(운영 URL에서 확인 가능) |
| 데이터 출처(provenance) 구분(Phase 1) | 완료 | 완료 | 완료 | 완료 | 완료 |
| 홍보자료 생성·편집·저장·인쇄 출력(Phase 5, 5-A~5-C+보완) | 완료 | 완료 | 완료 | **완료**(`20260726000000_add_selected_plan_promo_content`) | **완료**(2026-08-01 Production 브라우저 검증 완료) |
| 역할·국적·테마·여행월의 분석 결과 실질 반영(Phase 4) | 완료 | 완료 | 완료 | 해당 없음(스키마 변경 없음) | **완료** |
| 전략 3안 구조적 차별화(coreProblem 등 5필드, Phase 4-보완) | 완료 | 완료 | 완료 | **완료**(`20260731000000_add_strategy_differentiation_fields`, 2026-08-01 적용) | **완료** |
| 대표 시나리오 3개(강릉/경주/제천, P0-2) | 완료 | 완료 | 완료 | 해당 없음(스키마 변경 없음) | **완료**(2026-08-01 Production 브라우저로 3개 지역 실질 차별화 확인) |
| 역할 적합 이유 노출 + 핵심 관광 지표 요약카드(2026-07-29~30) | 완료 | 완료 | 완료 | 해당 없음(`Json` 필드 내 신규 키만 추가) | 완료 |
| 조건 수정 및 안전한 재분석(Phase 6, 지역 변경 포함) | 완료 | 완료 | 완료 | 해당 없음(스키마 변경 없음) | **완료**(2026-08-02 Production 브라우저 검증 완료) |
| 관광사업 기회 3안(기회발굴, DNA 진단↔전략 3안 사이) | 완료 | 완료 | 완료 | **완료**(`20260802000000_add_analysis_poi_category_summary`) | **완료** |
| 유사지역 비교(DNA 5축·POI 구성, 기준월 안내 포함) + 벤치마킹 포인트(2026-08-13) | 완료 | 완료 | 완료 | 해당 없음(저장하지 않는 순수 계산) | **완료** |
| 사업 사전검증 리포트(추진 권고·위험·보완사항, provenance 기반 데이터 신뢰도 판정 보완 + 분석 단계 조기 노출, 2026-08-13) | 완료 | 완료 | 완료 | 해당 없음(저장하지 않는 순수 계산) | **완료** |
| KPI 연결 강화(측정 목적·연결 DNA 축·연결 사업 목표·권장 시점·목표값 근거) | 완료 | 완료 | **완료**(커밋 `f2e3f57`, `main` push됨) | 해당 없음(`Json` 필드 내 신규 키만 추가) | **완료**(Production 배포됨) |
| 전략 3안 비교(해결문제·활용자원·체류방식·실행난이도·기대효과·주요위험·적합역할) + 예산·협력 대상(CURATED) | 완료 | 완료 | **완료**(커밋 `f2e3f57`, `main` push됨) | 해당 없음(기존 컬럼·Prisma 변경 없음) | **완료**(Production 배포됨) |
| 카카오모빌리티 자동차 실제 경로(Phase 12, PRIVATE_VEHICLE만) — 거리·시간·출처(LIVE_API/CACHED_API/ESTIMATED) 구분 표시 | 완료(로컬) | 완료(837개, `tests/unit/route/*` 포함) | 미반영(이번 세션 로컬 구현만, 커밋 전) | **적용됨**(`RouteCache` 모델, `20260806011802_add_route_cache`, Production Neon 적용) | 미배포 |
| 헤더 잠금(로그아웃) 버튼 제거 — 사이트/프로젝트 접근 제어 자체는 그대로 유지 | 완료 | 완료(`SiteHeader.test.tsx`) | **완료**(커밋 `c03c38f`, `main` push됨) | 해당 없음 | **완료**(Production 배포됨) |
| 비밀번호 화면(사이트/프로젝트) 이탈 링크 — 뒤로가기 없이 홈으로 이동, open redirect 차단 유지 | 완료 | 완료(`LoginPage.test.tsx`, `ProjectLockScreen.test.tsx`) | 미반영(이번 세션 로컬 구현만, 커밋 전) | 해당 없음 | 미배포 |

**2026-08-01에 Production(`tour-dna.lib.lc`)에서 실제 Chromium(Playwright)으로 홍보자료 생성·재생성·
역할별 채널 순서·전체 복사·새로고침/재접속 유지·모바일 레이아웃·지도 렌더링까지 전부 수동 검증을
완료했고, 2026-08-02에는 프로젝트 조건 수정·안전한 재분석(Phase 6) Production 검증까지 마쳤다** —
위 표의 대부분 항목이 로컬 구현부터 운영 배포·실제 브라우저 검증까지 전 단계를 통과한 상태다. 상세
검증 절차와 원인 조사(자동화 도구의 배경 탭 오탐 이슈 포함)는
[docs/implementation-status.md](docs/implementation-status.md)의 "Production 실사용 검증 및 대표
시나리오 완성(2026-08-01)"·"Phase 6 완료(2026-08-02)" 절 참고. **관광사업 기회 3안**은 이 문서 갱신
시점 기준 로컬 구현·테스트만 완료했고 아직 push·배포 전이다(아래 "다음 과제" 로드맵에서 완료로 갱신).

## 목차

- [제품 방향과 핵심 차별점](#제품-방향과-핵심-차별점)
- [현재 구현 상태](#현재-구현-상태-2026-08-11-기준)
- [빠른 시작](#빠른-시작)
- [환경변수](#환경변수)
- [데이터베이스 준비](#데이터베이스-준비)
- [스냅샷 모드 실행](#스냅샷-모드-실행-키-없이-전체-데모)
- [라이브 API 동기화](#라이브-api-동기화)
- [음식점 소분류(cat3)와 식사 가능 여부 판별](#음식점-소분류cat3와-식사-가능-여부-판별)
- [테스트와 빌드](#테스트와-빌드)
- [배포 현황](#배포-현황)
- [3분 시연 순서](#3분-시연-순서)
- [알려진 제한사항](#알려진-제한사항)
- [다음 과제 (로드맵)](#다음-과제-로드맵)
- [문서 목록](#문서-목록)

## 빠른 시작

```bash
npm install
cp .env.example .env.local   # 값 채우기 (아래 "환경변수" 참고)
npm run db:migrate           # prisma migrate deploy
npm run db:seed              # fixture 기반 7개 지역 데이터 + 데모 프로젝트 생성
npm run dev
```

http://localhost:3000 접속 → "데모 프로젝트 열기"로 대전 9월 시나리오를 바로 확인할 수 있습니다.
(운영 배포는 https://tour-dna.lib.lc 에서 바로 확인 가능합니다.)

## 환경변수

`.env.example`을 `.env.local`로 복사한 뒤 채웁니다. `.env.local`은 절대 커밋하지 않습니다(.gitignore 처리됨).

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | PostgreSQL 연결 문자열(Neon 권장, 풀링 연결) |
| `DIRECT_URL` | 마이그레이션용 direct(non-pooled) 연결 문자열 |
| `TOUR_API_SERVICE_KEY` | 한국관광공사 공공데이터포털 서비스키. 비어 있으면 자동으로 스냅샷 모드로 동작 |
| `TOUR_DATA_BASE_YM` | (선택) `sync:tourism-data`가 기준월을 자동 탐색하지 않고 강제로 쓸 기준월(YYYYMM). **2026-08-11부터 실제 분석(`computeProjectAnalysis`)은 이 값을 더 이상 쓰지 않는다** — 분석은 오직 검증·승격된 ACTIVE Dataset(`npm run dataset:status`/`dataset:activate`, 아래 "검증된 데이터셋(ACTIVE Dataset)" 절)만 기준으로 삼는다 |
| `OPENROUTER_API_KEY` | (선택) 홍보 콘텐츠 LLM 문구 생성에 쓰는 OpenRouter API 키. 비어 있으면 LLM을 호출하지 않고 기존 결정론적 rule 생성기만 쓴다(에러 아님, 정상 동작) |
| `OPENROUTER_PROMO_MODEL` | (선택) 홍보 콘텐츠 생성에 쓸 OpenRouter 모델 override. 비워두면 기본값 `google/gemma-4-26b-a4b-it:free` 사용 |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 카카오맵 JavaScript 키. 비어 있으면 좌표/주소 목록 fallback 사용 |
| `NEXT_PUBLIC_APP_URL` | 배포 URL(운영 `https://tour-dna.lib.lc`, 로컬 `http://localhost:3000`) |
| `DATA_MODE` | `live` \| `hybrid` \| `snapshot`. `snapshot`이면 라이브 호출을 완전히 생략 |
| `CRON_SECRET` | `/api/cron`, `/api/admin` 동기화 엔드포인트 인증용 비밀값(필수 설정, 비어있으면 모든 요청 401) |
| `SITE_ACCESS_PASSWORD` | 사이트 전체 접근 비밀번호(계정/로그인 없음, `src/proxy.ts`). 비어 있으면 게이트가 꺼진다 — 로컬 개발/E2E는 이 값을 설정하지 않는다. 운영 배포에서는 반드시 설정할 것 |

카카오맵 키는 [카카오 개발자 콘솔](https://developers.kakao.com) → 내 애플리케이션 → 앱 선택 →
**"플랫폼 키 > JavaScript 키" 안의 "JavaScript SDK 도메인"**에 배포 도메인을 등록해야 실제로
동작합니다("제품 링크 관리 > 웹 도메인"은 카카오톡 공유 링크용으로 별개 설정입니다). ⚠️
`NEXT_PUBLIC_KAKAO_MAP_KEY`에는 반드시 이 화면에 표시된 **"JavaScript 키" 값 그대로**를 넣어야 한다 —
REST API 키 등 다른 키를 잘못 넣으면 지도가 로드되지 않고 좌표/주소 fallback으로만 표시된다
(2026-07-21 실제로 이 실수로 지도가 안 뜨던 사고가 있었다).

## 데이터베이스 준비

PostgreSQL이 필요합니다. 로컬에 Postgres가 없다면 다음 중 하나를 선택하세요.

- **Neon(권장, 실제 운영 환경)**: neon.tech에서 무료 프로젝트를 만들고 `DATABASE_URL`/`DIRECT_URL`을 그대로 사용합니다.
- **Prisma 로컬 개발 DB**: `npx prisma dev`로 로컬에 임시 Postgres를 띄울 수 있습니다(단, `migrate dev`는 shadow DB 생성 제약으로 이 로컬 서버에서 실패할 수 있습니다 — 대신 `npx prisma db push`로 스키마만 반영하거나, 커밋된 migration을 `prisma migrate deploy`로 적용하세요).

마이그레이션 적용과 seed:

```bash
npm run db:migrate   # prisma migrate deploy — 커밋된 migration만 적용, shadow DB 불필요
npm run db:seed      # idempotent — 여러 번 실행해도 안전(Region/Poi/NormalizedMetric/Project까지 전체 fixture 반영)
```

### DataSource만 동기화(2026-07-29)

`DATA_SOURCE_SEED`(`src/lib/fixtures/dataSources.ts`)의 `baseUrl` 등을 코드에서 고쳤는데 DB에는 아직
반영되지 않은 경우(예: VISITOR_CNT가 실제 API 구조 변경 이후 재시드되지 않아 구 URL을 물고 있던 사례,
`docs/public-api-status.md` §5-D/§5-E 참고), 전체 `db:seed`를 돌리지 않고 `DataSource` 테이블만 안전하게
바로잡을 수 있습니다.

```bash
npm run db:sync-data-sources              # DataSource만 code 기준으로 생성·갱신
npm run db:sync-data-sources -- --dry-run # DB를 바꾸지 않고 CREATED/UPDATED/UNCHANGED만 미리 확인
```

- `DataSource.code`를 기준으로 생성(CREATED)·갱신(UPDATED)만 하며, fixture에 값이 없는데도 이미 있는
  기존 행을 삭제하지 않습니다(그 code는 그냥 건드리지 않습니다).
- Region/Poi/PoiRelation/NormalizedMetric/DataSnapshot/Project/SyncLog 등 다른 테이블은 전혀 조회·변경
  하지 않습니다 — `db:seed`와의 차이가 바로 이 범위입니다.
- Prisma migration(`db:migrate`)과는 별개입니다 — migration은 스키마(테이블/컬럼) 구조를 바꾸고, 이
  명령은 `DataSource` 행의 값(코드 fixture 내용)만 데이터베이스에 반영합니다.
- 실행에는 다른 DB 명령과 마찬가지로 `DATABASE_URL` 환경변수가 필요합니다.
- 이번 도입에서는 배포 자동화(Vercel Cron 등)에 연결하지 않았습니다 — 필요할 때 수동으로 실행하세요.

## 스냅샷 모드 실행 (키 없이 전체 데모)

`TOUR_API_SERVICE_KEY`를 비워두거나 `DATA_MODE=snapshot`으로 두면, 실제 공공데이터 API를 전혀 호출하지
않고 `npm run db:seed`로 적재한 fixture 데이터만으로 프로젝트 생성 → DNA 진단 → 전략 비교 → 실행안 →
인쇄까지 전체 흐름을 시연할 수 있습니다.

## 라이브 API 동기화

```bash
npm run check:base-ym                        # 최신 공통 기준월만 확인(DB 쓰기·전체 동기화 없음)
npm run sync:tourism-data                    # 기준월 자동 결정(CLI 인자 → TOUR_DATA_BASE_YM → 자동 탐색)
npm run sync:tourism-data -- --base-ym=202510  # 특정 기준월 지정(YYYYMM, 위치 인자 형식은 더 이상 지원하지 않음)
```

기준월을 지정하지 않으면 `TAR_SVC_DEM`/`TOU_RES_DEM`이 공통으로 제공하는 최신월을 자동으로 찾는다(최근
몇 개월만 역탐색, API 호출 한도를 아끼기 위해 무제한 탐색하지 않음). 공통월을 찾지 못하면 임의의 값을
쓰지 않고 안내 메시지와 함께 종료한다 — 이때는 `npm run check:base-ym`으로 먼저 상태를 확인한 뒤
`--base-ym=YYYYMM`으로 직접 지정한다. 잘못된 형식(`--base-ym=2026-06`, 알 수 없는 옵션 등)은 API
호출·DB 쓰기 전에 즉시 거부된다. 세부 정책은 `docs/operator-checklist.md` 참고.

또는 배포 환경에서:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://tour-dna.lib.lc/api/cron/sync-tourism-data
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://tour-dna.lib.lc/api/admin/sync-tourism-data
```

운영 배포에는 `vercel.json`에 등록된 **Vercel Cron이 매월 1일(UTC 00:00 = KST 09:00) 자동으로** 위
CRON 엔드포인트를 호출합니다. Vercel은 `CRON_SECRET` 환경변수가 설정되어 있으면 요청에
`Authorization: Bearer $CRON_SECRET` 헤더를 자동으로 붙여주므로 별도 외부 스케줄러가 필요 없습니다.

**2026-07-21 실 서비스키로 검증한 현황** (자세한 내용은 [docs/public-api-status.md](docs/public-api-status.md)):

| API | 상태 |
|---|---|
| 지역별 관광 다양성 | ✅ 전체 코드 체계 확인 + 변동계수 기반 종합 점수 재계산 로직 구현 완료 |
| 국문 관광정보 서비스 | ✅ 실제 데이터 확인, POI 라이브 동기화 파이프라인 연결 완료(큐레이션 데이터 보호) |
| 지역별 관광 수요 강도(체류·소비) | ✅ 실제 데이터 확인(체류 `tarSjrnDsIxCd=2103`, 소비 `tarExpDsIxCd=2201`) |
| 지역별 관광 자원 수요(관광서비스수요) | ✅ 실제 데이터 확인(`AreaTarResDemService/areaTarSvcDemList`, tarSvcDemIxCd=1101) |
| 지역별 관광 자원 수요(문화자원수요) | 파라미터명만 확인, 유효 코드값 미확인 |
| 지역별 방문자수(DataLabService) | ✅ 실 API 구조 확인(2026-07-28), 시군구/광역 전국 조회 후 지역 매핑 |
| 연관관광지 | 여전히 base URL·오퍼레이션명 미확인 |

다양성 지표는 이제 연령대별 방문객/소비 지수 6종씩 + 국적 다양성 지수를 조합해 종합 점수를 계산하고
정상 저장합니다(더 이상 저장을 보류하지 않습니다) — 산식은 [docs/scoring-model.md](docs/scoring-model.md)
참고.

### VISITOR_CNT 진단·감사(2026-07-28)

방문자수(DataLabService)만 별도로 확인·동기화할 때 쓰는 명령입니다. 셋 다 `TOUR_API_SERVICE_KEY`
환경변수가 필요하고, 인증키 값은 어떤 출력에도 남기지 않습니다(URL을 보여줄 때도 마스킹).

```bash
npm run verify:visitor-api                    # 실 API 진단(인증키/API 성공 여부/최신 완전 기준월 후보 등)
npm run audit:region-codes                    # Region 코드와 실 API 코드 대조 감사
npm run audit:region-codes -- --base-ym 202606
npm run sync:visitor -- --baseYm=202606       # VISITOR_CNT만 동기화(다른 5개 소스는 건드리지 않음)
```

- **최신 완전 기준월**: 진행 중인 이번 달은 절대 선택하지 않고, 직전 달부터 과거 방향으로 최대
  6개월만 확인합니다. 기초지자체(`locgoRegnVisitrDDList`)·광역지자체(`metcoRegnVisitrDDList`) 응답이
  모두 SUCCESS이고 그 달 1일~말일의 `baseYmd`가 전부 있어야 "완전한 달"로 인정합니다(하나라도 불완전하면
  건너뜁니다). 완전한 달을 찾지 못해도 임의 값을 대신 쓰지 않습니다. 자세한 내용은
  [docs/public-api-status.md](docs/public-api-status.md) §5-C 참고.
- **VISITOR_CNT 정의**: `touDivCd` 2(외지인)+3(외국인) 합계이며, 월간 수치는 월간 "순"방문자수가 아니라
  일별 값의 월간 합계입니다. 현지인(`touDivCd=1`)은 버리지 않고 `visitorCntLocal`로 별도 저장합니다.
  지역 매핑은 지역명이 아니라 행정구역 코드(signguCode/areaCode)를 기준으로 합니다.
- `sync:visitor`는 기초·광역 응답을 함께 평가해(원자적 게이트) 하나라도 불완전하면 **양쪽 모두** 저장을
  건너뛰고 기존 정상 데이터를 그대로 둡니다 — 한쪽만 완전하다고 그쪽만 저장하지 않습니다(2026-07-29
  수정, §5-D 참고).
- `verify:visitor-api`는 DB에 전혀 접근하지 않습니다(DATABASE_URL 불필요) — `--env-file-if-exists`를
  쓰므로 `.env.local`이 없어도 실행됩니다. 다만 이 플래그는 Node 20.x의 이른 패치 버전에서는 지원되지
  않을 수 있습니다 — 오류가 나면 `TOUR_API_SERVICE_KEY`를 셸 환경변수로 직접 export한 뒤
  `npx tsx scripts/verify-visitor-api.ts`로 직접 실행하세요.

### 새 지역 추가

지역(Region)은 `src/lib/fixtures/regions.ts`의 `REGION_SEED` 배열에 코드로 등록하고 `npm run db:seed`로
DB에 반영합니다(런타임 화면은 이 fixture가 아니라 DB에서 지역 목록을 읽으므로, 반영 후 재배포 없이 바로
드롭다운에 나타납니다). 후보 코드(통계청 행정표준코드 areaCd/signguCd, TourAPI 구코드)가 실제로 그
지역을 가리키는지는 아래로 먼저 확인하세요 — 사람이 curl로 확인하던 걸 자동화한 스크립트입니다:

```bash
# 예시: 이미 등록된 대전(유성구)로 실행하면 PASS가 나온다(스크립트 동작 확인용)
npm run verify:region -- --name 대전_유성구 --area-cd 30 --signgu-cd 30200 --tour-api-area-code 3
```

절차는 [docs/operator-checklist.md](docs/operator-checklist.md)의 "새 지역 추가 절차" 참고.

## 음식점 소분류(신 lclsSystm3, 구 cat3)와 식사 가능 여부 판별

**2026-07-27 신 법정동·분류체계 전환**: TourAPI 국문 관광정보 서비스가 구 지역·분류 코드(`areaCode`/
`sigunguCode`/`cat1~3`)에서 신 법정동·분류체계 코드(`lDongRegnCd`/`lDongSignguCd`/`lclsSystm1~3`)로
바뀌었다. 신규 라이브 요청/응답은 이제 `lclsSystm1~3`만 쓴다(`src/lib/public-data/adapters/
tourInfo.ts`) — 구 `cat1~3`는 전환 이전에 저장된 `Poi.rawPayload`를 재조회할 때만 참조하는 구형 데이터
호환 전용 값(`LEGACY_*` 이름)으로 남겨뒀다.

**신 lclsSystm3 실제 코드값(2026-07-28 실 서비스키로 `lclsSystmCode2` 직접 확인)**: 대분류 `FD`(음식)
하위 중분류 5개(한식/외국식/간이음식/주점/카페·찻집), 소분류 21개를 전부 확인했다 — 구 `cat3`(7개)
보다 훨씬 세분화됐고, 구 체계에는 없다고 알려졌던 제과(베이커리/디저트) 전용 코드(`FD030100`)가
간이음식 하위에 별도로 존재한다(카페 하위가 아니지만 정식 식사 자리는 아니라고 판단해 식사 불가로
분류했다).

| lclsSystm3 | 명칭 | 식사 가능 여부 | lclsSystm3 | 명칭 | 식사 가능 여부 |
|---|---|---|---|---|---|
| `FD010100` | 관광식당 | ✅ | `FD030400` | 김밥 분식 | ✅ |
| `FD010200` | 모범음식점 | ✅ | `FD030500` | 이동음식 | ✅ |
| `FD020100` | 중식 | ✅ | `FD030600` | 기타간이음식 | ✅ |
| `FD020200` | 일식 | ✅ | `FD030100` | 제과 | ❌ |
| `FD020300` | 서양식 | ✅ | `FD040100`~`FD040500` | 주점(바/펍/생맥주/클럽/전통주 등) | ❌ |
| `FD020400` | 기타외국식 | ✅ | `FD050100` | 카페 | ❌ |
| `FD020500` | 퓨전음식 | ✅ | `FD050200` | 찻집 | ❌ |
| `FD030200` | 피자,햄버거,샌드위치 등 | ✅ | `FD050300` | 기타음료점 | ❌ |
| `FD030300` | 치킨 | ✅ | | | |

전체 코드는 `src/lib/public-data/adapters/tourInfo.ts`의 `FOOD_SUBCATEGORY_NAME_BY_LCLS_SYSTM3`/
`NON_MEAL_FOOD_LCLS_SYSTM3_CODES` 참고.

**아래는 구 cat3 체계 기준 참고 표(구형 저장 데이터 해석용, 신규 요청과 무관)** — 실 서비스키로
`categoryCode2` 엔드포인트와 실제 지역 데이터를 직접 확인한 결과(2026-07-24), `cat2=A0502` 하위
`cat3`는 다음 7개뿐이었다.

| cat3 코드 | 명칭 | 식사 가능 여부(`mealEligible`) |
|---|---|---|
| `A05020100` | 한식 | ✅ |
| `A05020200` | 서양식 | ✅ |
| `A05020300` | 일식 | ✅ |
| `A05020400` | 중식 | ✅ |
| `A05020700` | 이색음식점 | ✅ |
| `A05020900` | 카페/전통찻집 | ❌ |
| `A05021000` | 클럽 | ❌ |

**흐름**: `lclsSystm3`(신)/`cat3`(구, 구형 데이터만)는 `tourInfo.ts`의 `itemSchema`가 파싱해 어댑터가
반환하는 원본 item에 포함되고, `syncService.ts`가 이 item 전체를 그대로 기존 `Poi.rawPayload`(Json?,
스키마 변경 없이 이미 존재하던 컬럼)에 저장한다. `src/lib/services/poiDetails.ts`가 조회 시점에
`rawPayload.lclsSystm3`(우선) 또는 없으면 `rawPayload.cat3`(구형 데이터 fallback)를 꺼내
`classifyFoodSubcategory()`(`src/lib/domain/foodClassification.ts`, 판정 규칙 단일 기준)로 판별해
`PoiDetail.mealEligible: boolean`을 채운다. `src/lib/domain/planBuilder.ts`는 이 값을
`isMealEligiblePoi()`로 사용해 점심·저녁 후보를 고른다(`splitMealCandidates()`).

- **허용목록 방식**: 한식/서양식/일식/중식/이색음식점만 식사 가능(`mealEligible=true`)으로 본다.
- **카페/전통찻집·클럽 제외**: 위 두 유형은 명확히 정식 식사가 어려운 곳으로 보고 점심·저녁 슬롯
  후보에서 제외한다. 다만 삭제하지 않고 그 날짜의 일반 방문 일정(관광지와 동일한 실시간 이동시간
  기준 스케줄러)에 그대로 유지한다.
- **분류 정보 없음/미상**: `cat3`가 없거나(구버전 데이터 등) 위 7개 코드에 없는 값이면 안전하게
  `mealEligible=false`로 본다 — 잘못 배치하는 것보다 식사 슬롯을 생략하는 쪽을 우선한다.
  큐레이션된 fixture 데이터(`Poi.sourceType=FIXTURE`)는 TourAPI 분류 개념이 없으므로 항상 식사
  가능으로 취급한다(기존 데모 동작 보존).
- **구 cat3 체계의 한계(해소됨)**: 구 체계는 디저트·베이커리·주점을 위한 별도 코드가 없어 "성심당"
  (베이커리)도 카페/전통찻집(`A05020900`) 하나로 들어왔다. 신 lclsSystm3 체계는 제과(`FD030100`)와
  주점(`FD04` 5종)을 별도 코드로 구분한다 — 위 신 체계 표 참고.

## 테스트와 빌드

```bash
npm run lint
npm run typecheck
npm test              # vitest — 도메인 로직 + 컴포넌트 단위테스트
npm run test:e2e      # playwright — 대표 시나리오 E2E (개발 서버 필요)
npm run build
```

## 배포 현황

- **Vercel 프로젝트**: `tour-dna` — GitHub Git 연동(`herb39/TOUR-DNA`, Production branch `main`)이
  **2026-08-13에 다시 활성화됐다**(`vercel git connect`). `main` push → Vercel Production 자동 배포,
  다른 branch push → Preview 자동 배포가 정상 동작한다(2026-08-13 Vercel 사용량 여유 확인 후 재개 —
  그 이전에 `vercel git disconnect`로 일시 중단했던 이력은 [docs/deployment.md](docs/deployment.md)
  "로컬 전용 개발 정책 & Vercel 배포 이력" 절 참고). **단, 자동배포 재활성화와 별개로 DB 정책은
  그대로 유지한다** — 개발/QA/데이터 구축(공공데이터 sync, Dataset STAGING/ACTIVE, 대표 프로젝트
  재분석 등)은 계속 local PostgreSQL(`tour_dna_local`)에서만 수행하고, Production Neon에는 seed·
  migration·dataset activate·sync 같은 개발용 write 작업을 실행하지 않는다.
- **커스텀 도메인**: `tour-dna.lib.lc` (Cloudflare DNS, CNAME → Vercel, "DNS only" 모드)
- **DB**: Neon PostgreSQL(**region: Singapore**), 마이그레이션은 배포 파이프라인에서 자동 실행되지 않으며 `npm run db:migrate`로 수동 적용
- **Vercel Function region**: **Singapore** — Neon DB와 동일 리전으로 맞춰뒀다(2026-08-13, 아래 참고).
  ⚠️ Function region이 Neon region과 다르면(예: 이전에 North America였을 때) 요청마다 DB 왕복 지연이
  누적돼 운영 최초 페이지 로딩이 크게 느려진다 — [docs/deployment.md](docs/deployment.md) "Vercel
  Function ↔ Neon DB region 정렬" 절 참고.
- **Cron**: `vercel.json`에 매월 1일 동기화 등록
- 자세한 신규 배포 순서는 [docs/deployment.md](docs/deployment.md) 참고
- ✅ **운영 배포는 로컬 저장소와 동기화되어 있다(2026-08-01 확인)**: `git log`/`git status` 기준 로컬
  `main`의 모든 커밋이 `origin/main`에 push되어 있고, Vercel Production이 최신 커밋(`afba7e93...`)으로
  배포돼 있음을 `vercel inspect`로 확인했다. Phase 5(홍보자료)·Phase 4-보완(전략 차별화 필드)에
  필요한 migration도 모두 원격 Neon DB에 적용 완료(`prisma migrate status`로 pending 없음 확인,
  절차는 [docs/deployment.md](docs/deployment.md) 참고).

## 3분 시연 순서

> 아래는 현재 **운영 배포(https://tour-dna.lib.lc)** 기준 시연 순서다. 홍보자료 생성까지 전 단계가
> 이 배포에 포함되어 있고 2026-08-01에 실제 브라우저로 검증했다.

1. https://tour-dna.lib.lc 접속 → 가치 제안, 3단계 설명, 데이터 기준월/동기화 시각 확인
2. "데모 프로젝트 열기" → 대전 9월 시나리오 분석 대시보드 확인 (DNA 5축, 강점/기회/주의, 전략 3안)
3. 전략 카드의 "근거 보기" 클릭 → 원값/정규화값/출처/기준월/반영규칙 확인
4. 아무 전략이나 "이 전략 선택" → 실행안 페이지에서 코스/체크리스트/KPI 확인
5. 상품명 수정 후 "저장" → 새로고침으로 유지되는지 확인
6. "홍보자료 생성" → 역할별(여행사/지자체) 채널 순서로 정렬된 제안서 요약·랜딩페이지·SNS·블로그·
   카드뉴스 문구 확인, "전체 복사"로 클립보드 복사 확인
7. "인쇄/PDF 보기" → 화면 조작 UI 없이 A4 1~2페이지 분량 인쇄 미리보기 확인
8. (선택) "새 관광상품 기획"으로 강릉/경주/제천 대표 시나리오 카드를 골라 다른 지역/역할 결과가
   실질적으로 달라짐을 확인(DNA 5축, 전략 순위·차별화 필드, 홍보 채널 순서 전부 지역·역할별로 다름)

## 알려진 제한사항

- 메인 화면 프로젝트 목록은 서버(DB) 페이지네이션이다(2026-08-07 도입) — `createdAt desc, id desc`로
  정렬해 최신 생성 프로젝트가 항상 위에 오고(편집해도 순서가 바뀌지 않음), `?page=`/`?pageSize=`
  (10/30/50, 기본 10) URL 쿼리로 상태를 유지한다. 전체 프로젝트를 한 번에 가져와 화면에서 자르지
  않는다.
- 사용자 역할(`여행사/DMC`/`지자체·관광재단`/`축제 기획자`)은 지역의 객관적 DNA 5축 원시 점수나
  정규화 공식을 바꾸지 않는다 — 대신 전략 점수의 `roleFit`(10% 가중치, 역할별 목표 우선순위 반영),
  추천 이유 문구, 실행안의 체크리스트·KPI·**위험 목록**(2026-08-07 보완 — 이전에는 위험 목록만
  역할과 무관하게 완전히 동일했다), 예산·협력 대상 설명에 반영된다. 자세한 코드 경로와 "동일 조건·
  역할만 변경" 비교 근거는 `docs/contest-feature-map.md`와 `tests/unit/roleDifferentiation.test.ts`
  참고.
- 홍보자료 화면 상단에 포스터형·카드뉴스형 시각 미리보기가 있다(Phase 1, 2026-08-07 도입) — 이미
  저장된 홍보자료 문구(제안서 요약/랜딩/인스타그램/역할별 콘텐츠/카드뉴스)와 실행안 코스만 재조합해
  이미지 없이 타이포그래피·숫자·도형으로만 구성하며, LLM은 아직 쓰지 않는다(결정론적 규칙 기반).
  기존 채널별 텍스트 편집·복사·저장 기능은 그대로 유지되고, 미리보기는 그 값을 그대로 반영한다.
- 홍보자료의 제안서 요약·랜딩·인스타그램·블로그·카드뉴스 5개 공통 채널도 이제 사용자 역할(여행사/
  DMC·지자체/관광재단·축제 기획자)에 따라 목적·강조점·마무리 문구가 실제로 달라진다(Phase 2,
  2026-08-07 도입) — 여행사는 판매 가능한 상품 구성, 지자체는 지역 관광 활성화 사업 추진, 축제
  기획자는 행사 프로그램 운영을 목적으로 서로 다른 문장을 쓴다. DNA 5축 원시 점수와 대표 코스·근거
  데이터 같은 사실 값은 역할과 무관하게 동일하게 유지된다. 이 Phase 자체는 결정론적 규칙 기반이었고,
  이후(2026-08-10~11) 이 규칙 기반 결과 위에 OpenRouter LLM(`google/gemma-4-26b-a4b-it:free`)이
  문구만 다시 써주는 선택적 오버레이가 추가됐다(위 "현재 구현 상태"의 2026-08-11 요약 참고) — LLM이
  실패하면 예외 없이 이 Phase의 규칙 기반 문구 그대로 쓰인다. PNG/PDF 내보내기, 이미지 사용은 여전히
  범위 밖이다.
- 문화자원수요(`AreaTarResDemService/areaCulResDemList`)·연관관광지 API는 base URL·오퍼레이션명 또는
  유효 코드값이 아직 미확인이다. 그 외(다양성·체류·소비·관광서비스수요·국문관광정보·방문자수)는 실제
  데이터로 확인됐다(docs/public-api-status.md).
- 화면 표시용 기본 기준월(`DEFAULT_BASE_YM`)은 API가 최신월을 알려주지 않아 여전히 수동으로
  유지보수해야 한다 — 방치하면 실제로는 더 최신 데이터가 있는데도 오래된 기준월을 계속 쓰게 된다
  (2026-07-21에 9개월 밀려 있던 것을 발견해 202606으로 갱신함). `sync:tourism-data` CLI는 2026-08-07부터
  기준월을 지정하지 않으면 최신 공통월을 자동 탐색하므로 이 수동 유지보수 부담이 없다(`npm run
  check:base-ym`으로 언제든 미리 확인 가능) — 다만 여러 화면의 표시용 기본값(`DEFAULT_BASE_YM`)까지
  자동으로 갱신하지는 않는다.
- `Region.apiSigunguCode`는 대전은 유성구(30200) 하나만 대표로 쓴다(code는 하위 호환을 위해
  `SGG_DAEJEON` 그대로). 2026-07-21~2026-07-22에는 대전이 이 레코드 하나뿐이라 `Region.name`을
  "대전광역시"로 두고(제품명 노출용) 드롭다운 라벨만 "대전광역시 (DNA 지표는 유성구 기준)"으로
  덮어써 표시했었다(`regionQueries.ts`의 `SIGUNGU_DISPLAY_LABEL_OVERRIDE`). **2026-08-09에 동구/
  중구/서구/대덕구 4개 SIGUNGU가 실제로 추가되면서 이 legacy 표현이 더 이상 맞지 않게 됐다** —
  시/군/구 드롭다운에 진짜 4개 자치구와 함께 "대전광역시(DNA는 유성구 기준)"라는 5번째 항목이 섞여
  나와 오히려 더 혼란스러웠다. 2026-08-13에 근본 원인(`Region.name` 오기입)을 바로잡아 `Region.name`
  자체를 "유성구"로 정정했고, 더 이상 필요 없는 표시 override는 제거했다 — 지금은 대전광역시 하위에
  동구/중구/서구/유성구/대덕구 5개가 정상적으로 나온다. **"유성구 기준"은 DNA 5축 점수(통계청 지표)에만
  해당**한다 — 한때 POI 후보도 유성구로만 좁혀뒀었는데, 그 결과 성심당 본점(중구)처럼 대전 하면 바로
  떠오르는 다른 구 명소가 실제 검색에도 코스에 못 들어가는 부작용이 있어(2026-07-22 발견) POI 풀은
  대전 전체로 되돌렸다(`syncService.ts`의 `TOUR_INFO_ADDRESS_FILTER_OVERRIDE`) — 이 결정 자체는
  지금도 유효하며, 실제로 이 지역 POI 396건 중 API로 수집된 388건은 `lDongSignguCd=200`(유성구)
  파라미터로 이미 좁혀 수집되지만, 최초 데모 FIXTURE 8건 중 4건(한밭수목원·장태산자연휴양림·성심당
  본점·대전중앙시장 먹거리타운)은 대전 전체를 대표하는 명소로 큐레이션돼 실제로는 서구/중구 주소다
  (삭제하지 않고 그대로 유지 — 2026-08-13 확인).
- POI 라이브 동기화는 이름이 겹치는 경우 큐레이션된 fixture 데이터(`sourceType=FIXTURE`)는 절대
  덮어쓰지 않는다. 다만 더 이상 API에 나타나지 않는 장소(폐업 등)를 자동으로 삭제하는 로직은 없다 —
  한 번 반영된 라이브 POI는 계속 남아있는다.
- 카카오맵 JavaScript SDK 도메인 등록 여부에 따라 실제 지도 렌더링 결과가 달라진다(좌표/주소 fallback UI는 검증됨).
- 실행안 코스는 같은 날짜 안 위/아래 이동에 더해(2026-07-21) 다른 날짜로 이동, 삭제, 같은 지역 POI
  검색 후 추가, 시간 직접 수정까지 지원한다(드래그 앤 드롭은 미지원). 하루에 담을 수 있는 장소 수는
  제한이 없다 — 대신 각 장소의 시간·체류시간·예상 이동시간(haversine 추정치)을 비교해 물리적으로
  불가능한 일정(이동 시간이 실제 여유보다 긴 경우)이면 해당 장소에 빨간 경고를 표시한다. 검색은 등록된
  POI 중에서만 가능하고, 완전히 새로운 장소(DB에 없는 곳)를 직접 입력해 추가하는 기능은 없다 — 필요하면
  먼저 공공데이터 동기화나 fixture로 POI를 등록해야 한다. 실행안 화면에 코스를 카카오맵으로 시각화하는
  기능은 2026-07-22에 추가했다(`CourseMap.tsx`) — 일자별 탭으로 전환하며 방문 순서대로 마커+동선
  (Polyline)을 그린다(좌표 없는 항목은 건너뛴다). 다만 **지도에서 장소를 검색해 코스에 바로 추가하는
  기능은 아직 없다** — 지금 검색은 DB에 이미 등록된 POI 안에서만 가능하다(위 문단 참고).
- 체류시간(`stayMinutes`)도 2026-07-22부터 직접 수정 가능하다. 공공데이터 API에 장소별 권장 체류시간
  필드가 없어 초기값은 그대로 60분 고정이다.
- 실행안의 운영 체크리스트/위험과 대응안/KPI도 2026-07-22부터 자유롭게 추가·삭제할 수 있다(KPI 메모/
  메모 입력란은 그대로 유지). 인쇄 화면도 개수 제한 없이 전부 보여주도록 맞췄다.
- "저장하지 않은 변경 이탈 경고"는 브라우저 새로고침/닫기(`beforeunload`)만 감지하며, 앱 내부 라우트
  이동(Link 클릭) 시에는 경고하지 않는다.
- 전략 재선택 시 실행안은 새 전략 기준으로 재생성되며, 이전에 사용자가 편집한 상품명/메모는 초기화된다.
- DNA 5축 점수는 같은 행정단위(SIGUNGU) · 동일 기준월 코호트 안에서 정규화한다(scoring-model.md).
  2026-08-11 기준 로컬 DB는 SIGUNGU 255/255 전체가 코호트에 들어와 있다(3→7→27→37개로 단계적으로
  늘려온 이력은 `docs/implementation-status.md` 참고). Demand(`tarSvcDemIxVal`/`touResDemIxVal`)와
  Spend(`tarExpDsIxVal`)는 코호트가 전국 규모로 커지면서 소수 극단값(초고소비 상권 등)이 나머지
  지역 점수를 크게 흔드는 문제가 실제로 확인돼, `log1p(raw) → min-max` 방식으로 바꿨다 — Stay/
  Diversity는 기존 선형 min-max 그대로다. 코호트가 아무리 커져도 그 안의 최댓값/최솟값 지역은
  여전히 100점/0점에 가깝게 나오는 것이 정상이다. 지역별 목록·데이터 품질 등급은
  `docs/data-dictionary.md` 참고.
  다만 이 내부 0/100은 화면에 그대로 노출하지 않는다 — **내부 분석점수와 사용자 표시지수를
  분리**해(2026-08-07 도입, `src/lib/domain/dnaDisplayScore.ts`), 화면에는 내부 0~100을 10~90
  범위로 균등 압축한 "DNA 상대지수"만 보여준다(순위·비율 관계는 그대로 유지되는 단순 선형 변환).
  강점/개선 판정과 전략 계산은 여전히 원본 내부 분석점수를 그대로 쓰고, 표시지수는 화면에 숫자를
  그릴 때만 사용한다.
- 방문자수 증감률 요약카드는 전년 동월 데이터를 우선 비교하고, 없으면 직전 확인 가능 월로 대체한다
  (2026-07-29~30). 체류·소비 지표는 실제 저장 단위가 "시간"·"원"이 아니라 상대적 강도를 나타내는
  "지수"이므로, 화면도 원래 단위 그대로 지수로 표시한다(임의로 시간/금액 단위로 환산하지 않는다).
- 홍보 콘텐츠 채널 문구는 OpenRouter 무료 모델(`google/gemma-4-26b-a4b-it:free`)이 우선 시도되고,
  실패하면 결정론적 rule 생성기로 자동 대체된다(위 "현재 구현 상태" 참고) — DNA/전략/POI/실행안 계산
  자체에는 LLM을 쓰지 않는다. 무료 endpoint의 응답 지연·429가 반복 관찰되어, 라이브 시연에서는 실시간
  생성 버튼보다 사전에 저장해둔 결과를 보여주는 방식을 권장한다.
- 프로젝트 비교, 관리자 동기화 UI, 공유 링크(P2)는 구현하지 않았다.
- 실행안 코스는 POI 좌표를 최근접 이웃(그리디) 순서로 재정렬해 하루 동선을 구성한다(2026-07-21,
  `src/lib/domain/geo.ts`). 이동 시간·거리는 haversine 직선거리와 이동 수단별 평균 속도 가정으로 계산한
  추정치이며, 실제 도로/대중교통 경로 API를 쓰지 않는다 — 최적해가 아닌 근사해임에 유의.

## 다음 과제 (로드맵)

현재 기능을 버리고 새로 만드는 것이 아니라, 기존 DNA 분석·전략 3안·POI·실행안·홍보자료·보고서를
유지하면서 앞단에 **기회발굴**, 중간에 **사업 사전검증**, 뒤에 **성과관리**를 연결합니다.

### TOUR-DNA 중장기 제품 로드맵(2026-08-16 합의)

아래는 2026-08-16 세션에서 합의한 중장기 제품 방향이다. 2026-08-17에는 Phase B의 실시간 코스
품질검증 v1까지 구현했다. 이미 구현된 기존 기능과 아이디어 단계 항목이 섞여 보이지 않도록, 각 항목에
**완료 / 부분 구현 / 데이터 조사 필요 / 장기 후보** 상태를 명시한다.

**제품 포지셔닝**: 기존 "데이터 기반 관광 코스 자동 추천"에서, **지역 관광 데이터를 진단하고 관광
전략과 좋은 후보지를 제안한 뒤 기획자가 직접 상품을 편집하고 동선·테마 적합성·실행 가능성을 실시간으로
검증하는 B2B 관광상품 설계 플랫폼**으로 방향을 명확히 한다 — 자동 생성이 기획자를 대체하는 구조가
아니라 "자동 초안 → 전문가 편집 → 실시간 검증 → 실행안 확정" 구조를 지향한다(장기 후보, 아래 "코스
스튜디오" 항목들이 이 방향의 핵심 구현 대상).

| 항목 | 설명 | 상태 |
|---|---|---|
| 1. 전략 핵심 테마 중심 코스 구성 강화 | 전략의 핵심 테마(templateCoreThemeCategories)를 담당하는 카테고리가 다른 core 카테고리와 동일 비중만 배정받아 밀도가 낮던 문제를 core-theme floor(30%)로 보완 | **완료(2026-08-16, 이번 세션)** |
| 2. 코스 스튜디오(자동 초안 + 추천 후보 풀 패널 + 전문가 편집) | 현재 SelectedPlan/PlanEditor를 확장해 후보 POI를 별도 패널로 노출(이름/카테고리/theme fit/추천 근거/구조적 분류 근거/예상 이동 부담/권장 체류시간) | **부분 구현(2026-08-16)** — 추천 후보 풀 패널·Drag & Drop 편집·저장 전 지도 실시간 갱신은 완료(아래 3·4번 참고). 예상 이동거리 표시만 아직 없음 |
| 3. Drag & Drop 일정 편집 | 후보 풀→일정, 일정→다른 날짜, 동일 날짜 순서 변경을 Drag & Drop(모바일은 대체 UX)으로 | **완료(2026-08-16, 아래 상세 참고)** — `@dnd-kit` 도입, 위/아래 이동 버튼·날짜 이동 select·검색 추가 버튼은 그대로 유지(회귀 없음) |
| 4. 일정 편집 시 지도 실시간 갱신 | POI 추가/삭제/순서/날짜 변경 시 카카오맵 마커·동선·이동거리·이동시간 재계산 | **완료(2026-08-16, 아래 상세 참고)** — 저장 전에도 `days` client state 기준으로 마커/경로선이 즉시 갱신됨. 실제 도로 경로(Kakao Mobility)는 편집마다 재호출하지 않고 마운트 시 1회만 조회 |
| 5. 실시간 코스 품질 검증 | 핵심 테마 POI 충분 여부·동일시설 중복·과도한 이동·식사/숙박 여부 등을 편집 중 또는 저장 직후 경고 | **완료(2026-08-17, v1)** — 현재 `days` 기준 advisory 패널로 핵심 테마·SHOPPING 중복·하루 과밀·식사·숙박/날짜·이동 부담과 단순 운영시간 범위 이탈·휴무일 문구를 즉시 안내하며 저장을 막지 않음 |
| 6. 콘텐츠 테마 8종(미식/자연/웰니스/문화·역사/문화예술/레저·액티비티/K-콘텐츠/야간관광) | 현재 `ThemeCategory` enum은 FOOD/NATURE/CULTURE_HISTORY/CULTURE_ARTS/WELLNESS/FESTIVAL/PET_FRIENDLY/LEISURE_ACTIVITY 8종 | 미식/자연/웰니스/문화·역사: **완료**. 문화예술: **완료(2026-08-17 마무리)** — 자유 입력·`VE07` 구조 신호·전용 전략·상세 운영정보 증분 배치·복합 운영시간 advisory까지 연결. 레저·액티비티: **부분 구현** — `LS01~04` 공식 중분류와 상세 운영정보 배치는 연결했으나 세부 체류시간 정책은 후속. K-콘텐츠·야간관광: **미구현** |
| 7. 레저·액티비티 공식 중분류(육상/수상/항공/복합) | TourAPI 공식 `LS`(레포츠) 중분류를 확인해 활용 | **부분 구현(2026-08-17 1차)** — 공식 코드는 LS01 육상·LS02 수상·LS03 항공·LS04 복합으로 확인·표시한다. 겨울스포츠/골프 등 더 세밀한 유형은 공식 코드 근거 없이 장소명으로 추정하지 않는다 |
| 8. POI별 권장 체류시간(골프 4~6시간/스키 3~5시간/수상레저 2~3시간/전시 1~2시간 등) | 현재 모든 POI가 60분 고정(사용자가 직접 수정 가능) | 데이터 조사 필요 — 공공데이터 API에 권장 체류시간 필드 자체가 없어 하드코딩 금지 원칙상 보류 |
| 9. 여행 조건(반려동물 동반/무장애·이동약자/뚜벅이·대중교통/가족·유아동)을 콘텐츠 테마와 분리 | `ThemeCategory`에 이미 `PET_FRIENDLY`가 있으나 대응 전용 코스 템플릿·POI 신호가 없어 점수에 반영되지 않음(MISSING 처리) | 데이터 조사 필요 — 별도 `여행 조건/traveler constraints` 개념 설계 자체가 미착수 |
| 10. 문화예술(미술관/전시/공연/현대문화공간) | TourAPI `VE07`(전시시설) 구조 신호 재사용 가능성 우선 검토 | **완료(2026-08-17 마무리)** — `CULTURE_ARTS` 전용 전략, `detailIntro2` 운영시간/휴무일 증분 반영, `--all-regions --max-items=N` 전체 호출 상한 배치, 복합 운영시간 보수적 advisory까지 연결. 전국 상세 데이터 백필은 API 할당량에 맞춰 회차 실행 |
| 11. K-콘텐츠(촬영지 연계 관광·식음·상권·숙박) | 촬영지 공공데이터 존재 여부·전국 커버리지·위치정보 조사 후 검토 | 미구현 — 조사 자체 미착수 |
| 12. 야간관광(야경/야시장/야간 공연/야간 문화시설) | 방문 수요는 높으나 체류·소비 DNA가 낮은 지역에서 야간 콘텐츠→식음→숙박 연계 전략 | 미구현 — `ThemeCategory` enum에 항목 없음, 운영시간 데이터 신뢰성 확인 필요 |
| 13. 축제·이벤트를 "기획 계기(Anchor Event)"로 재설계 | 지역+여행월에 실제 축제가 있으면 후보를 보여주고, 이후 명시적 확정 시 전후 관광·식음·숙박을 연결(오전 관광→식사→축제→야간상권→숙박→다음날 관광) | **P1-2a 로컬 구현(2026-08-18)** — `searchFestival2` 후보를 서버에서 재검증하고 사용자가 날짜·일차·시간 조건을 명시하면 `ProjectAnchor`에 최소 스냅샷을 저장·변경·삭제한다. `localStorage`는 fallback이며 서버 상태가 우선한다. 로컬 migration만 적용했고 Production Neon migration은 보류했다. 코스 고정·전후 연결은 P1-2b이며 특정 축제 하드코딩·자동 삽입·전략 점수 변경은 하지 않음 |
| 14. 축제 수혜 범위 분석(도보권 식음·상권·숙박·다음날 연계) | "축제장 주변에 일정이 과도하게 집중" 같은 B2B 검증 문구 | 장기 후보 — 미착수 |
| 15. 지역 문제 해결형 UX(체류시간 확대/지역 소비 확대/비수기 활성화/관광객 분산 등 목표부터 선택) | DNA 진단 결과 기반 해결 목표 자동 제안 | 장기 후보 — 현재는 테마부터 선택하는 흐름만 있고 "문제부터 선택" 진입점은 없음 |
| 16. 로컬상권/전통시장을 지역 소비 활성화 전략으로 활용 | 문화역사+상권, K-콘텐츠+상권, 축제+상권 등 조합 | 부분 구현 — SHOPPING 카테고리·지역 소비 접점 보완 로직은 있으나 "상권 연계 전략"으로 명시적으로 조합하지는 않음 |
| 17. 관광 가치/대표성 랭킹(인기도·방문량·대표성·콘텐츠 밀도) | 신뢰 가능한 공식 데이터가 있을 때만 도입, LLM 임의 평가·유명 관광지 이름 whitelist 금지 | 데이터 조사 필요 — 현재는 구조 신호(공식 분류)와 이름 키워드만 사용, 별도 인기도 데이터 소스 없음 |
| 18. 동일 시설/입점매장 중복 억제(백화점·아울렛 내 여러 매장이 각각 SHOPPING POI로 중복 추천) | 좌표/건물/근접성 기반 dedup, 특정 상호 blacklist 금지 | **완료(2026-08-16)** — 적용 범위: SHOPPING 카테고리 + 완전 동일 좌표(region+lat+lng)만(전국 조사 결과 SHOPPING만 동일좌표 그룹 최대 크기 205·평균 12.3인 반면 다른 카테고리는 최대 9·평균 2.1~2.3로 뚜렷이 달라, 이 범위만 안전하게 적용). 자동 추천 경로(`selectPois`/실행안 생성 시 보충 조회)에만 적용되고 DB 원본은 그대로 유지, 사용자가 검색으로 같은 시설의 다른 매장을 수동 추가하는 기능은 막지 않는다. 근접하지만 좌표가 완전히 같지 않은 동일 시설, ATTRACTION/FOOD 등 다른 카테고리의 동일 좌표(실제로 서로 다른 콘텐츠인 사례 다수 확인)는 이번 범위 밖 — `src/lib/domain/poiDedup.ts` 참고 |

### 제품 고도화 권장 순서(Phase A~E)

| Phase | 항목 | 상태 |
|---|---|---|
| A. 코스 품질 기반 | 1) 전략 핵심 테마 중심 코스 구성 강화, 2) 동일 시설/입점매장 중복 억제, 3) 후보 부족 안내 판정 정합성, 4) 이동거리/동선 품질 추가 개선 | 1~3번 완료(2026-08-16), 4번 미착수 → **Phase A 사실상 완료, 다음은 Phase B(코스 스튜디오) 검토 권장** |
| B. 코스 스튜디오 | 5) 추천 후보 풀, 6) 후보 추가/삭제, 7) Drag & Drop 재정렬/날짜 이동, 8) 지도 실시간 갱신, 9) 코스 실시간 품질검증 | **5~9번 완료(2026-08-16~17, 아래 상세 참고)** |
| C. 즉시 활용 가능한 콘텐츠 테마 확장 | 10) 문화예술, 11) 레저·액티비티 | **진행 중** — 문화예술은 전용 전략·상세 운영정보 배치 구조까지 완료. 레저는 `LS01~04` 공식 중분류·운영정보 배치까지 완료했으며 세부 체류시간 정책이 남음 |
| D. 별도 데이터 검증이 필요한 확장 | 12) 축제·이벤트 연계, 13) 무장애 여행 조건, 14) K-콘텐츠, 15) 반려동물 동반, 16) 야간관광, 17) 뚜벅이/대중교통, 18) 가족/유아동 | 축제·이벤트는 P1-2a 프로젝트 저장·명시 확정까지 로컬 구현, P1-2b 코스 연결과 Production migration 적용 필요. 나머지는 데이터 가용성 확인 전까지 미착수 |
| E. 고급 고도화 | 19) 관광 가치/대표성 ranking, 20) 축제 수혜 범위 분석, 21) 관광 문제 해결형 UX, 22) POI 유형별 체류시간, 23) 실시간 품질 검증 고도화 | 전부 미착수 |

Phase A 3번(후보 부족 안내 판정 정합성, 2026-08-16 완료): `poiFitService.ts`의 shortage 재계산이
① 실제 추천 파이프라인이 쓰는 TourAPI 구조 신호(`lclsSystm1/2`)를 넘기지 않아 항상 이름 키워드로만
판정하고, ② `4f093ec`의 SHOPPING 동일 시설 dedup을 반영하지 않아 중복 매장이 "적합 기준 미달"에
섞여 있던 문제를 고쳤다. 경주 CULTURE_HISTORY 실제 재현 기준 "전략 적합 기준에 미달한 장소 300곳"
→ "174곳"으로 정확해졌다(구조 신호 없이 이름 키워드로만 판정할 때 잘못 제외 처리되던 첨성대·대릉원류
124건이 더 이상 잘못 집계되지 않음). 새 fit 로직은 만들지 않고 기존 `computePoiFit`/
`dedupeBySameCoordinates`만 재사용했다 — 상세는 `docs/implementation-status.md`
"2026-08-16 갱신(3)" 절 참고.

Phase B 5번(추천 POI 후보 풀, 2026-08-16 완료): 실행안 화면("일자·시간대별 코스" 아래)에 "추천 후보"
섹션을 추가했다. 새 추천 알고리즘을 만들지 않고 기존 신호만 재사용한다 — `themeRelevanceTier`(구조
신호 우선 → 이름 키워드 → 관련성 없음, strategy.ts export 추가), `computePoiFit`/
`isExcludedFromRecommendation`(BELOW_MINIMUM_FIT 제외), `dedupeBySameCoordinates`(SHOPPING 동일
시설 중복 억제). 현재 course에 이미 있는 POI는 제외하고, 카테고리별 최대 4개·전체 최대 12개로 제한해
소수 정예만 보여준다(`src/lib/services/candidatePoolService.ts`). 카드에는 이름·카테고리·적합도
배지·추천 근거 한 줄을 보여주고, 날짜를 선택해 "이 날짜에 추가"를 누르면 **기존 장소 추가 흐름
(`addPoiToDay`)을 그대로 재사용**해 코스에 반영된다 — 새 저장 로직·서버 액션을 만들지 않았다. 후보
목록은 서버(page.tsx)에서 한 번만 계산해 내려주고, 클라이언트는 현재 course 상태로 실시간 필터링만
한다 — 후보를 추가하면 즉시 목록에서 사라지고, 삭제하면 다시 나타난다(별도 재조회·캐시 없음). 후보
조회 자체가 실패해도(null) 기존 일정 편집은 그대로 가능하고 후보 풀만 오류 상태를 보여준다. 경주·
청주·강릉·제천 실제 DB로 확인한 결과, 경주는 첨성대급은 아니지만 감은사지·경덕왕릉·경애왕릉·계림 등
실제 대표 문화유적이 "적합도 높음"으로 상단에 노출됐고, 청주는 `preferredThemes=[]`에서도 자연·
웰니스 핵심 카테고리 숙박·체험 후보가 우선됐다. 상세는 `docs/implementation-status.md`
"2026-08-16 갱신(4)" 절 참고.

Phase B 7번(Drag & Drop 코스 편집, 2026-08-16 완료): 위/아래 버튼·날짜 이동 select만 있던 실행안
편집기에 같은 날짜 순서 변경·다른 날짜 이동·추천 후보→일정 Drag & Drop을 추가했다. 새 편집 state를
만들지 않고 기존 `days` client state와 `recomputeDayItems`(시간 재계산)를 그대로 재사용한다 —
버튼 조작(인접 자리 교환/끝자리 추가)과 Drag & Drop(임의 위치 삽입)이 최종적으로 같은 재계산 경로를
타도록 `reorderCourseItemWithinDay`/`moveCourseItemToDay`/`insertPoiIntoDay`(`planBuilder.ts`)로
일반화했다. 라이브러리는 `@dnd-kit/core`+`sortable`+`utilities`를 새로 도입했다(터치·키보드 접근성을
기본 지원하는 유지보수 활발한 라이브러리, 네이티브 HTML5 Drag & Drop은 터치를 지원하지 않아 제외).
드래그가 실제로 무엇을 어디에 놓았는지는 `computeDragOutcome`이라는 순수 함수로 계산해 기존 함수로
위임하므로, dnd-kit 자체의 포인터/충돌 감지 메커니즘과 우리 코드의 책임(결과 계산)을 분리했다.
기존 위/아래 이동·날짜 이동 select·검색/후보 추가 버튼은 전부 그대로 남아있어(fallback 유지),
터치를 지원하지 않는 환경이나 스크린리더 사용자도 동일한 작업을 버튼으로 할 수 있다. Drag 중
서버/API 호출은 없고, 저장은 기존 `savePlanAction` 제출 시에만 일어난다. 상세는
`docs/implementation-status.md` "2026-08-16 갱신(5)" 절 참고.

Phase B 8번(코스 편집 지도 실시간 갱신, 2026-08-16 완료): 이전에는 Drag & Drop·추가·삭제 등으로
`days`가 바뀔 때마다(`CourseMap`이 `currentDay`를 effect 의존성으로 뒀기 때문에) 카카오 지도
인스턴스(`kakao.maps.Map`) 자체를 통째로 다시 만들어, 편집할 때마다 지도가 깜빡이고 사용자가 확대/
축소한 상태가 초기화됐다. 새 지도 전용 state를 만들지 않고 `PlanEditor`의 `days`를 그대로
`CourseMap`에 내려주는 기존 구조는 유지한 채, 지도 인스턴스는 카카오 키·날짜 탭이 바뀔 때만
재생성하고(`[kakaoKey, currentDay?.dayIndex]`), 마커·경로선은 별도 effect가 현재 날짜 POI 구성/
좌표로 만든 시그니처 문자열이 바뀔 때만 다시 그리도록 분리했다(`createMarkers`/`drawRouteLines`
공유 함수, `docs/implementation-status.md` "2026-08-16 갱신(7)" 절 참고). 추가/삭제처럼 POI 구성
자체가 바뀐 경우만 `fitBounds`를 다시 맞추고, 순서만 바뀐 reorder는 사용자가 조작한 확대/축소를
그대로 유지한다. 실제 도로 경로(Kakao Mobility)는 여전히 마운트 시 1회만 조회하고 편집 중에는 추가
호출하지 않는다(Playwright E2E로 실측 확인). 다른 날짜만 편집돼도 현재 보고 있는 날짜의 마커는
다시 그리지 않아 불필요한 재렌더링도 줄었다.

Phase B 9번(실시간 코스 품질검증 v1, 2026-08-17 완료): `PlanEditor`의 단일 source of truth인 현재
`days`를 서버 재조회 없이 순수 함수 `computeCourseQuality`에 전달해, 편집할 때마다 advisory 경고를
다시 계산한다. 기존 자동 생성·검증 기준을 재사용해 (a) `CORE_THEME_FLOOR_SHARE=30%` 기반 핵심 테마
구성, (b) SHOPPING 완전 동일 좌표 중복, (c) `DAILY_ITEM_TARGETS_BY_DURATION`와 날짜별 기본 시간 슬롯
기반 과밀, (d) 기존 점심·저녁 시간대 기반 식사 구성, (e) 기간별 날짜 수·숙박·일차 순서 정합성, (f)
`CAUTION_TRAVEL_MINUTES=60`/`EXCESSIVE_TRAVEL_MINUTES=90` 기반 이동 부담과 시간표 여유를 안내한다.
경고는 저장을 차단하지 않으며, 새로 추가한 후보·검색 POI에도 `mealEligible`·`lclsSystm1/2` 메타데이터를
보존해 구조 분류 우선·이름 키워드 fallback 원칙을 유지한다. 실제 도로 경로가 없는 편집 중 새 구간은
직선거리 기반 추정이라고 표시하고, 저장된 도로 경로가 있으면 그 값을 재사용한다. 구현은
`src/lib/domain/courseQualityValidation.ts`와 `src/components/plan/CourseQualityPanel.tsx`에 있으며,
새 서버 액션이나 DB schema 변경은 없다. 단위·컴포넌트 테스트, typecheck, lint, production build를
통과했다.

Phase C 10번 1차(문화예술 테마 기반, 2026-08-17): 새 전략 템플릿이나 DB schema를 추가하지 않고
기존 `CULTURE_HISTORY` 전략 자원을 재사용하는 세부 테마 `CULTURE_ARTS`를 도입했다. 자유 입력
키워드(`문화예술`, `미술`, `전시`, `공연`, `갤러리` 등)는 별도 테마로 분류하고, TourAPI 공식
`lclsSystm2=VE07`(전시시설)은 기존 `CULTURE_HISTORY`와 `CULTURE_ARTS` 양쪽의 구조 신호로
인식한다. `ATTRACTION` 우선순위·사업기회 라벨·실시간 품질검증 라벨·입력 폼 예시까지 연결했으며,
기존 문화·역사 판정은 유지한다. 전용 문화예술 전략 템플릿, 공연/전시 운영시간 기반 검증, POI별
체류시간은 다음 작업 범위다.

Phase C 10번 2차(`detailIntro2` 운영시간 데이터 기반 조사·파서, 2026-08-17): 로컬 API POI
48,268건 중 `VE07` 전시시설은 1,699건(ATTRACTION 1,698건, EXPERIENCE 1건)이었고, 현재
`areaBasedList2`로 저장된 `operatingHours`·`closedDays`는 0건이었다. raw payload에도 운영시간 필드는
없었다. 대신 `KorService2/detailIntro2`를 실제 VE07 문화시설 1건에 읽기 전용 호출해
`usetimeculture`·`restdateculture` 응답을 확인했고, `src/lib/public-data/adapters/tourInfoDetail.ts`에
contentTypeId별 운영시간·휴무일 정규화 파서를 추가했다. 이 어댑터는 대량 동기화에 자동 연결하지
않았으며, 호출량과 기존 데이터 보호를 위해 다음 단위에서 제한적 증분 배치·DB 반영을 설계한다.
`spendtime`은 표본에서 빈 값이었고 권장 체류시간의 의미·전국 커버리지가 확인되지 않아 아직 사용하지 않는다.

Phase C 10번 3차(`detailIntro2` 제한 증분 DB 반영, 2026-08-17): `npm run enrich:tour-info-detail --
--region-code=SGG_ONGJIN --max-items=1`처럼 SIGUNGU와 호출 상한을 모두 명시해야 실행되는 CLI를
추가했다. 한 번에 최대 100건까지만 허용하고, API POI·VE07/LS·각 contentTypeId(14/28)·운영시간/
휴무일 미확인·기존 상세 응답 미저장 조건을 모두 만족하는 후보만 순차 호출한다. 기존 `areaBasedList2` raw payload는
보존하면서 `detailIntro2` 원본과 정규화된 `operatingHours`/`closedDays`를 병합하고, 원격 DB 대상은
기존 데이터 동기화 가드로 차단한다. 로컬 옹진군 POI 1건에서 실제 API 호출→DB 저장→재조회까지
확인했다. 전국 대량 실행은 하지 않았다.

Phase C 10번 4차(운영시간·휴무일 실시간 품질검증 연결, 2026-08-17): 상세 API로 확보한
`operatingHours`/`closedDays`를 `PoiLike`·추천 후보·검색 추가·`CourseItem`까지 보존한다. 실행안
편집 중 `computeCourseQuality`가 단순 `HH:MM~HH:MM` 운영시간과 일정 체류시간을 비교해 범위 이탈
가능성을 advisory로 표시하고, 휴무일 문구는 여행일자·요일이 없는 현재 구조에서 자동 휴무 확정을 하지
않고 공식 안내 확인을 요청한다. 계절별·요일별 복합 문구는 자동 판정하지 않는다.

Phase C 11번 1차(레저·액티비티 공식 중분류, 2026-08-17): TourAPI `lclsSystmCode2`에서 확인한
`LS01` 육상·`LS02` 수상·`LS03` 항공·`LS04` 복합레저스포츠를 순수 분류 모듈로 추가했다. 추천 후보와
이미 코스에 담긴 장소의 근거 보기에서 공식 분류를 표시하고, 운영시간 advisory가 발생한 레저 항목에도
공식 분류를 함께 보여준다. 로컬 EXPERIENCE 3,774건에서는 LS01 1,035건·LS02 468건·LS03 36건·
LS04 43건이 확인됐으며, AC05/VE10/VE12 등은 레포츠로 단정하지 않는다. 겨울스포츠·골프·익스트림
등은 현재 공식 중분류에서 별도 근거가 확인되지 않아 장소명 추정을 하지 않는다.

이번 증분 배치 확장으로 `detailIntro2` 운영시간·휴무일 반영 대상도 VE07 문화시설과 LS 레포츠를
같은 지역·호출 상한 정책으로 처리한다. 실제 응답의 `예약시 운영`처럼 휴무일이 아닌 예약 운영 문구는
품질검증에서 별도 advisory로 표시한다.

## 2026-08-17 갱신(8) — Phase C 문화예술·레저 마무리

**1) 문화예술 전용 전략**: 기존 `CULTURE_HISTORY` 재사용만 하던 구조를 `CULTURE_ARTS` 전략
템플릿으로 분리했다. `VE07` 전시시설은 문화·역사와 문화예술 양쪽의 공식 구조 신호로 유지하되,
문화예술을 선택하면 전시·공연·인근 식음·상권 연계에 맞춘 전략명·KPI·위험·협력기관·예산 설명이
생성된다. 기존 전략 점수 공식과 DB schema는 변경하지 않았다.

**2) 복합 운영시간 보완**: 단순 `HH:MM~HH:MM`만 일정 체류시간과 자동 비교한다. 요일·시즌·공휴일·
회차·입장마감 조건이 섞였거나 복수 시간대가 있으면 자동 영업 가능 판정을 하지 않고 공식 안내 확인
advisory를 표시한다. `예약시 운영`은 기존처럼 휴무일이 아닌 예약 운영 안내로 처리한다.

**3) 전국 증분 실행 구조**: 기존 지역 단위 CLI에 `--all-regions --max-items=N`을 추가했다. SIGUNGU
255개를 코드순으로 조회하되 이번 실행의 상세 API 호출 총량은 기존 상한(최대 100건)을 넘지 않는다.
API POI·VE07/LS·운영정보 미확인·상세 응답 미저장 조건을 만족하는 후보만 순차 호출하며, localhost DB
가드는 그대로 적용된다. 전국 전체 백필은 한 번에 실행하지 않고 API 할당량과 실패 재처리 정책에 맞춰
여러 회차로 실행한다.

### 공모전 전 우선순위

| 순서 | 우선순위 | 작업 | 핵심 산출물 | 예상 작업량 |
|---:|---|---|---|---:|
| ~~1~~ | ~~P0~~ | ~~강릉/경주/제천 대표 시나리오 통합 검증~~ | ~~생성→분석→전략→실행안→홍보→복사→인쇄 E2E~~ | **완료(2026-08-01)** |
| 2 | P0 | 전략별 POI 품질 개선(추가 고도화) | 실제 도로/대중교통 경로 반영, 영업시간 기반 경고. **전략 핵심 테마 중심 코스 구성 강화·단순 운영시간/휴무일 advisory는 완료**(위 "TOUR-DNA 중장기 제품 로드맵" 1·5번 참고), 복합 운영시간 해석·실제 경로 범위 확장은 후속 | 4~6인일 |
| ~~3~~ | ~~P0~~ | ~~조건 수정·안전한 재분석(Phase 6)~~ | ~~기존 프로젝트 입력값 수정 후 안전한 재분석(계산 실패 시 기존 데이터 보존, 성공 시 기존 실행안·홍보자료 교체)~~ | **완료(2026-08-02)** |
| ~~4~~ | ~~P0~~ | ~~유사지역 비교~~ | ~~DNA 5축·POI 구성이 가장 비슷한 지원 지역 2~3곳과 비교, 기준월 안내 포함~~ | **완료(2026-08-02~03)** |
| ~~5~~ | ~~P0~~ | ~~관광사업 기회발굴~~ | ~~취약점·계절·타깃·공급 격차 기반 사업 기회 3안(DNA 진단과 전략 3안 사이에 표시)~~ | **완료(2026-08-02)** |
| ~~6~~ | ~~P0~~ | ~~사업 사전검증 리포트~~ | ~~추진 권고·보완사항·위험·데이터 신뢰도(DNA·POI·이동·유사지역 비교·위험 요인 조합)~~ | **완료(2026-08-03, 커밋 `f2e3f57`, Production 배포됨)** |
| ~~7~~ | ~~P0~~ | ~~KPI 연결 강화~~ | ~~사업 목적과 취약지표에 연결된 측정 KPI(측정 목적·연결 DNA 축·연결 사업 목표·권장 시점·목표값 근거)~~ | **완료(2026-08-03~04, 커밋 `f2e3f57`, Production 배포됨)** |
| ~~8~~ | ~~P1~~ | ~~사업안 비교·예산·협력 대상~~ | ~~전략별 장단점·예산 항목·협업 기관~~ | **완료(2026-08-04, 커밋 `f2e3f57`, Production 배포됨)** |
| 9 | P1 | 프로젝트별 접근 제어 | 접근키·비밀번호와 프로젝트 단위 보호(이미 축소 구현 완료 — 세분화 항목만 남음) | 2~3인일 |
| 10 | P1 | 카카오모빌리티 자동차 실제 경로(Phase 12) | PRIVATE_VEHICLE 실행안의 인접 구간 거리·시간을 카카오 실제 도로 경로로 계산, LIVE_API/CACHED_API/ESTIMATED 구분 표시(로컬 구현·테스트 완료, 2026-08-06, 커밋 전 — 카카오 응답 저장·캐시 정책 공식 확인 전까지 RouteCache는 비활성화 상태) | 완료(검증만 남음) |

### 전국 실사용 베타 확장

2026-08-12 기준 로컬 DB에서는 전국 SIGUNGU 255/255 동기화·품질 감사(PASS)·DNA 분석 가능 확인, 최신
기준월 저비용 발견 + STAGING 증분 sync(Phase 2-B), completeness/audit + DNA drift gate를 통과해야만
승격되는 안전 승격 경로(Phase 2-C), 그리고 TOUR_INFO(POI) TTL 재사용(Phase 2-D)까지 끝났습니다(아래
표의 1~8단계에 해당). 남은 항목은 **POI 폐업 자동 감지·자동 승격(사람 개입 없는 스케줄링)·운영
안정성**이며, 단순 지역 수 확대 작업은 아닙니다.

| 단계 | 작업 | 상태 |
|---:|---|---|
| 1 | 전국 행정구역·TourAPI 코드 마스터 자동 생성 및 감사 | **완료(로컬)** — Region 마스터 SIDO 16 + SIGUNGU 255 |
| 2 | 지역별 배치·재시도·중단 재개가 가능한 동기화 파이프라인 | **완료(로컬)** — `runResumableLocalBatchSync`, `--max-regions` 청크, 429 안전 중단 |
| 3 | 전국 최초 적재·누락·기준월·이상치 검증 | **완료(로컬)** — `npm run audit:tourism-data` PASS, ERROR 0 |
| 4 | 전국 POI 증분 동기화·중복·분류·추천 품질 관리 | 부분 완료 — 최초 적재·TTL 기반 재사용(Phase 2-D)은 끝났고, **폐업 자동 감지는 여전히 TODO**(현재는 upsert만, delete 없음) |
| 5 | 검증된 기준월만 분석에 쓰는 기반(ACTIVE Dataset) | **완료(로컬, Phase 2-A)** |
| 6 | source별 최신월 저비용 탐지 + STAGING 생성 + 증분 sync(Phase 2-B) | **완료(로컬)** — `npm run dataset:discover`, `sync:tourism-data -- --dataset=staging`, `dataset:status` 진행률 표시 |
| 7 | completeness/audit + DNA drift gate 통과 시에만 승격하는 안전 경로(Phase 2-C) | **완료(로컬)** — `npm run dataset:drift`(읽기 전용 사전 확인), `dataset:activate`가 내부적으로 drift gate를 거침. **완전 자동(사람 개입 없는) 승격은 아직 없음** — PASS여도 사람이 `dataset:activate`를 직접 실행해야 한다 |
| 8 | TOUR_INFO(POI) freshness TTL 기반 재사용(Phase 2-D) | **완료(로컬)** — TTL 60일, `classifyTourInfoFreshness`/`fetchTourInfoLastFreshFetchByRegion`, 새 STAGING baseYm에서 fresh 지역은 API 호출 0건. `--force-tour-info`로 강제 갱신 가능 |
| 9 | 동기화 성공률·실패 지역·API 사용량 운영 화면 | TODO |

**로컬 DB 기준으로 완료된 것이며, Production Neon DB/Vercel 배포에는 아직 반영·검증하지 않았다** —
Production에 실제로 적용하려면 migration 적용, `npm run dataset:activate`로 ACTIVE 재설정, 실
브라우저 검증이 필요합니다. 상세는 [docs/implementation-status.md](docs/implementation-status.md)
"2026-08-11 종합 갱신" 절과 [docs/implementation-plan.md](docs/implementation-plan.md)의 최신 상태
절 참고.

### 공모전 이후 운영 확장

| 우선순위 | 작업 | 목적 |
|---|---|---|
| P1 | 실제 사업 실적 입력과 전후 비교 | 계획 KPI와 실제 성과 연결 |
| P1 | 기관별 계정·워크스페이스·권한 | 여러 기관의 프로젝트 분리 |
| P1 | 관리자 모니터링·장애 알림·재처리 | 전국 데이터 운영 안정성 확보 |
| P2 | 지역별 기존 관광사업 DB와 중복 점검 | 유사·중복 사업 위험 감소 |
| P2 | 연도별 성과 비교와 개선 추천 | 일회성 기획이 아닌 반복 개선 |
| P2 | 협업·결재·기관 보고 양식 연동 | 실제 실무 흐름에 정착 |

<details>
<summary>기존 세부 개발 백로그 보기</summary>

아래 항목은 기존 코드와 운영 환경에서 확인된 세부 개선사항입니다.

1. **동기화 실패 알림 부재** — `SyncLog`에 `PARTIAL`/`FAILED`가 쌓여도 아무에게도 알림이 안 간다. Slack/이메일
   웹훅 하나만 붙여도 baseYm 방치 같은 사고를 훨씬 빨리 발견할 수 있다.
2. **프로덕션 에러 트래킹 부재** — `console.error`만 있고 Sentry 등이 없어, 배포 후 예외는 Vercel 로그를
   직접 뒤져야만 보인다.
3. **실행 가능성 검사가 직선거리 기반(PRIVATE_VEHICLE만 실제 경로로 보완, 2026-08-06)** —
   `checkFeasibility`/`estimateTravel`(haversine 직선거리 + 교통수단별 평균속도)은 이제 PRIVATE_VEHICLE
   실행안에 한해 `src/lib/services/route/`가 카카오모빌리티 자동차 길찾기 실제 결과로 덮어쓴다(로컬
   구현·테스트 완료, 커밋 전). WALK/PUBLIC_TRANSPORT/MIXED는 여전히 haversine 추정치만 쓴다 — 카카오맵
   대중교통/도보 경로 API 연동은 이번 범위 밖. 영업시간(`operatingHours`)·휴무일(`closedDays`) 필드는
   여전히 검증에 안 쓰인다(다음 단계). 카카오 응답의 자체 DB 저장·재사용 허용 여부를 공식 약관으로
   확정하지 못해 `RouteCache`(재사용 캐시)는 기능 플래그로 비활성화해뒀다 — `docs/route-api-status.md`
   참고.
4. **완전히 새로운(미등록) 장소를 실행안에 직접 추가하는 기능 없음** — 지금은 DB에 등록된 POI 검색만
   가능하다. 주소/좌표를 직접 입력해 만드는 플로우는 지오코딩 등이 필요해 범위가 있다.
5. **문화자원수요·연관관광지 API 미확인** — base URL/오퍼레이션명 또는 유효 코드값을 여전히 못
   찾았다(Swagger UI 필요). `docs/public-api-status.md` 참고. (방문자수 API는 2026-07-28 확인 완료.)
6. **관리자 대시보드 없음** — `SyncLog`/`DataSnapshot` 상태를 보려면 DB를 직접 조회해야 한다. 간단한
   `/admin` 페이지만 있어도 운영 편의성이 크게 오른다.
7. **동시 편집 시 낙관적 락 없음** — 지금은 단일 운영자 가정이라 급하지 않지만, 여러 사람이 같은 실행안을
   동시에 열어 저장하면 나중 저장이 이전 걸 덮어쓴다.
8. **대전 자치구 세분화(P2)** — 통계청 API가 자치구 단위로만 데이터를 줘서 유성구 하나로 대전 전체를
   대표한다. 다른 4개 구(동/중/서/대덕)로 나누려면 그만큼 API 호출·정규화 로직이 늘어난다.
9. **계정/소유권 분리는 보류 상태** — 지금은 공유 비밀번호 하나로 사이트 전체를 잠그는 정도다(`SITE_ACCESS_PASSWORD`).
   여러 조직이 서로 다른 프로젝트를 완전히 분리해서 써야 하는 상황이 오면, User 모델과 프로젝트별 소유권
   분리가 필요해진다 — 개발 범위가 꽤 커서 필요해질 때 다시 논의하는 게 낫다.
10. **E2E가 실행안 편집기의 세부 상호작용까지는 다루지 않음** — 코스 추가/삭제/날짜이동/시간수정/실행
    가능성 경고는 지금 단위테스트(jsdom)로만 검증되어 있다. 실제 브라우저(Playwright)로 이 상호작용까지
    타는 E2E가 추가되면 회귀를 더 일찍 잡을 수 있다.
11. **카카오맵 검색으로 코스에 장소 추가(P1)** — 동선 표시(위 완료)와 달리 이건 ① Kakao Places 검색
    연동 ② 검색된 곳이 DB에 없으면 새 POI로 저장하는 쓰기 경로 ③ `Poi.sourceType`에 새 값 추가(Prisma
    마이그레이션 필요)까지 묶여 있어 별도 작업으로 분리했다. 대략 2~3일.
12. **[2026-08-11 갱신: 실제로는 온디맨드가 아니라 배치 방식으로 255/255 완료했다]** 아래는
    2026-07-22 시점 계획 기록이다 — 실제로는 온디맨드 캐싱 대신 재개 가능한 배치 동기화
    (`runResumableLocalBatchSync`, `--max-regions` 청크 단위)로 로컬 DB SIGUNGU 255/255를 전부
    채웠다(원래 우려했던 "229개 코드 매핑"은 REGION_SEED에 255개 전부 이미 등록돼 있어 해소됐고,
    "일일 API 할당량 초과" 우려도 청크를 나눠 여러 회차로 실행해 실제로는 문제가 되지 않았다). 아래
    원본 계획은 참고용으로 남긴다.
12-원본. **전국 지역 확대 — 일괄 사전 동기화 대신 온디맨드 캐싱으로 방향 정함(2026-07-22)** — 조회 시점에
    DB에 해당 지역 데이터가 없으면 그때 공공데이터 API를 호출해 저장하고, 이후 같은 지역·같은 기준월
    조회는 DB에서 바로 서빙하는 방식(현재 `DataSnapshot`/`NormalizedMetric`이 이미 지역+기준월+지표
    키로 upsert되는 구조라 이 캐시 자체는 이미 있다 — 지금은 그걸 채우는 트리거가 cron/수동뿐이라는
    점만 다르다). 이 방식이면:
    - 전국 229개 시/군/구의 **행정표준코드 매핑표는 여전히 사전에 확보해야** 한다(실제 조회 자체는
      코드가 있어야 가능하므로) — 다만 코드만 미리 넣어두고 지표/POI 데이터는 안 채워도 되니 준비
      작업량은 크게 줄어든다.
    - data.go.kr 할당량은 "상세기능(오퍼레이션)당 일 1,000건" 기준으로 재계산하면, 지역당 호출이 가장
      많은 다양성 API(`areaTouDivList`/`areaExpDivList`, 지역당 6건씩)만 229개 지역 전체를 하루에 다
      돌리면 1,380건으로 초과한다 — 온디맨드라면 애초에 한 지역씩 스며들듯 호출되니 사실상 문제가 안
      되고, 그래도 전체 일괄 재동기화를 하고 싶다면 이틀에 나눠 돌리면 그만이다.
    - 남은 진짜 리스크는 **첫 조회 지연**이다: 지역 하나를 처음 채울 때 지표 API 4종 + POI 페이지네이션
      호출이 필요한데, 지금 `runTourismDataSync`는 이 4종을 순차로(await 하나씩) 호출한다 — 온디맨드로
      쓰려면 `Promise.all`로 병렬화해서 지연을 줄이고, 그래도 오래 걸리면 로딩 문구를 보여주거나 Vercel
      요금제의 함수 실행시간 제한(Hobby 10초 등)을 검토해야 한다.
13. **[2026-08-11 갱신: 실제로는 코호트를 나누지 않고 min-max를 log1p로 보완하는 쪽을 택했다]**
    아래는 2026-07-22 시점 계획 기록이다 — 실제 255개 확대 후 QA에서 문제가 된 것은 "성격이 다른
    지역 간 비교"가 아니라 "Demand/Spend 축의 극단값 민감도"였다. 코호트를 시/도·행정유형별로
    쪼개는 대신(비교 모집단이 오히려 작아지는 부작용), Demand/Spend 두 축에만 `log1p` 압축을 추가해
    코호트는 그대로 전국 SIGUNGU 255개로 유지했다(percentile rank도 비교했으나 strength/weakness·
    유사지역·전략 결과가 크게 흔들려 채택하지 않음 — `docs/scoring-model.md` 참고). 아래 원본 계획은
    참고용으로 남긴다.
13-원본. **DNA 코호트 재설계(전국 확대 시 필요)** — 시/군/구를 229개로 늘리면 지금처럼 전국 단일 코호트로
    min-max 정규화하면 "양양군과 부산"처럼 성격이 다른 지역이 직접 비교된다. 후보:
    - (a) 같은 시/도 안에서만 비교 — 지리적으로는 맞지만 시/도별 시/군/구 수가 들쭉날쭉해(세종·제주 등)
      작은 코호트 문제가 다시 생길 수 있음
    - (b) 시/군/구 행정 유형(시/군/구 — 이름 끝 글자로 이미 구분됨, 추가 데이터 불필요)별 비교 — "군"은
      "군"끼리, "시"는 "시"끼리
    - (c) 전국 고정 코호트를 유지하되 min-max 대신 percentile rank 사용 — N이 커지면(229) 통계적으로
      더 안정적이고, "전국 대비 상위 X%"로 표현하면 이질적 비교라는 위화감도 줄어듦
    - 추천안: (a)를 기본으로 하되 코호트가 너무 작으면(예: 5개 미만) (b)로 넓히는 하이브리드. 다만 이건
      순수 개발 작업이 아니라 상품 설계 결정이라 실제 착수 전에 다시 확인 필요.

</details>

## 문서 목록

- [docs/implementation-plan.md](docs/implementation-plan.md) — 구현 계획과 단계별 진행 로그
- [docs/architecture.md](docs/architecture.md) — 아키텍처 개요
- [docs/data-dictionary.md](docs/data-dictionary.md) — 데이터 모델/코드값 사전
- [docs/scoring-model.md](docs/scoring-model.md) — DNA/전략 점수 공식
- [docs/public-api-status.md](docs/public-api-status.md) — 공공데이터 API 연동 현황(2026-07-21 실키 검증 결과 포함)
- [docs/deployment.md](docs/deployment.md) — 배포 가이드
- [docs/operator-checklist.md](docs/operator-checklist.md) — 운영자 체크리스트
- [docs/implementation-status.md](docs/implementation-status.md) — 기능별 로컬/원격/DB/배포 반영 상태와 최근 개선 라운드 기록
- [docs/test-scenarios.md](docs/test-scenarios.md) — 수동 테스트 시나리오(직접 눌러보며 확인하는 체크리스트)
