import Link from "next/link";

export function Logo({ tone = "dark", size = 28 }: { tone?: "dark" | "light"; size?: number }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2.5 ${tone === "light" ? "text-white" : "text-ink"}`} aria-label="JobPilot, accueil">
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
        <rect width="64" height="64" rx="16" fill="#1b2548" />
        <circle cx="32" cy="32" r="17" fill="none" stroke="#3a4570" strokeWidth="7" />
        <path d="M32 15a17 17 0 0 1 16.2 22.2" fill="none" stroke="#f5b800" strokeWidth="7" strokeLinecap="round" />
      </svg>
      <span className="display text-[1.35rem]">JobPilot</span>
    </Link>
  );
}
