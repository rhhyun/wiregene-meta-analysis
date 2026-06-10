import { createClient } from "@libsql/client/web";
import crypto from "crypto";
import { config } from "./config";
import { getReportStorageAdapter, isJsonStorageEnabled } from "./storage";
import { defaultTopics } from "./topics";
import { normalizeTopicProfiles } from "./topic-tools";
import type { BriefingItem, ReportWithItems, ResearchReport, TopicProfile } from "./types";

type LibSqlClient = ReturnType<typeof createClient>;

const globalForDb = globalThis as unknown as {
  researchDb?: LibSqlClient;
  researchDbReady?: Promise<void>;
};

function getClient() {
  if (!globalForDb.researchDb) {
    globalForDb.researchDb = createClient({
      url: config.databaseUrl,
      authToken: config.databaseAuthToken,
    });
  }

  return globalForDb.researchDb;
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function jsonArray(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function jsonValue(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function itemId(kind: string, sourceId: string) {
  return crypto.createHash("sha256").update(`${kind}:${sourceId}`).digest("hex");
}

export async function ensureDatabase() {
  if (isJsonStorageEnabled()) {
    await getReportStorageAdapter().ensure();
    return;
  }

  if (!globalForDb.researchDbReady) {
    const db = getClient();
    globalForDb.researchDbReady = (async () => {
      await db.batch(
        [
        {
          sql: `CREATE TABLE IF NOT EXISTS research_topics (
            slug TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            config_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            generated_at TEXT NOT NULL,
            summary TEXT NOT NULL,
            status TEXT NOT NULL,
            model TEXT,
            raw_json TEXT
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            topic_slug TEXT NOT NULL,
            kind TEXT NOT NULL,
            source_id TEXT NOT NULL,
            title TEXT NOT NULL,
            source_name TEXT NOT NULL,
            published_at TEXT,
            url TEXT NOT NULL,
            doi TEXT,
            pmid TEXT,
            authors_json TEXT NOT NULL,
            abstract TEXT,
            snippet TEXT,
            summary TEXT,
            significance TEXT,
            tags_json TEXT NOT NULL,
            importance TEXT NOT NULL,
            zotero_key TEXT,
            raw_json TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(kind, source_id)
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS report_items (
            report_id TEXT NOT NULL,
            item_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            PRIMARY KEY (report_id, item_id),
            FOREIGN KEY (report_id) REFERENCES reports(id),
            FOREIGN KEY (item_id) REFERENCES items(id)
          )`,
          args: [],
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )`,
          args: [],
        },
        ],
        "write",
      );
    })();
  }

  await globalForDb.researchDbReady;
}

export async function seedDefaultTopics() {
  if (isJsonStorageEnabled()) {
    await getReportStorageAdapter().seedDefaultTopics();
    return;
  }

  await ensureDatabase();
  const db = getClient();
  const existing = await db.execute({
    sql: "SELECT COUNT(*) AS count FROM research_topics",
    args: [],
  });
  if (Number(existing.rows[0]?.count ?? 0) > 0) return;

  const now = new Date().toISOString();

  for (const topic of defaultTopics) {
    await db.execute({
      sql: `INSERT INTO research_topics
        (slug, name, enabled, config_json, created_at, updated_at)
        VALUES (?, ?, 1, ?, ?, ?)
        ON CONFLICT(slug) DO NOTHING`,
      args: [topic.slug, topic.name, JSON.stringify(topic), now, now],
    });
  }
}

export async function setEnabledTopics(topics: TopicProfile[]) {
  const normalized = normalizeTopicProfiles(topics);

  if (isJsonStorageEnabled()) {
    return getReportStorageAdapter().setEnabledTopics(normalized);
  }

  await ensureDatabase();
  const db = getClient();
  const now = new Date().toISOString();
  await db.execute({
    sql: "UPDATE research_topics SET enabled = 0, updated_at = ?",
    args: [now],
  });

  for (const topic of normalized) {
    await db.execute({
      sql: `INSERT INTO research_topics
        (slug, name, enabled, config_json, created_at, updated_at)
        VALUES (?, ?, 1, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          name = excluded.name,
          enabled = 1,
          config_json = excluded.config_json,
          updated_at = excluded.updated_at`,
      args: [topic.slug, topic.name, JSON.stringify(topic), now, now],
    });
  }

  return getEnabledTopics();
}

export async function getEnabledTopics() {
  if (isJsonStorageEnabled()) {
    return getReportStorageAdapter().getEnabledTopics();
  }

  await seedDefaultTopics();
  const db = getClient();
  const result = await db.execute({
    sql: "SELECT config_json FROM research_topics WHERE enabled = 1 ORDER BY name",
    args: [],
  });

  return result.rows
    .map((row) => jsonValue(row.config_json))
    .filter(Boolean) as typeof defaultTopics;
}

function rowToReport(row: Record<string, unknown>): ResearchReport {
  return {
    id: String(row.id),
    title: String(row.title),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    generatedAt: String(row.generated_at),
    summary: String(row.summary),
    status: row.status === "failed" ? "failed" : "completed",
    model: stringValue(row.model),
    raw: jsonValue(row.raw_json),
  };
}

function rowToItem(row: Record<string, unknown>): BriefingItem {
  return {
    id: String(row.id),
    topicSlug: String(row.topic_slug),
    kind: row.kind as BriefingItem["kind"],
    sourceId: String(row.source_id),
    title: String(row.title),
    sourceName: String(row.source_name),
    publishedAt: stringValue(row.published_at),
    url: String(row.url),
    doi: stringValue(row.doi),
    pmid: stringValue(row.pmid),
    authors: jsonArray(row.authors_json),
    abstract: stringValue(row.abstract),
    snippet: stringValue(row.snippet),
    summary: stringValue(row.summary),
    significance: stringValue(row.significance),
    tags: jsonArray(row.tags_json),
    importance: row.importance as BriefingItem["importance"],
    zoteroKey: stringValue(row.zotero_key),
    raw: jsonValue(row.raw_json),
  };
}

async function upsertItem(item: BriefingItem) {
  const db = getClient();
  const now = new Date().toISOString();
  const id = item.id ?? itemId(item.kind, item.sourceId);

  await db.execute({
    sql: `INSERT INTO items (
      id, topic_slug, kind, source_id, title, source_name, published_at, url,
      doi, pmid, authors_json, abstract, snippet, summary, significance,
      tags_json, importance, zotero_key, raw_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(kind, source_id) DO UPDATE SET
      topic_slug = excluded.topic_slug,
      title = excluded.title,
      source_name = excluded.source_name,
      published_at = excluded.published_at,
      url = excluded.url,
      doi = excluded.doi,
      pmid = excluded.pmid,
      authors_json = excluded.authors_json,
      abstract = excluded.abstract,
      snippet = excluded.snippet,
      summary = excluded.summary,
      significance = excluded.significance,
      tags_json = excluded.tags_json,
      importance = excluded.importance,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at`,
    args: [
      id,
      item.topicSlug,
      item.kind,
      item.sourceId,
      item.title,
      item.sourceName,
      item.publishedAt,
      item.url,
      item.doi ?? null,
      item.pmid ?? null,
      JSON.stringify(item.authors ?? []),
      item.abstract ?? null,
      item.snippet ?? null,
      item.summary ?? null,
      item.significance ?? null,
      JSON.stringify(item.tags ?? []),
      item.importance,
      item.zoteroKey ?? null,
      JSON.stringify(item.raw ?? {}),
      now,
      now,
    ],
  });

  const stored = await db.execute({
    sql: "SELECT * FROM items WHERE kind = ? AND source_id = ? LIMIT 1",
    args: [item.kind, item.sourceId],
  });

  return rowToItem(stored.rows[0] as Record<string, unknown>);
}

export async function saveReport(
  report: Omit<ResearchReport, "id"> & { id?: string },
  items: BriefingItem[],
) {
  if (isJsonStorageEnabled()) {
    return getReportStorageAdapter().saveReport(report, items);
  }

  await ensureDatabase();
  const db = getClient();
  const id = report.id ?? crypto.randomUUID();

  await db.execute({
    sql: `INSERT INTO reports
      (id, title, period_start, period_end, generated_at, summary, status, model, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      report.title,
      report.periodStart,
      report.periodEnd,
      report.generatedAt,
      report.summary,
      report.status,
      report.model,
      JSON.stringify(report.raw ?? {}),
    ],
  });

  let position = 0;
  const storedItems: BriefingItem[] = [];
  for (const item of items) {
    const stored = await upsertItem(item);
    storedItems.push(stored);
    await db.execute({
      sql: `INSERT OR REPLACE INTO report_items (report_id, item_id, position)
        VALUES (?, ?, ?)`,
      args: [id, stored.id ?? "", position],
    });
    position += 1;
  }

  return {
    id,
    title: report.title,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    generatedAt: report.generatedAt,
    summary: report.summary,
    status: report.status,
    model: report.model,
    raw: report.raw,
    items: storedItems,
  } satisfies ReportWithItems;
}

export async function listReports(limit = 8) {
  if (isJsonStorageEnabled()) {
    return getReportStorageAdapter().listReports(limit);
  }

  await ensureDatabase();
  const db = getClient();
  const result = await db.execute({
    sql: "SELECT * FROM reports ORDER BY generated_at DESC LIMIT ?",
    args: [limit],
  });

  return result.rows.map((row) => rowToReport(row as Record<string, unknown>));
}

export async function getReportById(id: string) {
  if (isJsonStorageEnabled()) {
    return getReportStorageAdapter().getReportById(id);
  }

  await ensureDatabase();
  const db = getClient();
  const reportResult = await db.execute({
    sql: "SELECT * FROM reports WHERE id = ? LIMIT 1",
    args: [id],
  });

  if (reportResult.rows.length === 0) return null;

  const itemsResult = await db.execute({
    sql: `SELECT items.* FROM report_items
      JOIN items ON items.id = report_items.item_id
      WHERE report_items.report_id = ?
      ORDER BY report_items.position ASC`,
    args: [id],
  });

  return {
    ...rowToReport(reportResult.rows[0] as Record<string, unknown>),
    items: itemsResult.rows.map((row) => rowToItem(row as Record<string, unknown>)),
  };
}

export async function getLatestReport() {
  if (isJsonStorageEnabled()) {
    return getReportStorageAdapter().getLatestReport();
  }

  const reports = await listReports(1);
  if (reports.length === 0) return null;
  return getReportById(reports[0].id);
}

export async function updateItemZoteroKey(itemIdValue: string, zoteroKey: string) {
  if (isJsonStorageEnabled()) {
    await getReportStorageAdapter().updateItemZoteroKey(itemIdValue, zoteroKey);
    return;
  }

  await ensureDatabase();
  const db = getClient();
  await db.execute({
    sql: "UPDATE items SET zotero_key = ?, updated_at = ? WHERE id = ?",
    args: [zoteroKey, new Date().toISOString(), itemIdValue],
  });
}
