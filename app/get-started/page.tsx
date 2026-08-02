import { Suspense } from "react";

import { ProgressiveOnboarding } from "@/components/onboarding/progressive-onboarding";
import { SiteHeader } from "@/components/site-header";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Get started · Gravy Scout",
  description:
    "Progressive onboarding for Gravy Scout — career snapshot first, Telegram verification when you are ready.",
};

export default function GetStartedPage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader active="start" />
      <main className="px-4 py-10 md:px-6 md:py-16">
        <Suspense
          fallback={
            <div className="mx-auto max-w-2xl space-y-4">
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          }
        >
          <ProgressiveOnboarding />
        </Suspense>
      </main>
    </div>
  );
}
