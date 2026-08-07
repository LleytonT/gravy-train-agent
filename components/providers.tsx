"use client";

import { ClerkProvider } from "@clerk/nextjs";

import { TooltipProvider } from "@/components/ui/tooltip";

const clerkPublishableKey =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() || "";

export function Providers({ children }: { children: React.ReactNode }) {
  const tree = (
    <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
  );

  // Clerk remains optional secondary auth. Without keys, Telegram Login alone
  // is enough for the product path.
  if (!clerkPublishableKey) {
    return tree;
  }

  return <ClerkProvider publishableKey={clerkPublishableKey}>{tree}</ClerkProvider>;
}
