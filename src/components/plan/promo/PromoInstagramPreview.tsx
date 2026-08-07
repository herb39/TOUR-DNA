import type { InstagramContent } from "@/lib/domain/promoContent";

/** Instagram 게시글 초안처럼 보이도록 캡션·해시태그를 카드 형태로 보여준다(2026-08-08) — 새 문구를
 * 만들지 않고 저장된 caption/hashtags를 그대로 배치만 바꾼다. */
export function PromoInstagramPreview({
  instagram,
  regionName,
}: {
  instagram: InstagramContent;
  regionName: string;
}) {
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 p-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 via-pink-500 to-purple-600 text-xs font-bold text-white">
          {regionName.slice(0, 1)}
        </span>
        <span className="text-sm font-semibold text-slate-900">{regionName} 여행</span>
      </div>

      <div className="flex aspect-square items-center justify-center bg-slate-100 text-xs text-slate-400">
        이미지 영역(별도 준비)
      </div>

      <div className="space-y-2 p-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{instagram.caption}</p>
        {instagram.hashtags.length > 0 ? (
          <p className="break-words text-sm text-sky-700">
            {instagram.hashtags.map((tag) => `#${tag}`).join(" ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
