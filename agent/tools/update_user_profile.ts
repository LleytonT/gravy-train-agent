import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  applyExplicitProfileChanges,
  getMemberContextSnapshot,
  parsePreferenceAssignments,
  setExplicitPreference,
} from "../lib/career-profile.js";
import {
  fixtureUpdateUserProfile,
  isEvalFixture,
} from "../lib/eval-fixture/index.js";
import { requireMemberCaller } from "../lib/identity.js";

export default defineTool({
  description:
    "Read or update the member's structured career profile and preferences. Call whenever they express a preference, constraint, goal, or correction. Explicit preferences override inferred ones.",
  inputSchema: z.object({
    action: z.enum([
      "read",
      "append",
      "replace_section",
      "set_content",
      "set_preference",
      "patch_profile",
    ]),
    text: z.string().optional(),
    sectionHeading: z.string().optional(),
    preferenceKey: z.string().optional(),
    preferenceValue: z.union([z.string(), z.boolean(), z.array(z.string())]).optional(),
    currentTitle: z.string().optional(),
    currentCompany: z.string().optional(),
    location: z.string().optional(),
    summary: z.string().optional(),
    interests: z.array(z.string()).optional(),
  }),
  async execute(input, ctx) {
    if (isEvalFixture()) {
      return fixtureUpdateUserProfile(input, ctx);
    }

    const { memberId } = requireMemberCaller(ctx);

    if (input.action === "read") {
      const snapshot = await getMemberContextSnapshot(memberId);
      return {
        memberId,
        identity: snapshot.identity,
        preferences: snapshot.preferences,
        preferenceRows: snapshot.preferenceRows,
        document: snapshot.document,
        content: snapshot.modelContextMarkdown,
      };
    }

    if (input.action === "set_preference") {
      if (!input.preferenceKey || input.preferenceValue === undefined) {
        return { error: "preferenceKey and preferenceValue required" };
      }
      const snapshot = await setExplicitPreference(
        memberId,
        input.preferenceKey,
        input.preferenceValue,
        "update_user_profile",
      );
      return {
        saved: true,
        preferences: snapshot.preferences,
        content: snapshot.modelContextMarkdown,
      };
    }

    if (input.action === "patch_profile") {
      const snapshot = await applyExplicitProfileChanges(memberId, {
        currentTitle: input.currentTitle,
        currentCompany: input.currentCompany,
        location: input.location,
        summary: input.summary,
        interests: input.interests,
      });
      return {
        saved: true,
        identity: snapshot.identity,
        content: snapshot.modelContextMarkdown,
      };
    }

    if (input.action === "append" || input.action === "replace_section") {
      if (!input.text) {
        return { error: "text required" };
      }

      const heading = (input.sectionHeading ?? "").toLowerCase();
      if (heading.includes("preference") || input.action === "append") {
        const assignments = parsePreferenceAssignments(input.text);
        for (const assignment of assignments) {
          await setExplicitPreference(
            memberId,
            assignment.key,
            assignment.value,
            "update_user_profile",
          );
        }
      }

      if (heading.includes("note") || heading.includes("interest")) {
        const snapshot = await getMemberContextSnapshot(memberId);
        await applyExplicitProfileChanges(memberId, {
          notes:
            heading.includes("note")
              ? [snapshot.document.notes, input.text].filter(Boolean).join("\n")
              : snapshot.document.notes,
          interests: heading.includes("interest")
            ? [
                ...(snapshot.document.interests ?? []),
                ...input.text
                  .split(/[,\n]/)
                  .map((part) => part.replace(/^[-*]\s*/, "").trim())
                  .filter(Boolean),
              ]
            : snapshot.document.interests,
        });
      }

      const snapshot = await getMemberContextSnapshot(memberId);
      return { saved: true, content: snapshot.modelContextMarkdown };
    }

    if (input.action === "set_content") {
      // Treat free-form set_content as preference assignments + notes.
      if (!input.text) {
        return { error: "text required for set_content" };
      }
      for (const assignment of parsePreferenceAssignments(input.text)) {
        await setExplicitPreference(
          memberId,
          assignment.key,
          assignment.value,
          "update_user_profile",
        );
      }
      await applyExplicitProfileChanges(memberId, { notes: input.text });
      const snapshot = await getMemberContextSnapshot(memberId);
      return { saved: true, content: snapshot.modelContextMarkdown };
    }

    return { error: "unknown action" };
  },
});
