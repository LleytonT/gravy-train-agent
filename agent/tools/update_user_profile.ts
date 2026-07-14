import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  readUserProfile,
  updateUserProfile,
} from "../lib/profile.js";

export default defineTool({
  description:
    "Read or update the user's persistent preference/memory file. Call this whenever they express a preference or correction.",
  inputSchema: z.object({
    action: z.enum(["read", "append", "replace_section", "set_content"]),
    text: z.string().optional(),
    sectionHeading: z.string().optional(),
  }),
  async execute({ action, text, sectionHeading }) {
    if (action === "read") {
      return { content: readUserProfile() };
    }

    if (action === "append") {
      if (!text) {
        return { error: "text required for append" };
      }
      const content = updateUserProfile({ append: text.endsWith("\n") ? text : `${text}\n` });
      return { saved: true, content };
    }

    if (action === "replace_section") {
      if (!text || !sectionHeading) {
        return { error: "sectionHeading and text required for replace_section" };
      }
      const content = updateUserProfile({
        replaceSection: { heading: sectionHeading, content: text },
      });
      return { saved: true, content };
    }

    if (action === "set_content") {
      if (!text) {
        return { error: "text required for set_content" };
      }
      const content = updateUserProfile({ setContent: text });
      return { saved: true, content };
    }

    return { error: "unknown action" };
  },
});
