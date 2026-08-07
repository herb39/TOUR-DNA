"use client";

import { useRouter } from "next/navigation";
import { ALLOWED_PAGE_SIZES, type PageSize } from "@/lib/pagination";

export function ProjectPageSizeSelect({ pageSize }: { pageSize: PageSize }) {
  const router = useRouter();

  return (
    <select
      aria-label="페이지당 프로젝트 수"
      value={pageSize}
      onChange={(e) => router.push(`/?page=1&pageSize=${e.target.value}`)}
      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
    >
      {ALLOWED_PAGE_SIZES.map((size) => (
        <option key={size} value={size}>
          {size}
        </option>
      ))}
    </select>
  );
}
