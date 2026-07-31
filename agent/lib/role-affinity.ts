/**
 * Role-family affinity for personalizing Gravy Train recommendations.
 * Maps a user's current title onto adjacent target titles at gravy-train companies.
 */

export type RoleFamilyId =
  | "sales_engineer"
  | "account_executive"
  | "customer_success"
  | "solutions_architect"
  | "partnerships"
  | "gtm_leadership"
  | "unknown";

export type RoleFamily = {
  id: RoleFamilyId;
  label: string;
  /** Titles that belong in this family (user's current role). */
  aliases: string[];
  /** Titles to recommend at peer companies. */
  targetTitles: string[];
  /** Signal types that indicate this role family is warming up. */
  leadingSignalTypes: string[];
};

export const ROLE_FAMILIES: RoleFamily[] = [
  {
    id: "sales_engineer",
    label: "Sales / Solutions / Field Engineer",
    aliases: [
      "sales engineer",
      "solutions engineer",
      "field engineer",
      "deployment engineer",
      "pre-sales engineer",
      "presales engineer",
      "customer engineer",
      "se ",
      " se",
      "technical sales",
      "solutions consultant",
    ],
    targetTitles: [
      "Sales Engineer",
      "Solutions Engineer",
      "Field Engineer",
      "Deployment Engineer",
      "Customer Engineer",
      "Pre-Sales Engineer",
    ],
    leadingSignalTypes: [
      "adjacent_se_csm",
      "first_apac_gtm_job",
      "talent_flow_strong_org",
      "expansion_signal",
    ],
  },
  {
    id: "account_executive",
    label: "Account Executive",
    aliases: [
      "account executive",
      "enterprise ae",
      "mid-market ae",
      "commercial ae",
      "account manager",
      " ae",
      "ae ",
      "quota-carrying",
      "gtm",
    ],
    targetTitles: [
      "Account Executive",
      "Enterprise Account Executive",
      "Mid-Market Account Executive",
      "Commercial Account Executive",
    ],
    leadingSignalTypes: [
      "apac_sales_leadership_hire",
      "regional_leadership_hire",
      "first_apac_gtm_job",
      "adjacent_se_csm",
      "talent_flow_strong_org",
    ],
  },
  {
    id: "customer_success",
    label: "Customer Success",
    aliases: [
      "customer success",
      "csm",
      "customer success manager",
      "onboarding manager",
      "implementation manager",
    ],
    targetTitles: [
      "Customer Success Manager",
      "Implementation Manager",
      "Onboarding Manager",
      "Technical Account Manager",
    ],
    leadingSignalTypes: ["adjacent_se_csm", "expansion_signal", "au_logo"],
  },
  {
    id: "solutions_architect",
    label: "Solutions Architect",
    aliases: [
      "solutions architect",
      "solution architect",
      "principal architect",
      "staff architect",
    ],
    targetTitles: [
      "Solutions Architect",
      "Sales Engineer",
      "Field Engineer",
      "Customer Engineer",
    ],
    leadingSignalTypes: [
      "adjacent_se_csm",
      "sydney_infra",
      "talent_flow_strong_org",
    ],
  },
  {
    id: "partnerships",
    label: "Partnerships / Alliances",
    aliases: [
      "partnerships",
      "partner manager",
      "alliances",
      "channel",
      "ecosystem",
    ],
    targetTitles: [
      "Partner Manager",
      "Partnerships Manager",
      "Alliances Manager",
      "Channel Manager",
    ],
    leadingSignalTypes: ["expansion_signal", "au_logo", "exec_tour"],
  },
  {
    id: "gtm_leadership",
    label: "GTM Leadership",
    aliases: [
      "head of sales",
      "vp sales",
      "director of sales",
      "gm apac",
      "head of gtm",
      "regional director",
      "country manager",
    ],
    targetTitles: [
      "Head of Sales APAC",
      "Director of Sales ANZ",
      "GM APAC",
      "VP Sales APAC",
    ],
    leadingSignalTypes: [
      "apac_sales_leadership_hire",
      "regional_leadership_hire",
      "anz_expansion",
      "local_entity",
    ],
  },
];

export type CareerIdentity = {
  name?: string;
  headline?: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  linkedInUrl?: string;
  roleFamily: RoleFamilyId;
  seniority?: string;
  geographyHints: string[];
  summary?: string;
};

const APAC_GEO_HINTS = [
  "australia",
  "sydney",
  "melbourne",
  "brisbane",
  "perth",
  "anz",
  "apac",
  "asia pacific",
  "new zealand",
  "singapore",
  "tokyo",
  "japan",
];

export function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function detectRoleFamily(
  titleOrHeadline: string | null | undefined,
): RoleFamilyId {
  if (!titleOrHeadline) {
    return "unknown";
  }

  const normalized = normalizeTitle(titleOrHeadline);

  // Prefer more specific families before broad "gtm"
  const order: RoleFamilyId[] = [
    "sales_engineer",
    "solutions_architect",
    "customer_success",
    "partnerships",
    "gtm_leadership",
    "account_executive",
  ];

  for (const id of order) {
    const family = ROLE_FAMILIES.find((f) => f.id === id)!;
    if (
      family.aliases.some((alias) => {
        const a = alias.trim().toLowerCase();
        if (a.length <= 3) {
          // short tokens like "ae" / "se" need word-ish boundaries
          return new RegExp(`(^|[^a-z])${escapeRegExp(a)}([^a-z]|$)`).test(
            normalized,
          );
        }
        return normalized.includes(a);
      })
    ) {
      return id;
    }
  }

  return "unknown";
}

export function getRoleFamily(id: RoleFamilyId): RoleFamily | undefined {
  return ROLE_FAMILIES.find((family) => family.id === id);
}

export function extractGeographyHints(
  ...parts: Array<string | null | undefined>
): string[] {
  const blob = parts.filter(Boolean).join(" ").toLowerCase();
  return APAC_GEO_HINTS.filter((hint) => blob.includes(hint));
}

export function parseCareerIdentityFromProfile(
  profileMarkdown: string,
): CareerIdentity {
  const section = extractSection(profileMarkdown, "Career Identity");
  const identitySection = extractSection(profileMarkdown, "Identity");
  const targetingSection = extractSection(profileMarkdown, "Targeting");

  const get = (block: string, key: string): string | undefined => {
    const match = block.match(
      new RegExp(`^[-*]\\s*${escapeRegExp(key)}\\s*:\\s*(.+)$`, "im"),
    );
    const value = match?.[1]?.trim();
    if (!value || /^_|\(placeholder/i.test(value)) {
      return undefined;
    }
    return value;
  };

  const currentTitle =
    get(section, "Current title") ??
    get(targetingSection, "Role") ??
    get(identitySection, "Role today");
  const currentCompany =
    get(section, "Current company") ??
    extractCompanyFromRoleToday(get(identitySection, "Role today"));
  const location =
    get(section, "Location") ?? get(identitySection, "Location");
  const headline = get(section, "Headline");
  const linkedInUrl = get(section, "LinkedIn URL");
  const name = get(section, "Name") ?? get(identitySection, "Name");
  const summary = get(section, "Summary");
  const seniority = get(section, "Seniority");
  const roleFamilyRaw = get(section, "Role family");
  const roleFamily =
    (ROLE_FAMILIES.find((f) => f.id === roleFamilyRaw)?.id as
      | RoleFamilyId
      | undefined) ??
    detectRoleFamily(
      [currentTitle, headline, get(identitySection, "Role today")]
        .filter(Boolean)
        .join(" | "),
    );

  return {
    name,
    headline,
    currentTitle,
    currentCompany,
    location,
    linkedInUrl,
    roleFamily,
    seniority,
    geographyHints: extractGeographyHints(
      location,
      headline,
      currentTitle,
      summary,
    ),
    summary,
  };
}

export function formatCareerIdentitySection(identity: CareerIdentity): string {
  const family = getRoleFamily(identity.roleFamily);
  const lines = [
    `- Name: ${identity.name ?? ""}`,
    `- Headline: ${identity.headline ?? ""}`,
    `- Current title: ${identity.currentTitle ?? ""}`,
    `- Current company: ${identity.currentCompany ?? ""}`,
    `- Location: ${identity.location ?? ""}`,
    `- LinkedIn URL: ${identity.linkedInUrl ?? ""}`,
    `- Role family: ${identity.roleFamily}`,
    `- Role family label: ${family?.label ?? "Unknown"}`,
    `- Seniority: ${identity.seniority ?? ""}`,
    `- Geography hints: ${identity.geographyHints.join(", ")}`,
    `- Summary: ${identity.summary ?? ""}`,
    `- Target titles: ${(family?.targetTitles ?? []).join(", ")}`,
  ];
  return lines.join("\n");
}

export function titleAffinityScore(
  candidateTitle: string,
  roleFamily: RoleFamilyId,
): number {
  const family = getRoleFamily(roleFamily);
  if (!family) {
    return 0;
  }

  const normalized = normalizeTitle(candidateTitle);
  let best = 0;

  for (const target of family.targetTitles) {
    const t = normalizeTitle(target);
    if (normalized === t) {
      best = Math.max(best, 1);
    } else if (normalized.includes(t) || t.includes(normalized)) {
      best = Math.max(best, 0.85);
    } else {
      // token overlap
      const a = new Set(normalized.split(/\s+/));
      const b = new Set(t.split(/\s+/));
      let overlap = 0;
      for (const token of a) {
        if (b.has(token) && token.length > 2) {
          overlap += 1;
        }
      }
      if (overlap > 0) {
        best = Math.max(best, Math.min(0.75, overlap * 0.25));
      }
    }
  }

  for (const alias of family.aliases) {
    const a = alias.trim().toLowerCase();
    if (a.length > 3 && normalized.includes(a)) {
      best = Math.max(best, 0.7);
    }
  }

  return best;
}

function extractSection(markdown: string, heading: string): string {
  const pattern = new RegExp(
    `(^##\\s+${escapeRegExp(heading)}\\s*$)([\\s\\S]*?)(?=^##\\s+|\\Z)`,
    "im",
  );
  const match = markdown.match(pattern);
  return match?.[2] ?? "";
}

function extractCompanyFromRoleToday(
  roleToday: string | undefined,
): string | undefined {
  if (!roleToday) {
    return undefined;
  }
  const at = roleToday.match(/\bat\s+(.+)$/i);
  return at?.[1]?.trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
