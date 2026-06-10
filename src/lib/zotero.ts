import crypto from "crypto";
import { config } from "./config";
import { updateItemZoteroKey } from "./db";
import { getTopicName } from "./topics";
import type { BriefingItem } from "./types";

type ZoteroCollection = {
  key: string;
  data?: {
    key?: string;
    name?: string;
    parentCollection?: string | false;
  };
};

type ZoteroWriteResponse<T = unknown> = {
  successful?: Record<string, T>;
  success?: Record<string, string>;
  unchanged?: Record<string, T>;
  failed?: Record<string, unknown>;
};

export class ZoteroSyncError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(message: string, options?: { status?: number; code?: string; details?: unknown }) {
    super(message);
    this.name = "ZoteroSyncError";
    this.status = options?.status ?? 400;
    this.code = options?.code ?? "ZOTERO_SYNC_FAILED";
    this.details = options?.details;
  }
}

export function getZoteroConfigStatus() {
  const missing = [
    config.zoteroApiKey ? null : "ZOTERO_API_KEY",
    config.zoteroLibraryId ? null : "ZOTERO_LIBRARY_ID",
  ].filter(Boolean) as string[];

  const invalid =
    config.zoteroLibraryType === "user" || config.zoteroLibraryType === "group"
      ? []
      : ["ZOTERO_LIBRARY_TYPE must be either user or group."];

  return {
    ok: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

export function assertZoteroConfigured() {
  const status = getZoteroConfigStatus();
  if (status.ok) return;

  const problems = [
    status.missing.length > 0 ? `missing ${status.missing.join(", ")}` : "",
    ...status.invalid,
  ].filter(Boolean);

  throw new ZoteroSyncError(
    `Zotero sync is not configured (${problems.join("; ")}). Add the required Zotero environment variables and restart the server.`,
    {
      status: 503,
      code: "ZOTERO_NOT_CONFIGURED",
      details: status,
    },
  );
}

function zoteroBaseUrl() {
  assertZoteroConfigured();
  const type = config.zoteroLibraryType === "group" ? "groups" : "users";
  return `https://api.zotero.org/${type}/${config.zoteroLibraryId}`;
}

function zoteroHeaders(extra?: HeadersInit) {
  return {
    "Zotero-API-Version": "3",
    "Zotero-API-Key": config.zoteroApiKey,
    ...extra,
  };
}

function parseTopicCollectionMap() {
  if (!config.zoteroTopicCollectionMapJson) return {};
  try {
    const parsed = JSON.parse(config.zoteroTopicCollectionMapJson) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, key]) => typeof key === "string" && key.length > 0),
    );
  } catch {
    throw new ZoteroSyncError("ZOTERO_TOPIC_COLLECTION_MAP_JSON must be valid JSON.", {
      status: 500,
      code: "ZOTERO_INVALID_TOPIC_COLLECTION_MAP",
    });
  }
}

async function readZoteroResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as ZoteroWriteResponse;
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

function zoteroFailureMessage(action: string, response: Response, payload: unknown) {
  return `Zotero ${action} failed: ${response.status} ${response.statusText} ${JSON.stringify(
    payload,
  )}`;
}

function collectionKey(collection: ZoteroCollection | string | undefined) {
  if (!collection) return null;
  if (typeof collection === "string") return collection;
  return collection.key ?? collection.data?.key ?? null;
}

function collectionName(collection: ZoteroCollection) {
  return collection.data?.name ?? "";
}

function collectionParent(collection: ZoteroCollection) {
  return collection.data?.parentCollection ?? false;
}

async function listCollections() {
  const collections: ZoteroCollection[] = [];
  const limit = 100;
  let start = 0;

  while (true) {
    const url = new URL(`${zoteroBaseUrl()}/collections`);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("start", String(start));

    const response = await fetch(url, { headers: zoteroHeaders() });
    if (!response.ok) {
      const payload = await readZoteroResponse(response);
      throw new ZoteroSyncError(zoteroFailureMessage("collections lookup", response, payload), {
        status: response.status === 401 || response.status === 403 ? 502 : 400,
        code: "ZOTERO_COLLECTIONS_LOOKUP_FAILED",
        details: payload,
      });
    }

    const batch = (await response.json()) as ZoteroCollection[];
    collections.push(...batch);
    if (batch.length < limit) break;
    start += limit;
  }

  return collections;
}

async function createCollection(name: string, parentCollection: string | false) {
  const response = await fetch(`${zoteroBaseUrl()}/collections`, {
    method: "POST",
    headers: zoteroHeaders({
      "Content-Type": "application/json",
      "Zotero-Write-Token": crypto.randomUUID().replace(/-/g, ""),
    }),
    body: JSON.stringify([{ name, parentCollection }]),
  });

  const payload = (await readZoteroResponse(response)) as ZoteroWriteResponse<ZoteroCollection>;
  if (!response.ok) {
    throw new ZoteroSyncError(
      zoteroFailureMessage("collection create", response, payload.failed ?? payload),
      {
        status: response.status === 401 || response.status === 403 ? 502 : 400,
        code: "ZOTERO_COLLECTION_CREATE_FAILED",
        details: payload.failed ?? payload,
      },
    );
  }

  const created = payload.successful?.["0"] ?? payload.unchanged?.["0"];
  const key = collectionKey(created);
  if (!key) {
    throw new ZoteroSyncError(`Zotero did not return a collection key for ${name}.`, {
      code: "ZOTERO_COLLECTION_KEY_MISSING",
      details: payload,
    });
  }

  return key;
}

async function ensureRootCollection(collections: ZoteroCollection[]) {
  if (!config.zoteroRootCollectionName) return false;

  const existing = collections.find(
    (collection) =>
      collectionName(collection) === config.zoteroRootCollectionName &&
      collectionParent(collection) === false,
  );

  const existingKey = collectionKey(existing);
  if (existingKey) return existingKey;

  if (!config.zoteroAutoCreateCollections) {
    throw new ZoteroSyncError(
      `Zotero root collection "${config.zoteroRootCollectionName}" was not found.`,
      { code: "ZOTERO_ROOT_COLLECTION_NOT_FOUND" },
    );
  }

  return createCollection(config.zoteroRootCollectionName, false);
}

async function resolveCollectionKeys(items: BriefingItem[]) {
  const explicitMap = parseTopicCollectionMap();
  const neededTopics = Array.from(
    new Set(items.filter((item) => item.kind === "paper").map((item) => item.topicSlug)),
  );
  const resolved: Record<string, string> = {};

  for (const topicSlug of neededTopics) {
    if (explicitMap[topicSlug]) resolved[topicSlug] = explicitMap[topicSlug];
  }

  const unresolved = neededTopics.filter((topicSlug) => !resolved[topicSlug]);
  if (unresolved.length === 0) return resolved;

  const collections = await listCollections();
  const rootKey = await ensureRootCollection(collections);
  const updatedCollections =
    rootKey && !collections.some((collection) => collectionKey(collection) === rootKey)
      ? await listCollections()
      : collections;

  for (const topicSlug of unresolved) {
    const topicName = getTopicName(topicSlug);
    const existing = updatedCollections.find(
      (collection) =>
        collectionName(collection) === topicName &&
        (rootKey ? collectionParent(collection) === rootKey : true),
    );
    const existingKey = collectionKey(existing);

    if (existingKey) {
      resolved[topicSlug] = existingKey;
      continue;
    }

    if (!config.zoteroAutoCreateCollections) {
      throw new ZoteroSyncError(`Zotero topic collection "${topicName}" was not found.`, {
        code: "ZOTERO_TOPIC_COLLECTION_NOT_FOUND",
      });
    }

    resolved[topicSlug] = await createCollection(topicName, rootKey);
  }

  return resolved;
}

function creator(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return { creatorType: "author", name };
  const lastName = parts[0];
  const firstName = parts.slice(1).join(" ");
  return { creatorType: "author", firstName, lastName };
}

function toZoteroItem(item: BriefingItem, collectionKeyForTopic: string | undefined) {
  if (!isPaperItem(item)) {
    throw new ZoteroSyncError("Only paper items can be synced to Zotero.", {
      code: "ZOTERO_NON_PAPER_ITEM_BLOCKED",
    });
  }

  const collections = [
    collectionKeyForTopic,
    config.zoteroCollectionKey || undefined,
  ].filter(Boolean);

  return {
    itemType: "journalArticle",
    title: item.title,
    creators: item.authors.slice(0, 12).map(creator),
    abstractNote: item.abstract ?? item.summary ?? "",
    publicationTitle: item.sourceName,
    date: item.publishedAt?.slice(0, 10) ?? "",
    DOI: item.doi ?? "",
    url: item.url,
    tags: Array.from(new Set(["Research Briefing", getTopicName(item.topicSlug), ...item.tags])).map(
      (tag) => ({ tag }),
    ),
    collections,
    extra: [item.pmid ? `PMID: ${item.pmid}` : "", item.id ? `BriefingItemID: ${item.id}` : ""]
      .filter(Boolean)
      .join("\n"),
  };
}

function isPaperItem(item: BriefingItem) {
  return item.kind === "paper";
}

export async function syncPapersToZotero(items: BriefingItem[]) {
  const allPapers = items.filter(isPaperItem);
  const papers = allPapers.filter((item) => !item.zoteroKey);
  const ignoredNonPapers = items.length - allPapers.length;

  if (papers.length === 0) {
    return { created: 0, skipped: allPapers.length, ignoredNonPapers, collections: 0 };
  }

  assertZoteroConfigured();
  const collectionMap = await resolveCollectionKeys(papers);
  const response = await fetch(`${zoteroBaseUrl()}/items`, {
    method: "POST",
    headers: zoteroHeaders({
      "Content-Type": "application/json",
      "Zotero-Write-Token": crypto.randomUUID().replace(/-/g, ""),
    }),
    body: JSON.stringify(
      papers.map((paper) => toZoteroItem(paper, collectionMap[paper.topicSlug])),
    ),
  });

  const payload = (await readZoteroResponse(response)) as ZoteroWriteResponse<{
    key?: string;
    data?: { key?: string };
  }>;

  if (!response.ok) {
    throw new ZoteroSyncError(zoteroFailureMessage("sync", response, payload.failed ?? payload), {
      status: response.status === 401 || response.status === 403 ? 502 : 400,
      code: "ZOTERO_ITEM_SYNC_FAILED",
      details: payload.failed ?? payload,
    });
  }

  let created = 0;
  const successful = payload.successful ?? {};
  for (const [index, result] of Object.entries(successful)) {
    const item = papers[Number(index)];
    const key = result.key ?? result.data?.key;
    if (item?.id && key) {
      await updateItemZoteroKey(item.id, key);
      created += 1;
    }
  }

  return {
    created,
    skipped: allPapers.length - created,
    ignoredNonPapers,
    collections: Object.keys(collectionMap).length,
  };
}
