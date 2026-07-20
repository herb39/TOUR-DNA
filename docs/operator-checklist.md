# 운영자 체크리스트

## 최초 배포 전

- [ ] Neon 프로젝트 생성, `DATABASE_URL`/`DIRECT_URL` 발급 및 등록
- [ ] `npm run db:migrate` 실행 확인
- [ ] `npm run db:seed` 실행 확인 (대전/제천/양양 fixture + 데모 프로젝트 생성)
- [ ] 카카오 개발자 콘솔 애플리케이션 등록 및 배포 도메인 허용 목록 등록
- [ ] `CRON_SECRET`을 임의의 강한 값으로 설정(빈 값이면 모든 sync 요청이 401 처리됨을 확인)
- [ ] `npm run build` 로컬 통과 확인
- [ ] `npm run test:e2e` 통과 확인(개발 서버 기동 상태에서)

## 공공데이터 API 실 키 발급 후 (필수 재검증)

- [x] `TOUR_API_SERVICE_KEY` 발급 완료(2026-07-21)
- [x] "지역별 관광 수요 강도" base URL 확인: `https://apis.data.go.kr/B551011/AreaTarDemDsService`
- [x] 체류(`/areaTarSjrnDsList`)·소비(`/areaTarExpDsList`) 오퍼레이션 확인 및 어댑터 반영
- [ ] 수요(Demand) 오퍼레이션명 확인 필요 — Swagger UI에서 전체 오퍼레이션 목록 확인
- [ ] 위 두 확인된 오퍼레이션이 **0건이 아닌 실제 데이터**를 반환하는 areaCd/baseYm 조합 확인
      (2026-07-21 기준 서울/대전 추정코드 × 8개 baseYm 전부 0건이었음 — docs/public-api-status.md 참고)
- [ ] 나머지 5개 API(다양성/자원수요/방문자수/국문관광정보/연관관광지)의 base URL·오퍼레이션명 확인
- [ ] areaCd 코드 체계 최종 확정(현재 통계청 행정표준코드 시도 2자리로 추정, 서울=11 정상 응답으로
      간접 확인) 후 `src/lib/fixtures/regions.ts`의 `apiAreaCode`/`apiSigunguCode`를 실값으로 채움
- [ ] `npm run sync:tourism-data`로 실 데이터 1회 동기화 후 `SyncLog` 테이블에서 결과 확인
- [ ] 동기화 후 `/` 화면의 "데이터 기준월/마지막 동기화" 표시와 분석 화면의 `LIVE n/5` 배지가
      기대대로 바뀌는지 확인
- [ ] `docs/public-api-status.md`의 "미확인 항목"을 확인된 내용으로 갱신

## 정기 운영

- [ ] Cron(또는 외부 스케줄러)이 매월 정상 실행되는지 `SyncLog`로 확인
- [ ] 부분 실패(`PARTIAL`) 발생 시 어떤 API가 실패했는지 `SyncLog.results`에서 확인,
      해당 API만 재시도(기존 성공 데이터는 유지되므로 서비스는 계속 정상 동작)
- [ ] `TOUR_DATA_BASE_YM`을 새 기준월로 교체할 때는 새 기준월 데이터가 실제로 존재하는지
      먼저 CLI로 확인 후 배포 환경변수를 갱신

## 사고 대응

- [ ] 공공데이터 API가 전면 장애일 때: `DATA_MODE=snapshot`으로 임시 전환해 마지막 성공 스냅샷으로
      서비스 지속 가능(코드 변경 불필요, 환경변수만 변경 후 재배포)
- [ ] 잘못된 동기화로 데이터가 이상해졌을 때: `NormalizedMetric`/`DataSnapshot`은 append/upsert 방식이라
      직접 삭제 없이는 이전 값이 남지 않으므로, 문제 발생 시 `SyncLog`로 원인을 먼저 특정한 뒤 필요한
      지표만 수동으로 재동기화한다
