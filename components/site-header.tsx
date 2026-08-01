import Link from "next/link";

import { Button } from "@/components/ui/button";

type SiteHeaderProps = {
  active?: "chat" | "workflow";
};

export function SiteHeader({ active = "chat" }: SiteHeaderProps) {
  return (
    <header className="border-b border-border bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Link
          href="/"
          className="font-display text-lg font-semibold tracking-tight text-foreground"
        >
          Gravy Scout
        </Link>
        <nav className="flex items-center gap-1">
          <Button
            asChild
            variant={active === "chat" ? "secondary" : "ghost"}
            size="sm"
          >
            <Link href="/">Chat</Link>
          </Button>
          <Button
            asChild
            variant={active === "workflow" ? "secondary" : "ghost"}
            size="sm"
          >
            <Link href="/how-it-works">How it works</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
