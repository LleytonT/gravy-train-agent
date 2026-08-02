import { NextResponse } from "next/server";
import { z } from "zod";

import { previewOnboarding } from "@/agent/lib/onboarding";

const bodySchema = z.object({
  name: z.string().trim().optional(),
  currentTitle: z.string().trim().min(1),
  currentCompany: z.string().trim().min(1),
  location: z.string().trim().min(1),
  interests: z.array(z.string().trim().min(1)).max(8).optional(),
  seniority: z.string().trim().optional(),
});

/** Public: career snapshot → first recommendations without authentication. */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    json &&
    typeof json === "object" &&
    !Array.isArray(json) &&
    ("memberId" in json || "externalAuthId" in json)
  ) {
    return NextResponse.json(
      { error: "Client-supplied member identity is not allowed" },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "title, company, and location are required",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const result = await previewOnboarding(parsed.data);
    return NextResponse.json({
      ...result,
      persisted: false,
    });
  } catch (err) {
    console.error("[onboarding/preview]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to preview onboarding matches",
        detail: message,
      },
      { status: 500 },
    );
  }
}
