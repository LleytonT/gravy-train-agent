"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  fetchSessionStatus,
  signOutMemberSession,
} from "@/components/auth/member-session";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/app", label: "Today", match: (path: string) => path === "/app" },
  {
    href: "/app/opportunities",
    label: "Opportunities",
    match: (path: string) => path.startsWith("/app/opportunities"),
  },
  {
    href: "/app/conversation",
    label: "Conversation",
    match: (path: string) => path.startsWith("/app/conversation"),
  },
  {
    href: "/app/profile",
    label: "Profile",
    match: (path: string) => path.startsWith("/app/profile"),
  },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    void fetchSessionStatus().then((session) => {
      setDisplayName(session.displayName ?? null);
    });
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
          <Link
            href="/app"
            className="font-display text-lg font-semibold tracking-tight"
          >
            Gravy Scout
          </Link>
          <nav
            className="flex items-center gap-1 overflow-x-auto"
            aria-label="Workspace"
          >
            {nav.map((item) => {
              const active = item.match(pathname);
              return (
                <Button
                  key={item.href}
                  asChild
                  size="sm"
                  variant={active ? "secondary" : "ghost"}
                  className={cn(active && "font-medium")}
                >
                  <Link href={item.href} aria-current={active ? "page" : undefined}>
                    {item.label}
                  </Link>
                </Button>
              );
            })}
          </nav>
          <div className="hidden items-center gap-2 sm:flex">
            {displayName ? (
              <span className="max-w-36 truncate text-xs text-muted-foreground">
                {displayName}
              </span>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void signOutMemberSession().then(() => {
                  window.location.href = "/";
                });
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 md:px-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
