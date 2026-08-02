"use client";

import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

type SiteHeaderProps = {
  active?: "chat" | "workflow" | "profile";
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
          <Show when="signed-in">
            <Button
              asChild
              variant={active === "profile" ? "secondary" : "ghost"}
              size="sm"
            >
              <Link href="/profile">Profile</Link>
            </Button>
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button size="sm" variant="default" className="ml-1">
                Sign in
              </Button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <div className="ml-2 flex items-center">
              <UserButton />
            </div>
          </Show>
        </nav>
      </div>
    </header>
  );
}
