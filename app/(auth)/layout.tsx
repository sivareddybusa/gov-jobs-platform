export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 via-white to-white p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="text-sm font-semibold tracking-tight text-gray-900">
            Government Jobs Eligibility Platform
          </span>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-7 shadow-[var(--shadow-card)]">
          {children}
        </div>
      </div>
    </main>
  );
}
