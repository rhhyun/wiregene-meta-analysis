import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import {
  readDatabaseTextFromGoogleDrive,
  writeDatabaseTextToGoogleDrive,
} from "./google-drive-storage";
import { getGoogleDriveAuthMode } from "./google-drive-config";
import { defaultTopicDraft, normalizeTopicProfiles } from "./topic-tools";
import type { BriefingItem, ReportWithItems, ResearchReport, TopicProfile } from "./types";

type ReportRecord = ResearchReport & { itemIds: string[] };

type StorageData = {
  topics: TopicProfile[];
  reports: ReportRecord[];
  items: BriefingItem[];
  reportItems: Record<string, string[]>;
};

export type ReportStorageAdapter = {
  ensure(): Promise<void>;
  seedDefaultTopics(): Promise<void>;
  getEnabledTopics(): Promise<TopicProfile[]>;
  setEnabledTopics(topics: TopicProfile[]): Promise<TopicProfile[]>;
  saveReport(
    report: Omit<ResearchReport, "id"> & { id?: string },
    items: BriefingItem[],
  ): Promise<ReportWithItems>;
  listReports(limit?: number): Promise<ResearchReport[]>;
  getReportById(id: string): Promise<ReportWithItems | null>;
  getLatestReport(): Promise<ReportWithItems | null>;
  updateItemZoteroKey(itemId: string, zoteroKey: string): Promise<void>;
};

const emptyData = (): StorageData => ({
  topics: [],
  reports: [],
  items: [],
  reportItems: {},
});

function itemId(kind: string, sourceId: string) {
  return crypto.createHash("sha256").update(`${kind}:${sourceId}`).digest("hex");
}

function normalizeItem(item: BriefingItem): BriefingItem {
  return {
    ...item,
    id: item.id ?? itemId(item.kind, item.sourceId),
    authors: item.authors ?? [],
    tags: item.tags ?? [],
  };
}

function reportWithoutItems(report: ReportRecord): ResearchReport {
  return {
    id: report.id,
    title: report.title,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    generatedAt: report.generatedAt,
    summary: report.summary,
    status: report.status,
    model: report.model,
    raw: report.raw,
  };
}

function safeStoragePath() {
  return path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.REPORT_STORAGE_LOCAL_PATH ?? ".data/research-briefing-storage.json",
  );
}

abstract class JsonFileStorageAdapter implements ReportStorageAdapter {
  private ready?: Promise<void>;

  protected abstract readJsonFile(): Promise<string | null>;
  protected abstract writeJsonFile(contents: string): Promise<void>;

  async ensure() {
    if (!this.ready) {
      this.ready = (async () => {
        const current = await this.readJsonFile();
        if (!current) {
          await this.writeData(emptyData());
          return;
        }

        try {
          this.normalizeData(JSON.parse(current));
        } catch {
          await this.writeData(emptyData());
        }
      })();
    }

    await this.ready;
  }

  async seedDefaultTopics() {
    const data = await this.readData();
    if (data.topics.length > 0) return;

    data.topics = defaultTopicDraft();
    await this.writeData(data);
  }

  async getEnabledTopics() {
    await this.seedDefaultTopics();
    const data = await this.readData();
    return [...data.topics].sort((a, b) => a.name.localeCompare(b.name));
  }

  async setEnabledTopics(topics: TopicProfile[]) {
    const data = await this.readData();
    data.topics = normalizeTopicProfiles(topics);
    await this.writeData(data);
    return [...data.topics].sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveReport(
    report: Omit<ResearchReport, "id"> & { id?: string },
    items: BriefingItem[],
  ) {
    const data = await this.readData();
    const id = report.id ?? crypto.randomUUID();
    const storedItems: BriefingItem[] = [];

    for (const item of items) {
      const normalized = normalizeItem(item);
      const existingIndex = data.items.findIndex(
        (stored) => stored.kind === normalized.kind && stored.sourceId === normalized.sourceId,
      );
      if (existingIndex >= 0) {
        data.items[existingIndex] = {
          ...data.items[existingIndex],
          ...normalized,
          zoteroKey: normalized.zoteroKey ?? data.items[existingIndex].zoteroKey ?? null,
        };
        storedItems.push(data.items[existingIndex]);
      } else {
        data.items.push(normalized);
        storedItems.push(normalized);
      }
    }

    const itemIds = storedItems.map((item) => item.id ?? "");
    const storedReport: ReportRecord = {
      id,
      title: report.title,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      generatedAt: report.generatedAt,
      summary: report.summary,
      status: report.status,
      model: report.model,
      raw: report.raw,
      itemIds,
    };

    data.reports = data.reports.filter((existing) => existing.id !== id);
    data.reports.push(storedReport);
    data.reportItems[id] = itemIds;
    await this.writeData(data);

    return { ...reportWithoutItems(storedReport), items: storedItems };
  }

  async listReports(limit = 8) {
    const data = await this.readData();
    return data.reports
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
      .slice(0, limit)
      .map(reportWithoutItems);
  }

  async getReportById(id: string) {
    const data = await this.readData();
    const report = data.reports.find((candidate) => candidate.id === id);
    if (!report) return null;

    const itemIds = data.reportItems[id] ?? report.itemIds ?? [];
    const items = itemIds
      .map((itemIdValue) => data.items.find((item) => item.id === itemIdValue))
      .filter(Boolean) as BriefingItem[];

    return { ...reportWithoutItems(report), items };
  }

  async getLatestReport() {
    const [latest] = await this.listReports(1);
    return latest ? this.getReportById(latest.id) : null;
  }

  async updateItemZoteroKey(itemIdValue: string, zoteroKey: string) {
    const data = await this.readData();
    data.items = data.items.map((item) =>
      item.id === itemIdValue ? { ...item, zoteroKey } : item,
    );
    await this.writeData(data);
  }

  private async readData() {
    await this.ensure();
    const raw = await this.readJsonFile();
    if (!raw) return emptyData();
    return this.normalizeData(JSON.parse(raw));
  }

  private async writeData(data: StorageData) {
    await this.writeJsonFile(JSON.stringify(data, null, 2));
  }

  private normalizeData(value: unknown): StorageData {
    const partial = typeof value === "object" && value !== null ? (value as Partial<StorageData>) : {};
    return {
      topics: Array.isArray(partial.topics) ? partial.topics : [],
      reports: Array.isArray(partial.reports) ? partial.reports : [],
      items: Array.isArray(partial.items) ? partial.items : [],
      reportItems:
        partial.reportItems && typeof partial.reportItems === "object" ? partial.reportItems : {},
    };
  }
}

class LocalFileStorageAdapter extends JsonFileStorageAdapter {
  private readonly filePath = safeStoragePath();

  protected async readJsonFile() {
    return readLocalJsonFile(this.filePath);
  }

  protected async writeJsonFile(contents: string) {
    await writeLocalJsonFile(this.filePath, contents);
  }
}

class GoogleDriveStorageAdapter extends JsonFileStorageAdapter {
  protected async readJsonFile() {
    if (!hasGoogleDriveConfig()) {
      ensureGoogleDriveFallbackAllowed();
      return readLocalJsonFile();
    }

    return readDatabaseTextFromGoogleDrive();
  }

  protected async writeJsonFile(contents: string) {
    if (!hasGoogleDriveConfig()) {
      ensureGoogleDriveFallbackAllowed();
      await writeLocalJsonFile(safeStoragePath(), contents);
      return;
    }

    await writeDatabaseTextToGoogleDrive(contents);
    if (process.env.GOOGLE_DRIVE_LOCAL_MIRROR_PATH) {
      await writeLocalJsonFile(
        path.resolve(
          /* turbopackIgnore: true */ process.cwd(),
          process.env.GOOGLE_DRIVE_LOCAL_MIRROR_PATH,
        ),
        contents,
      );
    }
  }
}

function hasGoogleDriveConfig() {
  return Boolean(getGoogleDriveAuthMode());
}

function ensureGoogleDriveFallbackAllowed() {
  if (process.env.GITHUB_ACTIONS === "true") {
    throw new Error(
      [
        "Google Drive storage is selected, but GitHub Actions secrets are incomplete.",
        "For personal Google Drive, set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, and GOOGLE_DRIVE_REFRESH_TOKEN.",
        "For service accounts, set GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON plus GOOGLE_DRIVE_FOLDER_ID or GOOGLE_DRIVE_DATABASE_FILE_ID.",
      ].join(" "),
    );
  }
}

async function readLocalJsonFile(filePath = safeStoragePath()) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeLocalJsonFile(filePath: string, contents: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, "utf8");
}

const globalForStorage = globalThis as unknown as {
  reportStorageAdapter?: ReportStorageAdapter;
};

export function isJsonStorageEnabled() {
  const backend = (process.env.REPORT_STORAGE_BACKEND ?? "local-json").toLowerCase();
  return backend === "local-json" || backend === "google-drive";
}

export function getReportStorageAdapter() {
  if (!globalForStorage.reportStorageAdapter) {
    const backend = (process.env.REPORT_STORAGE_BACKEND ?? "local-json").toLowerCase();
    globalForStorage.reportStorageAdapter =
      backend === "google-drive"
        ? new GoogleDriveStorageAdapter()
        : new LocalFileStorageAdapter();
  }

  return globalForStorage.reportStorageAdapter;
}
