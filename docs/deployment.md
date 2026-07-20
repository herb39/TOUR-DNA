# 배포 가이드 (Vercel + Neon)

목표 구성: 웹은 Vercel, DB는 Neon PostgreSQL, 지도 SDK는 카카오맵, 운영 도메인은 `tourdna.lib.lc`.

이 문서는 Claude Code가 준비한 코드/설정을 기준으로, **실제 계정 접근이 필요한 단계는 사용자가 직접
수행**하도록 안내한다. Claude Code는 대신 수행하지 않았다.

## 1. Neon 프로젝트 준비 (사용자 수행)

1. https://neon.tech 에서 프로젝트 생성
2. 콘솔에서 두 개의 연결 문자열을 복사한다
   - 풀링(pooled) 연결 → `DATABASE_URL`
   - non-pooled(direct) 연결(호스트에서 `-pooler` 제거) → `DIRECT_URL`
3. 로컬 `.env.local`과 Vercel 환경변수 양쪽에 동일하게 설정

## 2. 마이그레이션 적용

```bash
npm run db:migrate   # prisma migrate deploy — shadow DB 불필요, 커밋된 migration만 적용
npm run db:seed       # 최초 1회. 이후 재실행해도 idempotent
```

⚠️ `npm run build` 등 production 빌드 파이프라인에서 **seed를 자동 실행하지 않는다**(스펙 요구사항).
seed는 항상 별도 명령으로 수동/CI 스텝에서 실행한다.

## 3. 한국관광공사 공공데이터 서비스키 (사용자 수행)

1. data.go.kr에서 아래 6개 데이터셋에 활용신청
   - 지역별 관광 수요 강도(15151868), 지역별 관광 다양성(15151365), 지역별 관광 자원 수요(15152138),
     지역별 방문자수(15101972), 국문 관광정보 서비스(15101578), 기초지자체 중심 관광지 및 연관 관광지(미확인)
2. 발급된 `TOUR_API_SERVICE_KEY`를 환경변수에 설정
3. **중요**: 실 키 발급 후 Swagger UI로 각 API의 실제 파라미터명/응답 스키마를 확인하고
   `src/lib/public-data/adapters/*.ts`의 필드명·엔드포인트를 재검증한다(docs/public-api-status.md).
   `TOUR_API_SERVICE_KEY`가 비어 있으면 앱은 자동으로 스냅샷 모드로 동작하므로, 키 없이도 배포/시연은
   가능하다.

## 4. 카카오맵 (사용자 수행)

1. https://developers.kakao.com 에서 애플리케이션 생성
2. "플랫폼 > Web"에 배포 도메인(`https://tourdna.lib.lc`, 로컬 테스트용 `http://localhost:3000`) 등록
3. JavaScript 키를 `NEXT_PUBLIC_KAKAO_MAP_KEY`에 설정 (없으면 좌표/주소 목록 fallback으로 자동 전환)

## 5. Vercel 배포 (사용자 수행 + Claude Code 준비 완료)

1. Vercel에서 이 저장소를 Import
2. 환경변수 등록: `DATABASE_URL`, `DIRECT_URL`, `TOUR_API_SERVICE_KEY`, `TOUR_DATA_BASE_YM`,
   `NEXT_PUBLIC_KAKAO_MAP_KEY`, `NEXT_PUBLIC_APP_URL`(운영 URL로), `DATA_MODE`, `CRON_SECRET`
3. Build Command는 기본값(`next build`, `npm run build`) 그대로 사용 — seed를 build 훅에 넣지 않는다
4. 배포 후 `DNS` 탭에서 안내하는 값으로 `tourdna.lib.lc`의 CNAME을 등록(사용자의 DNS 관리 콘솔에서)

## 6. Vercel Cron

저장소 루트의 `vercel.json`에 매월 1일 UTC 00:00(KST 09:00)에 동기화하도록 이미 등록해두었다:

```json
{
  "crons": [
    { "path": "/api/cron/sync-tourism-data", "schedule": "0 0 1 * *" }
  ]
}
```

Vercel Cron은 프로젝트에 `CRON_SECRET` 환경변수가 설정되어 있으면 요청에
`Authorization: Bearer $CRON_SECRET` 헤더를 **자동으로** 붙여서 호출한다(별도 외부 스케줄러 불필요).
단, Vercel 무료(Hobby) 플랜은 Cron Job 실행 시각이 정확히 맞지 않고 다소 지연될 수 있다.
스케줄을 바꾸려면 `vercel.json`의 `schedule` 값(표준 5필드 cron 문법, UTC 기준)을 수정 후 재배포한다.

## 7. 배포 후 확인

- `/` 접속 → 데모 프로젝트가 보이는지 확인
- `curl -I https://<도메인>/api/cron/sync-tourism-data` → 인증 없이 401인지 확인
- `npm run build`가 로컬에서 통과했는지, Vercel 빌드 로그에 오류가 없는지 확인
