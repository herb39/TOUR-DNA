# 운영자 체크리스트

## 현재 운영 체크리스트 — 2026-09-01

아래 항목이 현재 Production 운영과 공모전 시연 전 확인의 기준이다. 이 문서 아래의 날짜별 절은
당시 실행 기록을 보존한 historical 기록이므로, 현재 상태를 판단할 때는 이 절을 우선한다.

### Production 기본 확인

- [x] 운영 branch는 `main`이며, 최신 검증 커밋이 `origin/main`에 반영돼 있다.
- [x] Production 배포 상태는 `READY`, 공모전 시연 상태는 `READY`다.
- [x] Production migration은 `17/17 APPLIED`다. 월별 Dataset을 추가할 때 migration을 반복하지 않는다.
- [x] Production ACTIVE Dataset은 `202606`이다.
- [x] 공개 URL은 `https://tour-dna.lib.lc`이며, 프로젝트 생성·분석·Course Studio·저장/재진입 등
      핵심 runtime 흐름을 사용한다.
- [ ] 시연 직전 공개 URL에서 대표 프로젝트, DNA 5축, 전략 3안, Course Studio, 저장/reload,
      Festival Anchor, PET, ACCESSIBILITY, Print를 순서대로 확인한다.

### Neon 안전 정책

- [x] Production Neon에서 전국 batch를 실행하지 않는다.
- [x] Production Neon에서 공식 API batch, 전국 반복 조회, 대량 read, seed, backfill을 실행하지 않는다.
- [x] 전국 API sync, Dataset build, normalization, completeness/drift 검증은 local PostgreSQL에서만 수행한다.
- [x] PET·ACCESSIBILITY는 전국 bulk enrichment를 하지 않는다. 필요한 사용자 노출 대상의 targeted
      근거와 검증된 최종 결과 promotion/import만 허용한다.
- [ ] Production promotion/import 전에 대상 table, insert/update 예상 row 수, delete 여부, 총 write 수,
      transaction 범위와 rollback 방식을 기록한다.
- [x] `ALLOW_REMOTE_DATA_SYNC` 또는 유사한 원격 batch 허용 설정은 현재 운영에서 활성화하지 않는다.
      Vercel Cron이 존재해도 Production 전국 수집을 재개하지 않는다.

### Dataset 운영 체크

- [x] 현재 ACTIVE는 `202606`이다.
- [x] 공식 API 최신 완전월 `202607`을 확인했지만 아직 Production에 반영하지 않았다.
- [ ] 9월에 local에서 `202607 → 202608`을 순차 구축하고 각 월의 completeness/audit를 확인한다.
- [ ] `FAILED`·`MISSING` source와 지역별 미수집 현황을 확인한다.
- [ ] `npm run dataset:drift -- --base-ym=YYYYMM`의 drift gate 결과가 `PASS`인지 확인한다.
- [ ] 대표 지역·대표 프로젝트·전략 1위·유사지역 Top3 변화와 Production 예상 write 범위를 검토한다.
- [ ] `npm run dataset:activate -- --base-ym=YYYYMM` 승격 후 기존 Dataset이 `ARCHIVED`로 보존되고
      새 Dataset만 `ACTIVE`인지 확인한다.
- [ ] 최종 검증된 결과만 Production에 promotion/import하고, 반영 뒤 대표 row와 Dataset 상태를 소량 확인한다.

### Production 데모 체크

- [ ] 대표 프로젝트에 접근해 지역·여행월·역할·기간·문제·테마·여행 조건을 확인한다.
- [ ] DNA 5축의 진단·기회·근거와 전략 3안이 표시되는지 확인한다.
- [ ] 전략 선택 후 Course Studio 자동 초안·추천 후보·지도·동선·체류시간 편집을 확인한다.
- [ ] 후보 추가/삭제·순서 변경 후 저장하고 새로고침·재접속해 변경값이 유지되는지 확인한다.
- [ ] Festival Anchor 후보·날짜·코스 연결을 확인하고, 공식 시각이 없으면 임의로 보정하지 않는다.
- [ ] PET와 ACCESSIBILITY는 공식 evidence가 있는 POI만 근거로 표시되는지 확인하고, 없는 POI는
      `UNKNOWN`으로 유지되는지 확인한다. `UNKNOWN`을 이용 불가로 해석하지 않는다.
- [ ] Print/PDF는 브라우저 인쇄·PDF 저장 흐름으로 확인한다. 자동 PDF 생성이나 물리 출력 완료로
      과장하지 않는다.

### Promo LLM 운영 체크

- [x] rule generator가 항상 기본 생성 경로로 동작하고, `generatedBy = rule`일 때 `기본 생성` 배지를 표시한다.
- [x] Production QA `[PROD QA] 경주 자연·웰니스 체류형 상품`에서 `liquid/lfm-2.5-2.6b:free` 실제 생성 1회를
      성공시켜 `generatedBy = ai`, `AI 생성`, 7개 채널 저장과 재진입 유지를 확인했다.
- [x] 실시간 생성 실패 시 provider 원문을 노출하지 않고 rule fallback으로 유지한다.
- [x] 공모전 기본 시연은 저장된 AI 결과를 사용하며 실시간 재생성은 핵심 동선의 필수 단계로 두지 않는다.
- [x] 공모전 전까지 모델 탐색·자동 순회·retry·timeout 조정·prompt 대규모 변경·Production 추가 재생성을
      동결한다.
- [ ] LLM context에 개인정보·민감정보를 입력하지 않는다. 실제 상용화 전 provider 정책과 사용자 안내를
      별도로 재검토한다.

### 제출 전 남은 확인과 기술 부채

- 제출 전 우선순위는 9월 Dataset 최신화, drift 검증, 최종 promotion/import, targeted Festival refresh,
  final demo QA, 문서·제출 자료 완성이다.
- 실제 모바일 touch Drag & Drop 전체 검증, POI 폐업·삭제 history, 숙박·장거리 동선 realism,
  무료 Promo LLM provider의 429·지연 대응, `DEMAND_RESOURCE` 공식 코드 확인은 기술 부채 또는 제한 사항이다.
- 제출 전에는 새로운 대형 기능보다 데이터 최신화, 시연 안정성, 문서와 제출 완성도를 우선한다.

> **역사 기록 안내**: 아래 기존 체크리스트는 작성 당시의 배포·지역 확장·API 확인 과정을 보존한다.
> 현재 Production 상태, Neon 정책, Dataset 기준은 위 2026-08-31 절과 `docs/deployment.md`,
> `docs/implementation-status.md`의 최신 요약을 기준으로 한다.

> **2026-08-11 갱신**: 아래 "37곳"/"Batch 3 남해군 1곳만 완료" 등은 그 시점(2026-08-08) 기록으로
> 보존한다. 로컬 DB 기준으로는 이후 Neon 쿼터와 무관한 로컬 PostgreSQL(`tour_dna_local`)에서 배치
> 동기화를 이어가 **전국 SIGUNGU 255/255 완료**(ERROR 0, `npm run audit:tourism-data` PASS)됐고,
> 분석은 이제 `npm run dataset:activate -- --base-ym=202606`으로 승격한 ACTIVE Dataset만 사용한다
> (`docs/deployment.md` "검증된 데이터셋(ACTIVE Dataset)" 절 참고). Production Neon은 이 갱신에서
> 건드리지 않았다.

## 최초 배포 전

- [x] Neon 프로젝트 생성, `DATABASE_URL`/`DIRECT_URL` 발급 및 등록
- [x] `npm run db:migrate` 실행 확인
- [x] `npm run db:seed` 실행 확인 (대전/제천/양양/강릉/경주/제주/통영 7개 지역 fixture + 데모 프로젝트 생성)
      — fixture는 여전히 이 7개 지역만 대상이다. 2026-08-07에 실 API 동기화만으로 20개 지역(Batch
      1+2), 2026-08-08에 10개 지역(Batch 3)을 추가 등록해 총 지원 SIGUNGU는 37곳이다(fixture 대상과
      별개, `docs/data-dictionary.md` 참고). Batch 3은 Region 등록까지는 완료됐으나, Neon DB 데이터
      전송 쿼터 초과로 관광 데이터 동기화는 남해군 1곳만 완료된 상태다 — 쿼터 회복 후 재실행 필요.
- [x] 카카오 개발자 콘솔 애플리케이션 등록 및 배포 도메인 허용 목록 등록(**"JavaScript 키 > JavaScript
      SDK 도메인"**에 `https://tour-dna.lib.lc` 등록 완료). ⚠️ 이 과정에서 Vercel에 잘못된 키 값이
      설정돼 있던 것을 발견·수정함 — 아래 참고.
- [x] `CRON_SECRET`을 임의의 강한 값으로 설정(빈 값이면 모든 sync 요청이 401 처리됨을 확인)
- [x] `npm run build` 로컬 통과 확인
- [x] `npm run test:e2e` 통과 확인(개발 서버 기동 상태에서) — 8개 전부 통과(2026-07-21)
- [x] Vercel 배포 완료(`tour-dna.lib.lc`), Vercel Cron 등록(매월 1일)
- [ ] **(운영자 직접 설정 필요)** Vercel 환경변수에 `SITE_ACCESS_PASSWORD`를 강한 값으로 설정 —
      설정 전까지는 사이트가 로그인 없이 전체 공개 상태다(`src/proxy.ts`). 값은 프로젝트 생성자와
      URL을 공유받은 사람들끼리만 공유할 것. 설정 후 재배포하면 즉시 적용된다(코드 변경 불필요).

## 공공데이터 API 실 키 발급 후 (필수 재검증) — 2026-07-21 거의 완료

- [x] `TOUR_API_SERVICE_KEY` 발급 완료
- [x] 지역 코드 체계 확정: 통계청 행정표준코드(`AreaTarDemDsService`/`AreaTarDivService`/
      `AreaTarResDemService`용, 대전 유성구=30/30200, 제천=43/43150, 양양=51/51830) + TourAPI 구코드
      (`KorService2`용, 대전=3/충북=33/강원=32)
- [x] 지역별 관광 수요 강도: 체류(`/areaTarSjrnDsList`, tarSjrnDsIxCd=2103)·소비(`/areaTarExpDsList`,
      tarExpDsIxCd=2201) 코드 파라미터까지 확인, 3개 지역(대전 유성구/제천/양양) 전부 실제 데이터 확인,
      어댑터 반영 완료
- [x] 지역별 관광 다양성: `touDivIxCd`(6종)·`expDivIxCd`(6종)·`intlDivIxCd`(3종) 전체 코드 확인, 변동계수
      기반 재계산 로직 구현 완료 — 저장 보류 없이 정상 저장
- [x] 지역별 관광 자원 수요(`AreaTarResDemService`, 새로 확인된 base URL): `/areaTarSvcDemList`
      (tarSvcDemIxCd=1101) 실제 데이터 확인 — 이 값이 METRIC_CODES.DEMAND_SERVICE의 진짜 출처였음을
      확인하고 syncService.ts 저장 위치를 바로잡음. `/areaCulResDemList`(문화자원수요, DEMAND_RESOURCE
      추정)는 파라미터명만 확인, 유효 코드값 미확인 — Swagger UI 필요
- [x] 국문 관광정보 서비스: `KorService2/areaBasedList2` 실제 데이터 확인, POI upsert 파이프라인 연결
      완료(큐레이션 FIXTURE 보호 로직 포함, 3개 지역 총 281건 실제 장소 반영 확인)
- [x] 수요(Demand) 지수 오퍼레이션명 확인 완료 — Swagger UI 확인 결과 `AreaTarDemDsService`에는 체류/
      소비 2개 오퍼레이션만 존재, 별도 수요 오퍼레이션 없음(docs/public-api-status.md 참고)
- [ ] 지역별 방문자수·연관관광지 API의 실제 base URL·오퍼레이션명 확인 — 여전히 미확인
- [x] `npm run sync:tourism-data`로 실 데이터 동기화 및 `SyncLog` 결과 확인 완료(다양성·체류·소비·
      자원수요·POI 전부 SUCCESS)
- [x] `TOUR_DATA_BASE_YM`을 202509 → 202606으로 최신화(실제 데이터가 202606까지 존재함을 확인),
      fixture/데모 프로젝트도 갱신
- [x] `docs/public-api-status.md`의 "다음 재검증 시 확인할 것" 항목을 확인된 내용으로 갱신

## 새 지역 추가 절차 (2026-07-21부터, 2026-08-07 Batch 1+2로 실전 검증됨)

- [ ] `npm run verify:region -- --name <지역명> --area-cd <시도2자리> --signgu-cd <시군구5자리> --tour-api-area-code <구코드>`로
      후보 코드를 실 API로 확인(통계청 코드는 `areaNm`/`signguNm` 응답 원본, TourAPI 코드는 `areaCode2`
      전체 목록 대조). 코드를 추측해서 바로 fixture에 넣지 말 것 — 과거 여러 번 다른 지역 코드로 잘못
      확인된 적이 있다(2026-08-07에도 전남·광주 통합 코드가 통계청 API와 체계가 달라 후보에서 전부
      제외한 사례가 있었다 — 아래 "알려진 사고 사례" 참고).
- [ ] 확인된 코드를 `src/lib/fixtures/regions.ts`의 `REGION_SEED`에 추가(SIDO가 새로 필요하면 SIDO 행도
      함께 추가). 지역명이 실제 주소에 부분 문자열로 나타나지 않으면(대구 중구 사례 등)
      `syncService.ts`의 `TOUR_INFO_ADDRESS_FILTER_OVERRIDE`에 별도 키워드를 등록해야 POI가 정상
      수집된다.
- [ ] `npm run db:seed` 실행(Region은 upsert라 기존 데이터에 안전) → 실 동기화(`npm run sync:tourism-data --
      --base-ym=YYYYMM` — 2026-08-07부터 이 플래그 형식만 지원한다. 위치 인자(`sync-tourism-data.ts
      202606`)는 더 이상 지원하지 않고 즉시 거부된다. 인자를 생략하면 `TOUR_DATA_BASE_YM` 환경변수 →
      최신 공통월 자동 탐색 순으로 넘어가며, 자동 탐색은 `npm run check:base-ym`으로 DB 쓰기 없이 먼저
      확인할 수 있다)로 해당 지역 지표/POI 확보 확인
- [ ] `docs/data-dictionary.md`의 지역 표, `docs/public-api-status.md`의 코드 체계 표 갱신
- [ ] **10곳 단위 배치로 나눠 진행하고, 배치 사이에 코드 검증에 쓰는 `AreaTarDivService`(관광 다양성
      API) 호출량을 확인할 것** — 이 API는 일일 호출 한도가 존재하며(정확한 수치는 미확인), 후보
      스크리닝에서 과하게 호출하면 그날 안에는 신규 지역 동기화까지 막힌다(429). 한도가 풀렸는지
      불확실한 상태에서 무제한 재시도하지 않는다 — 다른 날 다시 시도하거나, 다른 오퍼레이션
      (`TAR_SVC_DEM`/`TOUR_INFO`)으로 먼저 스크리닝한다.
- [ ] **Batch 3~5 실행 전 최신월 확인 절차(2026-08-07 도입)**: 지역을 추가하기 전에
      `npm run check:base-ym`을 먼저 실행해 `TAR_SVC_DEM`·`TOU_RES_DEM`이 공통으로 제공하는 최신월을
      확인한다(DB 쓰기·전체 동기화 없음, 대표 지역 제천시 1곳만 사용). 이 명령이 찾은 월을 그대로
      `npm run sync:tourism-data -- --base-ym=<확인된 월>`에 넘겨 Batch 전체가 같은 기준월을 쓰도록
      한다. `AreaTarDivService`(관광 다양성)는 한도 문제 이력이 있어 이 자동 탐색에서 의도적으로
      제외했다 — 그 축은 여전히 `sync:tourism-data` 실행 시 지역별로 개별 확인된다(itemCount로 판단).
      2026-08-07 기준 실제 확인 결과: `TAR_SVC_DEM`·`TOU_RES_DEM` 둘 다 202607 데이터가 아직 없고(2건
      모두 정상 응답, EMPTY), 202606까지만 제공됨을 확인했다 — 8월이라는 이유만으로 7월 데이터가
      공개됐다고 가정하지 않는다.

## 정기 운영

- [ ] Cron이 매월 1일 정상 실행되는지 `SyncLog`로 확인 — 다양성/체류/소비/자원수요/POI 전부 이제 실제로
      저장되므로 매월 데모 점수가 최신 실 데이터로 자연스럽게 갱신된다(더 이상 SKIPPED 처리 없음)
- [ ] 부분 실패(`PARTIAL`) 발생 시 어떤 API가 실패했는지 `SyncLog.results`에서 확인,
      해당 API만 재시도(기존 성공 데이터는 유지되므로 서비스는 계속 정상 동작)
- [ ] `TOUR_DATA_BASE_YM`(또는 화면 표시용 `DEFAULT_BASE_YM`)을 새 기준월로 교체할 때는
      `npm run check:base-ym`으로 새 기준월 데이터가 실제로 존재하는지 먼저 확인 후 배포 환경변수를
      갱신 — 매달 자동으로 최신화되지 않으니 수동 유지보수 필요(단, `sync:tourism-data` CLI 자체는
      인자를 생략하면 이제 자동으로 최신 공통월을 찾으므로 이 수동 절차가 필수는 아니다)

## 새 기준월 반영 절차 — ACTIVE Dataset 발견·증분 sync·안전 승격 (Phase 2-A/2-B/2-C/2-D, 2026-08-12)

분석이 쓰는 baseYm은 `TOUR_DATA_BASE_YM`이 아니라 `Dataset` 테이블의 ACTIVE 행이다(위 항목의
`TOUR_DATA_BASE_YM`은 sync 대상월 결정에만 쓰인다). 새 월을 실제 서비스 분석에 반영하려면:

1. `npm run dataset:discover` — 공공 API에 현재 ACTIVE보다 최신인 공통월이 있는지 저비용으로
   확인한다(대표 지역 1곳·2개 소스만 확인, 전국 지역을 조회하지 않는다). 새 월을 찾으면 STAGING
   dataset만 생성한다 — **이 단계만으로는 ACTIVE가 바뀌지 않고, 사용자 분석은 계속 기존 ACTIVE를
   쓴다.** 이미 다른 baseYm이 STAGING이면 새 STAGING을 만들지 않는다(그 STAGING을 먼저 정리하거나
   승격해야 한다).
2. `npm run sync:tourism-data -- --dataset=staging --all-regions --max-regions=N`을 하루 API 호출
   한도에 맞는 `N`으로 여러 번 나눠 실행한다 — 이미 완료된 지역×소스는 자동으로 건너뛰고, 429가
   감지되면 그 시점까지 결과를 보존한 채 안전하게 멈춘다. 다음 실행에서 같은 명령을 그대로 다시
   실행하면 이어서 진행된다. **TOUR_INFO(POI)는 region의 최근 수집이 TTL(60일) 이내면 이 호출에서
   자동으로 빠진다(Phase 2-D)** — 전국 255개 지역이 모두 fresh하면 이 배치에서 TOUR_INFO API
   요청이 0건일 수 있다(quota는 통계 3종에만 실제로 쓰인다). 특정 지역 POI를 TTL과 무관하게 즉시
   갱신해야 하면 `--force-tour-info`를 추가한다(`--all-regions` 없이는 쓸 수 없음).
3. `npm run dataset:status`로 STAGING 진행률(완료 지역/255, ERROR 수, source별 SUCCESS/EMPTY/ERROR/
   미수집 현황)과 promotion readiness(`INCOMPLETE`/`READY_FOR_DRIFT_CHECK`)를 확인한다.
4. `READY_FOR_DRIFT_CHECK`가 뜨면, 승격 전에 **읽기 전용** `npm run dataset:drift -- --base-ym=YYYYMM`
   으로 DNA 5축 drift(median/p90/p95/rank correlation/decile churn)·strength/weakness 변화·
   유사지역 Top3 변화·대표 시나리오 전략 1위 변화와 최종 판정(PASS/REVIEW_REQUIRED/BLOCKED)을
   미리 확인한다 — 이 명령은 DB에 어떤 쓰기도 하지 않으므로 몇 번이든 안전하게 반복 실행할 수 있다.
5. `npm run dataset:activate -- --base-ym=YYYYMM`으로 승격을 시도한다 — 내부적으로 4번과 동일한
   completeness/audit/drift gate를 다시 확인해 **PASS일 때만** 실제로 ACTIVE를 바꾼다.
   - `BLOCKED`(completeness/audit 미통과, ERROR 존재, 비교 불가 등 명백한 문제)면 즉시 거부되고
     기존 ACTIVE가 그대로 유지된다.
   - `REVIEW_REQUIRED`(데이터는 정상이나 drift가 잠정 임계값을 넘음)면 마찬가지로 승격을 거부하고
     기존 ACTIVE를 유지한다 — 이 경우 `dataset:drift` 출력의 reasons를 보고 사람이 직접 원인(정상적인
     계절 변동인지, 실제 데이터 이상인지)을 판단해야 한다. `--force`/`--skip-drift` 같은 우회
     옵션은 없다.
   - 완전 자동(사람 개입 없는) 승격은 아직 없다 — PASS여도 반드시 사람이 이 명령을 직접 실행해야
     한다.

## 알려진 사고 사례

- **카카오맵 JS 키 불일치(2026-07-21 발견·수정)**: Vercel `NEXT_PUBLIC_KAKAO_MAP_KEY`에 실수로 다른
  키 값이 설정돼 있어(카카오 콘솔의 실제 "JavaScript 키"와 불일치) 배포 사이트에서 지도가 항상
  좌표/주소 fallback으로만 표시됐다. `MapOrFallback.tsx`의 fallback 문구가 "키가 설정되지 않아"로
  고정돼 있어 원인 진단이 어려웠던 것도 문제 — 이제 키 없음(NO_KEY)과 로드 실패(LOAD_FAILED, SDK
  도메인 미등록 등)를 구분해 표시하도록 수정했다. 카카오 개발자 콘솔의 "JavaScript 키" 값과
  `NEXT_PUBLIC_KAKAO_MAP_KEY`가 정확히 일치하는지 항상 재확인할 것(REST API 키 등 다른 키 종류와
  혼동하기 쉽다).
- **POI 라이브 동기화가 시/도 전체를 지역 하나에 뒤섞음(2026-07-21 발견·수정)**: KorService2의
  `areaCode`는 시/도 단위(강원=32, 충북=33 등)라 필터 없이 그대로 upsert하면 평창/강릉/삼척/청주 등
  전혀 다른 시/군/구가 양양군·제천시 Region에 뒤섞였다. 그 결과 코스가 "평창→강릉→영덕"처럼 1박2일에
  불가능한 동선으로 나오는 문제가 실제로 발생했다. `syncService.ts`에 주소(addr1) 기반 필터를 추가해
  Region.name(대전은 예외적으로 대표 자치구 "유성구")이 주소에 포함된 장소만 반영하도록 고쳤고, 기존에
  잘못 반영된 POI는 정리 스크립트로 삭제했다. 페이지네이션(최대 5페이지×1000건)도 추가해 필터링 후에도
  지역별 POI 수가 충분히 남도록 했다(대전 122/제천 147/양양 168건).
- **실행안이 전략 재선택에 반응하지 않음(2026-07-21 발견·수정)**: `/plan` 페이지가
  `project.selectedPlan ?? ensureSelectedPlan(id)` 형태로, 이미 실행안이 한 번이라도 생성된 적이
  있으면 `ensureSelectedPlan`을 아예 호출하지 않고 있었다. `ensureSelectedPlan` 내부에는 "선택된 전략이
  바뀌면 재생성" 로직이 이미 있었지만 호출 자체가 안 되니 무용지물이었다 — 전략을 재선택해도 상품명·
  콘셉트·코스가 항상 그대로였던 근본 원인. `await ensureSelectedPlan(id)`을 무조건 호출하도록 한 줄
  수정으로 해결했다.
- **전략마다 같은 POI를 고르는 문제(2026-07-21 발견·수정)**: 여러 템플릿이 같은 카테고리를 공유하면
  이름순 정렬 목록에서 항상 앞 2개만 뽑아 전략이 달라도 코스가 겹치는 문제가 있었다. 템플릿 id 기반
  결정론적 offset을 도입해 해결(scoring-model.md 참고).
- **DNA 5축 점수가 자주 0/100으로 나옴 → 지역 확장으로 완화(2026-07-21)**: SIGUNGU 코호트가 3개뿐이라
  min-max 정규화 시 최댓값/최솟값 지역이 항상 정확히 100/0이 되는 문제가 있었다. 강릉시(51150)·
  경주시(47130)·제주시(50110)·통영시(48220) 4개 지역을 실 서비스키로 코드 확인 후 추가해 코호트를
  7개로 늘렸다. 각 지역의 stay/spend/diversity/service-demand 실 데이터를 확인해 fixture 스냅샷에
  반영했고, POI도 라이브 동기화로 확보(경주 354/강릉 791/제주 631/통영 191건). 데모 프로젝트를 재생성한
  결과 대전의 축 점수가 86/0/100/100/67 → 33/34/100/56/100으로, 극단값(0 또는 100) 개수가 3개→2개로
  줄었다(spend/network는 실제로 최댓값/구조적 포화라 100이 정당함). 지역을 더 늘리면 더 완화된다.
  **2026-08-07 후속**: 20개 지역을 추가해 코호트를 7개→27개로 더 늘렸다. 기존 지역 점수도 재분석 시
  함께 바뀔 수 있다(예: 제천 체류 축 0→34점, 강릉 다양성 72→54점) — 이미 저장된 `AnalysisResult`는
  자동 재계산되지 않으며, 새로 분석을 실행해야 새 코호트 기준 점수가 반영된다. 유사지역 비교 후보도
  6곳→26곳으로 늘어 소규모 모집단 경고(`isSmallCandidatePool`, 임계값 10)가 더 이상 뜨지 않는다.
  **2026-08-11 후속**: 로컬 배치 동기화(`runResumableLocalBatchSync`)로 전국 SIGUNGU 255개까지
  코호트를 늘렸다. 지역 수가 커지면서 Demand(`tarSvcDemIxVal`/`touResDemIxVal`)·Spend
  (`tarExpDsIxVal`) 두 축에서 소수 극단값이 나머지 지역 점수를 크게 흔드는 문제가 실제로 확인돼,
  코호트를 더 쪼개는 대신 이 두 축에 `log1p(raw)→min-max` 정규화를 추가했다(코호트는 그대로 SIGUNGU
  255개 전체 유지, Stay/Diversity는 기존 선형 min-max 그대로 — `docs/scoring-model.md` 참고).

- **TourAPI-통계청 코드 체계 불일치 및 다양성 API 일일 호출 한도(2026-08-07 발견)**: 지역 확장
  Batch 3 후보 검증 중 TourAPI `ldongCode2`가 반환한 전남·광주 통합 시/도 코드(`12`)가 통계청 API
  (`AreaTarDivService` 등)에서는 항상 빈 응답을 반환하는 것을 발견했다 — 실제 통계청 코드는 전남 46,
  광주 29로 별도 분리돼 있다. 두 코드 체계가 항상 같은 시/도 번호를 쓴다는 기존 문서 전제(위 "지역 코드
  체계 확정" 절)에 대한 예외 사례이며, 해당 권역 후보는 코드 추정 없이 전부 제외했다. 이어서
  `AreaTarDivService`(관광 다양성) 오퍼레이션의 일일 호출 한도가 소진되어(429, 정확한 한도·초기화
  시점 미확인) Batch 3(추가 10곳) 등록을 보류했다 — 후보 코드는 TourAPI로 확인해 뒀으나 통계청 API
  교차검증은 완료하지 못한 상태다. 다음 확장 작업 전에 이 API의 최근 호출량을 확인하고, 한도가
  회복됐는지 불확실하면 무제한 재시도하지 말 것.

- **CLI 인자 오류로 정크 baseYm Snapshot 108건 발생·정리(2026-08-07 발생, 2026-08-07 해결)**: Batch 2
  검증 중 `npm run sync:tourism-data -- --base-ym=202606`처럼 플래그 형식으로 호출했는데, 당시 CLI가
  `process.argv[2]`를 그대로 baseYm 문자열로 썼기 때문에 실제로는 `"--base-ym=202606"`이라는 잘못된
  문자열이 그대로 baseYm 값이 되어 API가 호출되고 `DataSnapshot`에 27개 지역 × 4개 소스(TAR_SVC_DEM/
  TOU_DIV_IX/TOU_RES_DEM/TOUR_INFO) = 108건이 쌓였다. 정상 `"202606"` 스냅샷은 별도 unique key라
  덮어써지지 않고 그대로 보존됐다(사고 발견 당시 이미 확인됨). 2026-08-07에 (1) CLI가 `--base-ym=
  YYYYMM`/`--base-ym YYYYMM` 형식만 엄격히 검증해 받아들이고 그 외(위치 인자, 알 수 없는 옵션, 하이픈
  포함, 중첩된 플래그 문자열 등)는 API 호출 전에 즉시 거부하도록 재작성했고(`syncCliArgs.ts`), (2) 정확히
  `baseYm = "--base-ym=202606"`인 108건만(`NormalizedMetric`/`Evidence` 참조 0건, 정상 `202606` 스냅샷
  별도 존재를 재확인한 뒤) ID 정확 일치 조건으로 삭제해 정리했다. 정상 스냅샷·`AnalysisResult`·POI·
  지원지역 수는 전혀 건드리지 않았다(삭제 전후 개수 동일 확인).

- **무인 브라우저 자동화 도구의 "배경 탭" 오탐(2026-08-01 발견)**: Production 브라우저 검증 중
  "홍보자료 생성" 버튼이 클릭해도 서버 요청이 전혀 발생하지 않고 카카오맵도 로드되지 않는 것처럼
  보여 처음에는 앱 결함으로 잘못 판단했다. 재조사 결과 원인은 검증에 쓴 자동화 도구의 탭이
  `document.hidden === true`(배경/비활성) 상태였던 것 — 이 상태에서는 React가 페이지를 hydration하지
  못해 `onClick`/`useEffect` 기반 기능이 전혀 실행되지 않는다(Server Action을 쓰는 `<form>` 기반
  기능은 네이티브 폼 제출로 우회 동작해 정상처럼 보이는 것과 대조적이었다). 독립된 Playwright(실제
  헤드리스 Chromium, `document.hidden === false`)로 같은 URL을 열자 정상 동작했다. **교훈**: 자동화
  도구로 이 앱(또는 다른 App Router 앱)의 클라이언트 상호작용을 검증할 때는 먼저
  `document.evaluate(() => document.hidden)`으로 탭 가시성을 확인할 것 — `true`이면 "무반응"이 실제
  버그인지 도구 한계인지부터 구분해야 한다.
- **사이트 전체 접근 게이트 도입(2026-07-21)**: 그동안 계정/로그인이 전혀 없어 배포 URL을 아는 누구나
  모든 프로젝트를 조회·수정할 수 있었다. 계정 시스템(User 모델, 프로젝트별 소유권 분리)은 개발 범위가
  넓어 보류하고, 대신 공유 비밀번호 하나로 사이트 전체를 잠그는 최소 구현을 도입했다
  (`src/proxy.ts` + `src/app/login/`, `SITE_ACCESS_PASSWORD` 환경변수). 프로젝트 목록 페이지를 굳이
  따로 공개할 필요는 없다고 판단해 예외 없이 전체를 게이트로 덮었다 — "프로젝트 생성자 + URL을 공유받은
  사람만 볼 수 있다"는 요구사항은 이 방식으로 충분히 만족된다. `/api/cron`, `/api/admin`은 자체
  `CRON_SECRET` 인증을 그대로 쓰므로 게이트에서 제외했다. 로컬 개발/E2E는 `SITE_ACCESS_PASSWORD`를
  비워둬서 게이트가 꺼진 상태로 동작한다.

## 로컬 전용 개발 정책 & Vercel 배포 이력(2026-08-13)

새 Neon 프로젝트로 DB 이관은 정상 완료됐지만(migration 13/13, ACTIVE=202606, 전국 audit PASS), 2026-08-13
초 한동안은 Production Neon/Vercel을 건드리지 않고 로컬에서만 개발을 이어가려고 Vercel Git 자동 배포를
잠시 중단했었다. **같은 날 Vercel 사용량 여유를 확인한 뒤 자동 배포를 다시 활성화했다** — 개발 DB
정책(local-only)은 자동 배포 여부와 무관하게 계속 유지된다. 상세 배경과 cutover 절차 전체는
`docs/deployment.md`의 "로컬 전용 개발 정책 & Vercel 배포 이력" 절 참고.

- [x] `vercel git connect`로 Vercel Git 연동 재활성화(2026-08-13) — provider GitHub, repository
      `herb39/TOUR-DNA`, Production branch `main` 확인(project API의 `link` 필드로 확인, 값은
      비민감 메타데이터만 조회함). `main` push → Production 자동 배포가 실제로 동작함을 push 후
      빌드 완료·`tour-dna.lib.lc` alias 갱신까지 확인했다. 기존 project/custom domain/Production
      환경변수는 재연결 과정에서 변경되지 않았다.
- [x] `.env.local`의 미사용 `DIRECT_URL`(옛 Neon 값) 제거 — `DATABASE_URL`은 localhost 그대로 유지.
- [ ] **(cutover 시점에 수행)** 위 "최종 제출 전 cutover 절차" 1~7번 순서대로 진행 — 로컬 최종 검증 →
      `pg_dump` → 새 Neon restore/import 재검증 → Vercel Production `DATABASE_URL` 교체 → (Git 자동
      배포는 이미 켜져 있으므로) env 교체 후 다음 push 또는 대시보드 Redeploy → 브라우저 smoke test.
- [ ] Git 자동 배포 활성화 여부와 무관하게, 개발용 작업(sync/seed/migration/dataset activate/개발용
      reanalysis)은 Production Neon에서 절대 수행하지 않는다 — `DATABASE_URL`이 localhost가 아니면
      개발 중 DB write를 하지 않는 것이 공통 원칙이다. cutover 절차(사용자가 명시적으로 요청하는
      별도 작업)에서만 예외적으로 Production DB를 다룬다.
- [x] **Vercel Function ↔ Neon DB region 정렬(2026-08-13)** — Neon region이 Singapore인데 Vercel
      Function region이 North America라 운영 최초 Document가 4~6초까지 느려졌던 문제를 Function
      region을 Singapore로 맞춰 해결했다. **DB provider 변경/DB migration/Vercel project 재생성/
      Function region 변경을 할 때는 항상 Function region과 DB region이 일치하는지 먼저 확인한다**
      (`docs/deployment.md` "Vercel Function ↔ Neon DB region 정렬" 절 참고). 한국 사용자 대상 현재
      권장 구성: Vercel Function = Singapore, Neon = Singapore.

## 사고 대응

- [ ] 공공데이터 API가 전면 장애이거나 다양성 지표가 의도치 않게 바뀌었을 때: `DATA_MODE=snapshot`으로
      임시 전환해 라이브 호출을 완전히 끄고 마지막 성공 스냅샷으로 서비스 지속 가능(환경변수만 변경 후
      재배포, 코드 변경 불필요)
- [ ] 잘못된 동기화로 데이터가 이상해졌을 때: `npm run db:seed`를 재실행하면 fixture 값으로 복원된다
      (NormalizedMetric은 upsert 방식이라 seed의 고정값으로 되돌아간다)

## 후속 필수 고도화 과제(미해결)

- [ ] **AI 홍보 콘텐츠 생성 안정화(2026-08-13 기록)** — 현재 deterministic rule fallback은 안정적으로
      동작하지만, OpenRouter 무료 provider의 응답 지연으로 실제 AI 생성 성공률이 충분하지 않다. 향후
      실제 서비스 단계에서는 소액 유료 모델을 포함한 안정적 provider/model 조합, timeout, 비용 상한,
      fallback 정책을 별도 고도화해야 한다.
- [ ] **역할별 화면 노출 후속 개선(2026-08-13 기록)** — 이번에 `/analysis`·`/plan` 상단 요약 문구와
      전략 비교표 배지로 역할 차이를 눈에 보이게 강화했지만, 홍보자료 미리보기(`PromoPreviewPanel`)의
      역할별 콘텐츠(roleContent)는 여전히 탭 하나 안에 묻혀 있고, 실행안 체크리스트/KPI/위험 목록에는
      역할 유래 항목을 구분하는 시각적 태그가 없다(평문 목록에 섞여 있음). 계산 로직 자체는 이미
      역할별로 정확히 다르므로 시급하지 않지만, 화면 개선 우선순위에 남겨둔다.
