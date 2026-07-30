import Link from "next/link";

type SiteHeaderProps = {
  active?: "chat" | "workflow";
};

export function SiteHeader({ active = "chat" }: SiteHeaderProps) {
  return (
    <header className="border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" className="font-display text-lg font-semibold tracking-tight text-ink">
          Gravy Scout
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/"
            className={[
              "rounded-lg px-3 py-1.5 transition",
              active === "chat"
                ? "bg-mist font-semibold text-ink"
                : "text-ink-muted hover:bg-mist hover:text-ink",
            ].join(" ")}
          >
            Chat
          </Link>
          <Link
            href="/how-it-works"
            className={[
              "rounded-lg px-3 py-1.5 transition",
              active === "workflow"
                ? "bg-mist font-semibold text-ink"
                : "text-ink-muted hover:bg-mist hover:text-ink",
            ].join(" ")}
          >
            How it works
          </Link>
        </nav>
      </div>
    </header>
  );
}
