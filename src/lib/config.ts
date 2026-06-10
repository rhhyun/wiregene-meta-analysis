export const config = {
  databaseUrl:
    process.env.TURSO_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "file:research-briefing.db",
  databaseAuthToken:
    process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN ?? undefined,
  reportStorageBackend: process.env.REPORT_STORAGE_BACKEND ?? "local-json",
  reportStorageLocalPath:
    process.env.REPORT_STORAGE_LOCAL_PATH ?? ".data/research-briefing-storage.json",
  googleDriveClientId: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
  googleDriveClientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "",
  googleDriveRefreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN ?? "",
  googleDriveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID ?? "",
  googleDriveDatabaseFileId:
    process.env.GOOGLE_DRIVE_DATABASE_FILE_ID ?? process.env.GOOGLE_DRIVE_FILE_ID ?? "",
  googleDriveDatabaseFilename:
    process.env.GOOGLE_DRIVE_DATABASE_FILENAME ?? "research-briefing-database.json",
  appBaseUrl: process.env.APP_BASE_URL ?? "https://search.wiregene.com",
  cronSecret: process.env.CRON_SECRET ?? "",
  ncbiEmail: process.env.NCBI_EMAIL ?? "",
  ncbiTool: process.env.NCBI_TOOL ?? "research-briefing-platform",
  ncbiApiKey: process.env.NCBI_API_KEY ?? "",
  scopusApiKey: process.env.SCOPUS_API_KEY ?? "",
  webOfScienceApiKey: process.env.WEB_OF_SCIENCE_API_KEY ?? "",
  embaseApiKey: process.env.EMBASE_API_KEY ?? "",
  cochraneApiKey: process.env.COCHRANE_API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-5-nano",
  zoteroApiKey: process.env.ZOTERO_API_KEY ?? "",
  zoteroLibraryType: process.env.ZOTERO_LIBRARY_TYPE ?? "user",
  zoteroLibraryId: process.env.ZOTERO_LIBRARY_ID ?? "",
  zoteroCollectionKey: process.env.ZOTERO_COLLECTION_KEY ?? "",
  zoteroRootCollectionName:
    process.env.ZOTERO_ROOT_COLLECTION_NAME ?? "Research Briefings",
  zoteroTopicCollectionMapJson: process.env.ZOTERO_TOPIC_COLLECTION_MAP_JSON ?? "",
  zoteroAutoCreateCollections:
    process.env.ZOTERO_AUTO_CREATE_COLLECTIONS?.toLowerCase() !== "false",
};

export function isProduction() {
  return process.env.NODE_ENV === "production";
}
