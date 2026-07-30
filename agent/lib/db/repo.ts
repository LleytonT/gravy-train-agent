import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";

import { getDb } from "./client.js";
import {
  companies,
  opportunities,
  openRoles,
  outreachTargets,
  peopleWatchlist,
  rawItems,
  runLogs,
  signals,
  type Company,
  type NewRawItem,
  type OpenRole,
  type OpenRoleStatus,
  type Opportunity,
  type OpportunityStatus,
  type OutreachKind,
  type OutreachTarget,
  type PersonWatchlist,
  type RawItem,
  type RunLog,
  type Signal,
  type WatchlistTier,
} from "./schema.js";

export type InsertRawItemInput = Omit<
  NewRawItem,
  "id" | "urlHash" | "capturedAt" | "processed"
> & {
  id?: string;
  capturedAt?: string;
  processed?: number;
};

export type SignalWithDecay = Signal & {
  decayWeight: number;
  daysSinceObserved: number;
};

export type CompanyDossier = {
  company: Company;
  signals: SignalWithDecay[];
  opportunities: Opportunity[];
};

export function daysSince(iso: string): number {
  const observed = new Date(iso).getTime();
  if (Number.isNaN(observed)) {
    return 0;
  }
  return (Date.now() - observed) / (1000 * 60 * 60 * 24);
}

export function decayWeight(observedAt: string): number {
  const days = daysSince(observedAt);
  if (days < 0) {
    return 1;
  }
  if (days < 90) {
    return 1;
  }
  if (days >= 270) {
    return Math.max(0, 0.1 * Math.exp(-(days - 270) / 90));
  }
  return 1 - ((days - 90) / 180) * 0.9;
}

function nowIso(): string {
  return new Date().toISOString();
}

function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

function parseAliases(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function matchesCompanyNameOrAlias(
  company: Company,
  candidate: string,
): boolean {
  const normalized = normalizeName(candidate);
  if (normalizeName(company.name) === normalized) {
    return true;
  }
  return parseAliases(company.aliases).some(
    (alias) => normalizeName(alias) === normalized,
  );
}

async function findCompanyByNameOrAlias(
  name: string,
): Promise<Company | undefined> {
  const db = getDb();
  const all = await db.select().from(companies);
  return all.find((company) => matchesCompanyNameOrAlias(company, name));
}

export const repo = {
  async insertRawItems(items: InsertRawItemInput[]): Promise<number> {
    if (items.length === 0) {
      return 0;
    }

    const db = getDb();
    const capturedAt = nowIso();
    let inserted = 0;

    for (const item of items) {
      const row: NewRawItem = {
        id: item.id ?? randomUUID(),
        source: item.source,
        author: item.author,
        authorHeadline: item.authorHeadline ?? null,
        excerpt: item.excerpt.slice(0, 200),
        url: item.url,
        urlHash: hashUrl(item.url),
        postedAt: item.postedAt ?? null,
        capturedAt: item.capturedAt ?? capturedAt,
        processed: item.processed ?? 0,
      };

      const result = await db
        .insert(rawItems)
        .values(row)
        .onConflictDoNothing({ target: rawItems.url })
        .returning({ id: rawItems.id });

      if (result.length > 0) {
        inserted += 1;
      }
    }

    return inserted;
  },

  async getUnprocessedRawItems(limit = 100): Promise<RawItem[]> {
    const db = getDb();
    return db
      .select()
      .from(rawItems)
      .where(eq(rawItems.processed, 0))
      .orderBy(desc(rawItems.capturedAt))
      .limit(limit);
  },

  async markRawItemsProcessed(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const db = getDb();
    await db
      .update(rawItems)
      .set({ processed: 1 })
      .where(inArray(rawItems.id, ids));
  },

  async upsertCompany(input: {
    name: string;
    aliases?: string[];
    website?: string | null;
    category?: string | null;
    watchlistTier?: WatchlistTier;
  }): Promise<Company> {
    const db = getDb();
    const timestamp = nowIso();
    const existing = await findCompanyByNameOrAlias(input.name);

    if (existing) {
      const mergedAliases = [
        ...new Set([
          ...parseAliases(existing.aliases),
          ...(input.aliases ?? []),
          input.name,
        ]),
      ];

      const [updated] = await db
        .update(companies)
        .set({
          name: existing.name,
          aliases: JSON.stringify(mergedAliases),
          website: input.website ?? existing.website,
          category: input.category ?? existing.category,
          watchlistTier: input.watchlistTier ?? existing.watchlistTier,
          updatedAt: timestamp,
        })
        .where(eq(companies.id, existing.id))
        .returning();

      return updated!;
    }

    const aliases = [...new Set([...(input.aliases ?? []), input.name])];
    const [created] = await db
      .insert(companies)
      .values({
        id: randomUUID(),
        name: input.name.trim(),
        aliases: JSON.stringify(aliases),
        website: input.website ?? null,
        category: input.category ?? null,
        watchlistTier: input.watchlistTier ?? "warm",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning();

    return created!;
  },

  async getCompanyById(id: string): Promise<Company | undefined> {
    const db = getDb();
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);
    return company;
  },

  async getCompanyByName(name: string): Promise<Company | undefined> {
    return findCompanyByNameOrAlias(name);
  },

  async saveSignal(input: {
    companyId: string;
    type: string;
    direction: Signal["direction"];
    strength: number;
    summary: string;
    sourceUrl?: string | null;
    excerpt?: string | null;
    observedAt?: string;
  }): Promise<Signal> {
    const db = getDb();
    const strength = Math.min(5, Math.max(1, Math.round(input.strength)));
    const timestamp = nowIso();

    const [saved] = await db
      .insert(signals)
      .values({
        id: randomUUID(),
        companyId: input.companyId,
        type: input.type,
        direction: input.direction,
        strength,
        summary: input.summary,
        sourceUrl: input.sourceUrl ?? null,
        excerpt: input.excerpt ?? null,
        observedAt: input.observedAt ?? timestamp,
        createdAt: timestamp,
      })
      .returning();

    return saved!;
  },

  async getSignalsForCompany(
    companyId: string,
    options?: { includeDecayed?: boolean },
  ): Promise<Signal[] | SignalWithDecay[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(signals)
      .where(eq(signals.companyId, companyId))
      .orderBy(desc(signals.observedAt));

    if (!options?.includeDecayed) {
      return rows;
    }

    return rows.map((signal) => ({
      ...signal,
      decayWeight: decayWeight(signal.observedAt),
      daysSinceObserved: daysSince(signal.observedAt),
    }));
  },

  async listCompanies(options?: {
    tier?: WatchlistTier;
  }): Promise<Company[]> {
    const db = getDb();

    if (options?.tier) {
      return db
        .select()
        .from(companies)
        .where(eq(companies.watchlistTier, options.tier))
        .orderBy(companies.name);
    }

    return db.select().from(companies).orderBy(companies.name);
  },

  async updateWatchlistTier(
    companyIdOrName: string,
    tier: WatchlistTier,
  ): Promise<Company | undefined> {
    const db = getDb();
    const company =
      (await repo.getCompanyById(companyIdOrName)) ??
      (await repo.getCompanyByName(companyIdOrName));

    if (!company) {
      return undefined;
    }

    const [updated] = await db
      .update(companies)
      .set({ watchlistTier: tier, updatedAt: nowIso() })
      .where(eq(companies.id, company.id))
      .returning();

    return updated;
  },

  async listPeopleWatchlist(): Promise<PersonWatchlist[]> {
    const db = getDb();
    return db
      .select()
      .from(peopleWatchlist)
      .orderBy(peopleWatchlist.name);
  },

  async addPerson(input: {
    name: string;
    currentCompany?: string | null;
    whyWatched?: string | null;
    sourceUrl?: string | null;
  }): Promise<PersonWatchlist> {
    const db = getDb();
    const [person] = await db
      .insert(peopleWatchlist)
      .values({
        id: randomUUID(),
        name: input.name.trim(),
        currentCompany: input.currentCompany ?? null,
        whyWatched: input.whyWatched ?? null,
        sourceUrl: input.sourceUrl ?? null,
        createdAt: nowIso(),
      })
      .returning();

    return person!;
  },

  async updatePerson(
    id: string,
    input: {
      name?: string;
      currentCompany?: string | null;
      whyWatched?: string | null;
      sourceUrl?: string | null;
    },
  ): Promise<PersonWatchlist | undefined> {
    const db = getDb();
    const [updated] = await db
      .update(peopleWatchlist)
      .set({
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.currentCompany !== undefined
          ? { currentCompany: input.currentCompany }
          : {}),
        ...(input.whyWatched !== undefined ? { whyWatched: input.whyWatched } : {}),
        ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
      })
      .where(eq(peopleWatchlist.id, id))
      .returning();

    return updated;
  },

  async upsertOpenRole(input: {
    companyId: string;
    title: string;
    location?: string | null;
    sourceUrl?: string | null;
    status?: OpenRoleStatus;
  }): Promise<OpenRole> {
    const db = getDb();
    const timestamp = nowIso();
    const existing = await db
      .select()
      .from(openRoles)
      .where(eq(openRoles.companyId, input.companyId));

    const match = existing.find(
      (role) =>
        normalizeName(role.title) === normalizeName(input.title) &&
        (role.location ?? "") === (input.location ?? ""),
    );

    if (match) {
      const [updated] = await db
        .update(openRoles)
        .set({
          title: input.title.trim(),
          location: input.location ?? match.location,
          sourceUrl: input.sourceUrl ?? match.sourceUrl,
          status: input.status ?? match.status,
          updatedAt: timestamp,
        })
        .where(eq(openRoles.id, match.id))
        .returning();
      return updated!;
    }

    const [created] = await db
      .insert(openRoles)
      .values({
        id: randomUUID(),
        companyId: input.companyId,
        title: input.title.trim(),
        location: input.location ?? null,
        sourceUrl: input.sourceUrl ?? null,
        status: input.status ?? "open",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning();

    return created!;
  },

  async listOpenRoles(options?: {
    companyId?: string;
    status?: OpenRoleStatus;
  }): Promise<OpenRole[]> {
    const db = getDb();
    const conditions = [];

    if (options?.companyId) {
      conditions.push(eq(openRoles.companyId, options.companyId));
    }
    if (options?.status) {
      conditions.push(eq(openRoles.status, options.status));
    }

    if (conditions.length === 0) {
      return db.select().from(openRoles).orderBy(desc(openRoles.updatedAt));
    }

    if (conditions.length === 1) {
      return db
        .select()
        .from(openRoles)
        .where(conditions[0]!)
        .orderBy(desc(openRoles.updatedAt));
    }

    return db
      .select()
      .from(openRoles)
      .where(and(...conditions))
      .orderBy(desc(openRoles.updatedAt));
  },

  async upsertOutreachTarget(input: {
    companyId: string;
    name: string;
    title: string;
    kind: OutreachKind;
    linkedInUrl?: string | null;
    whyReachOut: string;
    relatedRoleTitle?: string | null;
  }): Promise<OutreachTarget> {
    const db = getDb();
    const timestamp = nowIso();
    const existing = await db
      .select()
      .from(outreachTargets)
      .where(eq(outreachTargets.companyId, input.companyId));

    const match = existing.find(
      (row) =>
        normalizeName(row.name) === normalizeName(input.name) &&
        row.kind === input.kind,
    );

    if (match) {
      const [updated] = await db
        .update(outreachTargets)
        .set({
          name: input.name.trim(),
          title: input.title.trim(),
          kind: input.kind,
          linkedInUrl: input.linkedInUrl ?? match.linkedInUrl,
          whyReachOut: input.whyReachOut,
          relatedRoleTitle:
            input.relatedRoleTitle ?? match.relatedRoleTitle,
          updatedAt: timestamp,
        })
        .where(eq(outreachTargets.id, match.id))
        .returning();
      return updated!;
    }

    const [created] = await db
      .insert(outreachTargets)
      .values({
        id: randomUUID(),
        companyId: input.companyId,
        name: input.name.trim(),
        title: input.title.trim(),
        kind: input.kind,
        linkedInUrl: input.linkedInUrl ?? null,
        whyReachOut: input.whyReachOut,
        relatedRoleTitle: input.relatedRoleTitle ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning();

    return created!;
  },

  async listOutreachTargets(options?: {
    companyId?: string;
    kind?: OutreachKind;
  }): Promise<OutreachTarget[]> {
    const db = getDb();
    const conditions = [];

    if (options?.companyId) {
      conditions.push(eq(outreachTargets.companyId, options.companyId));
    }
    if (options?.kind) {
      conditions.push(eq(outreachTargets.kind, options.kind));
    }

    if (conditions.length === 0) {
      return db
        .select()
        .from(outreachTargets)
        .orderBy(outreachTargets.companyId, outreachTargets.name);
    }

    if (conditions.length === 1) {
      return db
        .select()
        .from(outreachTargets)
        .where(conditions[0]!)
        .orderBy(outreachTargets.name);
    }

    return db
      .select()
      .from(outreachTargets)
      .where(and(...conditions))
      .orderBy(outreachTargets.name);
  },

  async createOpportunity(input: {
    companyId: string;
    headline: string;
    score: number;
    status?: OpportunityStatus;
    pingedAt?: string | null;
  }): Promise<Opportunity> {
    const db = getDb();
    const timestamp = nowIso();

    const [created] = await db
      .insert(opportunities)
      .values({
        id: randomUUID(),
        companyId: input.companyId,
        headline: input.headline,
        score: input.score,
        status: input.status ?? "new",
        pingedAt: input.pingedAt ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning();

    return created!;
  },

  async listOpportunities(options?: {
    status?: OpportunityStatus;
    companyId?: string;
    limit?: number;
  }): Promise<Opportunity[]> {
    const db = getDb();
    const conditions = [];

    if (options?.status) {
      conditions.push(eq(opportunities.status, options.status));
    }
    if (options?.companyId) {
      conditions.push(eq(opportunities.companyId, options.companyId));
    }

    const query = db.select().from(opportunities);

    if (conditions.length === 1) {
      return query
        .where(conditions[0]!)
        .orderBy(desc(opportunities.score), desc(opportunities.createdAt))
        .limit(options?.limit ?? 100);
    }

    if (conditions.length > 1) {
      return query
        .where(and(...conditions))
        .orderBy(desc(opportunities.score), desc(opportunities.createdAt))
        .limit(options?.limit ?? 100);
    }

    return query
      .orderBy(desc(opportunities.score), desc(opportunities.createdAt))
      .limit(options?.limit ?? 100);
  },

  async updateOpportunityStatus(
    id: string,
    status: OpportunityStatus,
    options?: { pingedAt?: string | null },
  ): Promise<Opportunity | undefined> {
    const db = getDb();
    const timestamp = nowIso();

    const [updated] = await db
      .update(opportunities)
      .set({
        status,
        updatedAt: timestamp,
        ...(options?.pingedAt !== undefined ? { pingedAt: options.pingedAt } : {}),
        ...(status === "pinged" && options?.pingedAt === undefined
          ? { pingedAt: timestamp }
          : {}),
      })
      .where(eq(opportunities.id, id))
      .returning();

    return updated;
  },

  async getRecentPingForCompany(
    companyId: string,
    withinHours = 48,
  ): Promise<Opportunity | undefined> {
    const db = getDb();
    const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();

    const rows = await db
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.companyId, companyId),
          or(
            eq(opportunities.status, "pinged"),
            eq(opportunities.status, "discussed"),
            eq(opportunities.status, "pursuing"),
          ),
          or(
            gte(opportunities.pingedAt, cutoff),
            and(
              sql`${opportunities.pingedAt} IS NULL`,
              gte(opportunities.updatedAt, cutoff),
            ),
          ),
        ),
      )
      .orderBy(desc(opportunities.updatedAt))
      .limit(1);

    return rows[0];
  },

  async logRunStart(): Promise<RunLog> {
    const db = getDb();
    const [run] = await db
      .insert(runLogs)
      .values({
        id: randomUUID(),
        startedAt: nowIso(),
        finishedAt: null,
        summary: null,
        itemsProcessed: 0,
        signalsFound: 0,
        pingsSent: 0,
      })
      .returning();

    return run!;
  },

  async logRunFinish(
    id: string,
    summary: {
      summary?: string | null;
      itemsProcessed?: number;
      signalsFound?: number;
      pingsSent?: number;
    },
  ): Promise<RunLog | undefined> {
    const db = getDb();
    const [updated] = await db
      .update(runLogs)
      .set({
        finishedAt: nowIso(),
        summary: summary.summary ?? null,
        itemsProcessed: summary.itemsProcessed ?? 0,
        signalsFound: summary.signalsFound ?? 0,
        pingsSent: summary.pingsSent ?? 0,
      })
      .where(eq(runLogs.id, id))
      .returning();

    return updated;
  },

  async getCompanyDossier(
    companyIdOrName: string,
  ): Promise<CompanyDossier | undefined> {
    const company =
      (await repo.getCompanyById(companyIdOrName)) ??
      (await repo.getCompanyByName(companyIdOrName));

    if (!company) {
      return undefined;
    }

    const decayedSignals = (await repo.getSignalsForCompany(company.id, {
      includeDecayed: true,
    })) as SignalWithDecay[];

    const companyOpportunities = await repo.listOpportunities({
      companyId: company.id,
      limit: 50,
    });

    return {
      company,
      signals: decayedSignals,
      opportunities: companyOpportunities,
    };
  },
};
