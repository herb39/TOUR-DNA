"use client";

import { useActionState } from "react";
import { verifyProjectAccessAction, type ProjectAccessFormState } from "@/app/projects/[id]/access-actions";

const initialState: ProjectAccessFormState = {};

/** 보호된 프로젝트에 접근하면 프로젝트 내용을 먼저 렌더링했다가 숨기는 대신, 이 화면만 렌더링한다
 * (레이아웃이 데이터 조회 자체를 실행하지 않으므로 노출 위험이 없다). */
export function ProjectLockScreen({ projectId }: { projectId: string }) {
  const action = verifyProjectAccessAction.bind(null, projectId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-sm flex-1 flex-col justify-center px-6 py-10">
      <div className="rounded-lg border border-slate-200 bg-white p-8">
        <h1 className="text-lg font-bold text-slate-900">비밀번호로 보호된 프로젝트</h1>
        <p className="mt-1 text-sm text-slate-600">이 프로젝트를 열람하려면 비밀번호를 입력해주세요.</p>
        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="project-access-password" className="block text-sm font-medium text-slate-700">
              비밀번호
            </label>
            <input
              id="project-access-password"
              name="password"
              type="password"
              required
              autoFocus
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          {state.error ? (
            <p role="alert" className="text-xs text-red-600">
              {state.error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={isPending}
            className="w-full cursor-pointer rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "확인 중..." : "입장"}
          </button>
        </form>
      </div>
    </div>
  );
}
