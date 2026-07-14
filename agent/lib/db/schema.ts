import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rawItemSources = ["linkedin", "x"] as const;
export type RawItemSource = (typeof rawItemSources)[number];

export const watchlistTiers = ["hot", "warm", "ignore"] as const;
export type WatchlistTier = (typeof watchlistTiers)[number];

export const signalDirections = ["positive", "negative"] as const;
export type SignalDirection = (typeof signalDirections)[number];

export const opportunityStatuses = [
  "new",
  "pinged",
  "discussed",
  "dismissed",
  "pursuing",
] as const;
export type OpportunityStatus = (typeof opportunityStatuses)[number];

export const rawItems = sqliteTable("raw_items", {
  id: text("id").primaryKey(),
  source: text("source", { enum: rawItemSources }).notNull(),
  author: text("author").notNull(),
  authorHeadline: text("author_headline"),
  excerpt: text("excerpt").notNull(),
  url: text("url").notNull().unique(),
  urlHash: text("url_hash").notNull(),
  postedAt: text("posted_at"),
  capturedAt: text("captured_at").notNull(),
  processed: integer("processed").notNull().default(0),
});

export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  aliases: text("aliases").notNull().default("[]"),
  website: text("website"),
  category: text("category"),
  watchlistTier: text("watchlist_tier", { enum: watchlistTiers })
    .notNull()
    .default("warm"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const signals = sqliteTable("signals", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id),
  type: text("type").notNull(),
  direction: text("direction", { enum: signalDirections }).notNull(),
  strength: integer("strength").notNull(),
  summary: text("summary").notNull(),
  sourceUrl: text("source_url"),
  excerpt: text("excerpt"),
  observedAt: text("observed_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const peopleWatchlist = sqliteTable("people_watchlist", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  currentCompany: text("current_company"),
  whyWatched: text("why_watched"),
  sourceUrl: text("source_url"),
  createdAt: text("created_at").notNull(),
});

export const opportunities = sqliteTable("opportunities", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id),
  headline: text("headline").notNull(),
  score: real("score").notNull(),
  pingedAt: text("pinged_at"),
  status: text("status", { enum: opportunityStatuses }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const runLogs = sqliteTable("run_logs", {
  id: text("id").primaryKey(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  summary: text("summary"),
  itemsProcessed: integer("items_processed").notNull().default(0),
  signalsFound: integer("signals_found").notNull().default(0),
  pingsSent: integer("pings_sent").notNull().default(0),
});

export type RawItem = typeof rawItems.$inferSelect;
export type NewRawItem = typeof rawItems.$inferInsert;

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

export type Signal = typeof signals.$inferSelect;
export type NewSignal = typeof signals.$inferInsert;

export type PersonWatchlist = typeof peopleWatchlist.$inferSelect;
export type NewPersonWatchlist = typeof peopleWatchlist.$inferInsert;

export type Opportunity = typeof opportunities.$inferSelect;
export type NewOpportunity = typeof opportunities.$inferInsert;

export type RunLog = typeof runLogs.$inferSelect;
export type NewRunLog = typeof runLogs.$inferInsert;

export const schema = {
  rawItems,
  companies,
  signals,
  peopleWatchlist,
  opportunities,
  runLogs,
} as const;

export type Schema = typeof schema;
