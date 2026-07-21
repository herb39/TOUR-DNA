# 운영자 체크리스트

## 최초 배포 전

- [x] Neon 프로젝트 생성, `DATABASE_URL`/`DIRECT_URL` 발급 및 등록
- [x] `npm run db:migrate` 실행 확인
- [x] `npm run db:seed` 실행 확인 (대전/제천/양양/강릉/경주/제주/통영 7개 지역 fixture + 데모 프로젝트 생성)
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

## 새 지역 추가 절차 (2026-07-21부터)

- [ ] `npm run verify:region -- --name <지역명> --area-cd <시도2자리> --signgu-cd <시군구5자리> --tour-api-area-code <구코드>`로
      후보 코드를 실 API로 확인(통계청 코드는 `areaNm`/`signguNm` 응답 원본, TourAPI 코드는 `areaCode2`
      전체 목록 대조). 코드를 추측해서 바로 fixture에 넣지 말 것 — 과거 여러 번 다른 지역 코드로 잘못
      확인된 적이 있다.
- [ ] 확인된 코드를 `src/lib/fixtures/regions.ts`의 `REGION_SEED`에 추가(SIDO가 새로 필요하면 SIDO 행도
      함께 추가)
- [ ] `npm run db:seed` 실행(Region은 upsert라 기존 데이터에 안전) → 실 동기화(`npm run sync:tourism-data`)로
      해당 지역 지표/POI 확보 확인
- [ ] `docs/data-dictionary.md`의 지역 표, `docs/public-api-status.md`의 코드 체계 표 갱신

## 정기 운영

- [ ] Cron이 매월 1일 정상 실행되는지 `SyncLog`로 확인 — 다양성/체류/소비/자원수요/POI 전부 이제 실제로
      저장되므로 매월 데모 점수가 최신 실 데이터로 자연스럽게 갱신된다(더 이상 SKIPPED 처리 없음)
- [ ] 부분 실패(`PARTIAL`) 발생 시 어떤 API가 실패했는지 `SyncLog.results`에서 확인,
      해당 API만 재시도(기존 성공 데이터는 유지되므로 서비스는 계속 정상 동작)
- [ ] `TOUR_DATA_BASE_YM`을 새 기준월로 교체할 때는 새 기준월 데이터가 실제로 존재하는지
      먼저 CLI로 확인 후 배포 환경변수를 갱신 — 매달 자동으로 최신화되지 않으니 수동 유지보수 필요

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

- **사이트 전체 접근 게이트 도입(2026-07-21)**: 그동안 계정/로그인이 전혀 없어 배포 URL을 아는 누구나
  모든 프로젝트를 조회·수정할 수 있었다. 계정 시스템(User 모델, 프로젝트별 소유권 분리)은 개발 범위가
  넓어 보류하고, 대신 공유 비밀번호 하나로 사이트 전체를 잠그는 최소 구현을 도입했다
  (`src/proxy.ts` + `src/app/login/`, `SITE_ACCESS_PASSWORD` 환경변수). 프로젝트 목록 페이지를 굳이
  따로 공개할 필요는 없다고 판단해 예외 없이 전체를 게이트로 덮었다 — "프로젝트 생성자 + URL을 공유받은
  사람만 볼 수 있다"는 요구사항은 이 방식으로 충분히 만족된다. `/api/cron`, `/api/admin`은 자체
  `CRON_SECRET` 인증을 그대로 쓰므로 게이트에서 제외했다. 로컬 개발/E2E는 `SITE_ACCESS_PASSWORD`를
  비워둬서 게이트가 꺼진 상태로 동작한다.

## 사고 대응

- [ ] 공공데이터 API가 전면 장애이거나 다양성 지표가 의도치 않게 바뀌었을 때: `DATA_MODE=snapshot`으로
      임시 전환해 라이브 호출을 완전히 끄고 마지막 성공 스냅샷으로 서비스 지속 가능(환경변수만 변경 후
      재배포, 코드 변경 불필요)
- [ ] 잘못된 동기화로 데이터가 이상해졌을 때: `npm run db:seed`를 재실행하면 fixture 값으로 복원된다
      (NormalizedMetric은 upsert 방식이라 seed의 고정값으로 되돌아간다)
