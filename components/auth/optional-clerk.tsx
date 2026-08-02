"use client";

import { Show, SignInButton, UserButton } from "@clerk/nextjs";

const clerkEnabled = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim(),
);

export function ClerkEnabled({ children }: { children: React.ReactNode }) {
  if (!clerkEnabled) return null;
  return children;
}

export function OptionalSignInButton({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!clerkEnabled) return null;
  return (
    <Show when="signed-out">
      <SignInButton mode="modal">{children}</SignInButton>
    </Show>
  );
}

export function OptionalSignedIn({ children }: { children: React.ReactNode }) {
  if (!clerkEnabled) return null;
  return <Show when="signed-in">{children}</Show>;
}

export function OptionalUserButton() {
  if (!clerkEnabled) return null;
  return (
    <Show when="signed-in">
      <div className="ml-2 flex items-center">
        <UserButton />
      </div>
    </Show>
  );
}
