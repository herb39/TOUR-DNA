import { LoginForm } from "./LoginForm";

function safeNextPath(next: string | string[] | undefined): string {
  const value = Array.isArray(next) ? next[0] : next;
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-sm flex-1 flex-col justify-center px-6 py-10">
      <div className="rounded-lg border border-slate-200 bg-white p-8">
        <h1 className="text-lg font-bold text-slate-900">TOUR DNA</h1>
        <p className="mt-1 text-sm text-slate-600">비밀번호를 입력해야 프로젝트를 볼 수 있습니다.</p>
        <LoginForm next={safeNextPath(next)} />
      </div>
    </div>
  );
}
