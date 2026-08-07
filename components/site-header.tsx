"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  OptionalSignInButton,
  OptionalUserButton,
} from "@/components/auth/optional-clerk";
import {
  fetchSessionStatus,
  signOutMemberSession,
} from "@/components/auth/member-session";
import { Button } from "@/components/ui/button";

type SiteHeaderProps = {
  active?: "home" | "start" | "chat" | "workflow" | "profile";
};

export function SiteHeader({ active = "home" }: SiteHeaderProps) {
  const [memberAuthed, setMemberAuthed] = useState(false);

  useEffect(() => {
    void fetchSessionStatus()
      .then((session) => setMemberAuthed(Boolean(session.authenticated)))
      .catch(() => setMemberAuthed(false));
  }, []);

  return (
    <header className="border-b border-border bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Link
          href="/"
          className="font-display text-lg font-semibold tracking-tight text-foreground"
        >
          Gravy Scout
        </Link>
        <nav className="flex items-center gap-1" aria-label="Primary">
          <Button
            asChild
            variant={active === "home" ? "secondary" : "ghost"}
            size="sm"
          >
            <Link href="/">Product</Link>
          </Button>
          <Button
            asChild
            variant={active === "start" ? "secondary" : "ghost"}
            size="sm"
          >
            <Link href="/get-started">Get started</Link>
          </Button>
          <Button
            asChild
            variant={active === "workflow" ? "secondary" : "ghost"}
            size="sm"
          >
            <Link href="/how-it-works">How it works</Link>
          </Button>
          {memberAuthed ? (
            <Button asChild variant="secondary" size="sm">
              <Link href="/app">Workspace</Link>
            </Button>
          ) : null}
          {memberAuthed ? (
            <Button
              size="sm"
              variant="outline"
              className="ml-1"
              onClick={() => {
                void signOutMemberSession().then(() => {
                  window.location.href = "/";
                });
              }}
            >
              Sign out
            </Button>
          ) : (
            <OptionalSignInButton>
              <Button size="sm" variant="ghost" className="ml-1">
                Email sign-in
              </Button>
            </OptionalSignInButton>
          )}
          <OptionalUserButton />
        </nav>
      </div>
    </header>
  );
}
