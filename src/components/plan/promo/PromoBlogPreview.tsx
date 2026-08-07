import type { BlogContent } from "@/lib/domain/promoContent";

/** 블로그 초안처럼 제목·본문을 기사 형태로 보여준다(2026-08-08) — 새 문구를 만들지 않고 저장된
 * title/body를 그대로 배치만 바꾼다. */
export function PromoBlogPreview({ blog }: { blog: BlogContent }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-bold leading-snug text-slate-900">{blog.title}</h3>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{blog.body}</p>
    </article>
  );
}
