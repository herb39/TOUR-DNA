/** 메인 프로젝트 목록 서버 페이지네이션(2026-08-08 도입)에서 쓰는 순수 파싱·검증 함수. DB/Next.js
 * 의존이 전혀 없어 단위테스트가 쉽다 — 악의적이거나 잘못된 query string이 Prisma `skip`/`take`에
 * 그대로 들어가지 않도록 이 함수를 항상 거쳐야 한다.
 */

export const ALLOWED_PAGE_SIZES = [10, 30, 50] as const;
export type PageSize = (typeof ALLOWED_PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 10;

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** pageSize query param을 검증한다 — 10/30/50 중 하나가 아니면(누락·문자열 아님·다른 숫자 포함)
 * 조용히 기본값(10)으로 대체한다. 에러를 던지지 않는다: 잘못된 링크를 클릭해도 화면이 깨지지 않고
 * 안전한 기본값으로 보여준다. */
export function parsePageSize(value: SearchParamValue): PageSize {
  const raw = firstValue(value);
  const n = Number(raw);
  return (ALLOWED_PAGE_SIZES as readonly number[]).includes(n) ? (n as PageSize) : DEFAULT_PAGE_SIZE;
}

/** page query param을 검증한다 — 숫자가 아니거나 1 미만이면 1로 대체한다. 전체 페이지 수를 넘는
 * 값은 이 함수만으로는 알 수 없으므로(전체 건수를 아직 조회하기 전) `clampPageToTotal`에서 별도로
 * 처리한다. */
export function parsePage(value: SearchParamValue): number {
  const raw = firstValue(value);
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 1;
  return n;
}

/** totalCount/pageSize로 총 페이지 수를 계산한다(0건이면 1페이지 취급 — 빈 상태 화면은 그대로 1페이지). */
export function computeTotalPages(totalCount: number, pageSize: PageSize): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}

/** 요청한 page가 실제 총 페이지 수보다 크면 마지막 유효 페이지로, 총 페이지가 계산되지 않을 정도로
 * 이상하면(음수 등, 방어적으로만) 1페이지로 안전하게 되돌린다. 무한 redirect를 만들지 않기 위해
 * "리다이렉트가 필요한지"와 "보정된 값"을 함께 반환한다 — 호출부가 리다이렉트 여부를 판단한다. */
export function clampPageToTotal(page: number, totalPages: number): { page: number; wasClamped: boolean } {
  if (page > totalPages) return { page: totalPages, wasClamped: true };
  return { page, wasClamped: false };
}

/** windowed pagination에 쓸 페이지 번호 목록을 만든다. 예: 18페이지 중 6페이지 근처 →
 * [1, "…", 4, 5, 6, "…", 18]. 전체 페이지가 적으면(예: 7개 이하) 생략 없이 전부 보여준다. */
export function buildPageWindow(currentPage: number, totalPages: number, siblingCount = 1): (number | "…")[] {
  const totalNumbersWithoutEllipsis = siblingCount * 2 + 5; // 처음, 끝, 현재, 좌우 ellipsis 대상 페이지 2개
  if (totalPages <= totalNumbersWithoutEllipsis) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(currentPage - siblingCount, 1);
  const rightSibling = Math.min(currentPage + siblingCount, totalPages);
  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < totalPages - 1;

  const pages: (number | "…")[] = [1];
  if (showLeftEllipsis) pages.push("…");
  for (let p = Math.max(leftSibling, 2); p <= Math.min(rightSibling, totalPages - 1); p++) {
    pages.push(p);
  }
  if (showRightEllipsis) pages.push("…");
  pages.push(totalPages);
  return pages;
}
