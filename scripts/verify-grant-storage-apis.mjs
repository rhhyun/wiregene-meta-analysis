import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const host = "127.0.0.1";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const nextMode = process.env.VERIFY_NEXT_MODE === "dev" ? "dev" : "start";
const defaultStorageFiles = [
  ".data/grant-keyword-presets.json",
  ".data/grant-exclusions.json",
  ".data/grant-candidates.json",
];

const testRunId = `verify-${Date.now()}`;
const serverLogs = [];

function log(message) {
  console.log(message);
}

function snapshotFiles(relativePaths) {
  return new Map(
    relativePaths.map((relativePath) => {
      const absolutePath = path.join(rootDir, relativePath);
      return [
        absolutePath,
        existsSync(absolutePath)
          ? { existed: true, data: readFileSync(absolutePath) }
          : { existed: false, data: null },
      ];
    }),
  );
}

function restoreFiles(snapshot) {
  for (const [absolutePath, entry] of snapshot.entries()) {
    if (entry.existed) {
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, entry.data);
    } else {
      rmSync(absolutePath, { force: true });
    }
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function serverEnv(mode) {
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
  env.REPORT_STORAGE_BACKEND = "local-json";
  env.GRANT_STORAGE_BACKEND = "local-json";
  delete env.GRANT_KEYWORD_PRESET_STORAGE_PATH;
  delete env.GRANT_EXCLUSION_STORAGE_PATH;
  delete env.GRANT_CANDIDATE_STORAGE_PATH;

  if (mode === "blank") {
    env.GRANT_KEYWORD_PRESET_STORAGE_PATH = "";
    env.GRANT_EXCLUSION_STORAGE_PATH = "";
    env.GRANT_CANDIDATE_STORAGE_PATH = "";
  }

  return env;
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${baseUrl}/api/grants/keyword-presets`, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Next server did not become ready. Recent logs:\n${serverLogs.slice(-40).join("")}`);
}

async function startServer(mode) {
  const port = await getFreePort();
  const baseUrl = `http://${host}:${port}`;
  const command = process.platform === "win32" ? "cmd.exe" : npmCommand;
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", npmCommand, "run", nextMode, "--", "--hostname", host, "--port", String(port)]
      : ["run", nextMode, "--", "--hostname", host, "--port", String(port)];
  const child = spawn(command, args, {
    cwd: rootDir,
    env: serverEnv(mode),
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => serverLogs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => serverLogs.push(chunk.toString()));

  await waitForServer(baseUrl, child);
  return { baseUrl, child };
}

function stopServer(child) {
  if (!child || child.exitCode !== null) return;

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      child.kill();
      return;
    }
  }

  child.kill("SIGTERM");
}

async function fetchJson(baseUrl, route, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.body !== undefined && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  return { status: response.status, ok: response.ok, json };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function minimalOpportunity(suffix) {
  return {
    id: `candidate-${suffix}`,
    source: "verification",
    title: `Storage verification candidate ${suffix}`,
    url: "about:blank",
    ministry: null,
    agency: null,
    noticeNumber: null,
    announcedAt: null,
    applicationStart: null,
    applicationEnd: null,
    dDay: null,
    status: "open",
    statusLabel: "Open",
    solicitationType: null,
    topicMatches: [],
    expandedKeywords: [],
    relevanceScore: 0,
    relevanceReason: "verification payload",
    eligibleEntities: ["school"],
    eligibilityNote: "verification",
    actionItems: [],
    excerpt: null,
  };
}

async function runKeywordPresetChecks(baseUrl, sourceGroup) {
  const keyword = `SCI ${testRunId}`;
  const post = await fetchJson(baseUrl, "/api/grants/keyword-presets", {
    method: "POST",
    body: {
      sourceGroup,
      baseKeywords: [` ${keyword} `],
    },
  });
  assert(post.status === 200, `keyword preset POST failed: ${post.status} ${JSON.stringify(post.json)}`);
  assert(post.json.preset?.sourceGroup === sourceGroup, "keyword preset response sourceGroup mismatch");
  assert(post.json.preset?.baseKeywords?.[0] === keyword, "keyword preset response did not preserve normalized keyword");

  const getOne = await fetchJson(
    baseUrl,
    `/api/grants/keyword-presets?sourceGroup=${encodeURIComponent(sourceGroup)}`,
  );
  assert(getOne.status === 200, `keyword preset GET one failed: ${getOne.status} ${JSON.stringify(getOne.json)}`);
  assert(getOne.json.preset?.baseKeywords?.[0] === keyword, "keyword preset GET one did not return saved keyword");

  const getAll = await fetchJson(baseUrl, "/api/grants/keyword-presets");
  assert(getAll.status === 200, `keyword preset GET all failed: ${getAll.status} ${JSON.stringify(getAll.json)}`);
  assert(
    Array.isArray(getAll.json.presets) &&
      getAll.json.presets.some((preset) => preset.sourceGroup === sourceGroup && preset.baseKeywords?.[0] === keyword),
    "keyword preset GET all did not include saved preset",
  );

  log(`PASS keyword-presets ${sourceGroup}: POST/GET saved ${keyword}`);
}

async function runExclusionChecks(baseUrl, sourceGroup) {
  const title = `Storage verification exclusion ${testRunId} ${sourceGroup}`;
  const post = await fetchJson(baseUrl, "/api/grants/exclusions", {
    method: "POST",
    body: {
      sourceGroup,
      opportunity: { title },
      reason: "verification",
    },
  });
  assert(post.status === 200, `exclusion POST failed: ${post.status} ${JSON.stringify(post.json)}`);
  assert(post.json.exclusion?.sourceGroup === sourceGroup, "exclusion response sourceGroup mismatch");
  assert(post.json.exclusion?.title === title, "exclusion response title mismatch");

  const getAll = await fetchJson(baseUrl, "/api/grants/exclusions");
  assert(getAll.status === 200, `exclusion GET failed: ${getAll.status} ${JSON.stringify(getAll.json)}`);
  assert(
    Array.isArray(getAll.json.exclusions) &&
      getAll.json.exclusions.some((exclusion) => exclusion.id === post.json.exclusion.id),
    "exclusion GET did not include saved exclusion",
  );

  const crossKeywordPost = await fetchJson(baseUrl, "/api/grants/exclusions", {
    method: "POST",
    body: {
      sourceGroup,
      opportunity: {
        id: `iris:verify-${testRunId}`,
        source: "IRIS",
        title: `Keyword-independent exclusion ${testRunId}`,
        url: `https://www.iris.go.kr/contents/retrieveBsnsAncmView.do?ancmPrg=ancmIng&ancmId=verify-${testRunId}&utm_source=keyword-a`,
      },
      reason: "verification-keyword-independent",
    },
  });
  assert(crossKeywordPost.status === 200, `keyword-independent exclusion POST failed: ${crossKeywordPost.status}`);

  log(`PASS exclusions ${sourceGroup}: POST/GET saved ${post.json.exclusion.id}`);
}

async function runCandidateChecks(baseUrl) {
  const invalidPost = await fetchJson(baseUrl, "/api/grants/candidates", {
    method: "POST",
    body: { opportunity: {} },
  });
  assert(invalidPost.status === 400, `candidate invalid POST expected 400, got ${invalidPost.status}`);
  assert(invalidPost.json.details, "candidate invalid POST did not include details");

  const opportunity = minimalOpportunity(testRunId);
  const save = await fetchJson(baseUrl, "/api/grants/candidates", {
    method: "POST",
    body: {
      sourceGroup: "central",
      opportunity,
      notes: "verification",
    },
  });
  assert(save.status === 200, `candidate POST failed: ${save.status} ${JSON.stringify(save.json)}`);
  assert(save.json.candidate?.id, "candidate POST did not return candidate.id");
  assert(!save.json.candidate?.rfpAnalysisError, "candidate POST should save before RFP analysis");
  assert(
    save.json.candidate?.preparationDocuments?.some((document) => document.sourceUrl),
    "candidate POST did not return actionable preparation document links",
  );

  const candidateId = save.json.candidate.id;
  const list = await fetchJson(baseUrl, "/api/grants/candidates");
  assert(list.status === 200, `candidate GET failed: ${list.status} ${JSON.stringify(list.json)}`);
  assert(
    Array.isArray(list.json.candidates) && list.json.candidates.some((candidate) => candidate.id === candidateId),
    "candidate GET did not include saved candidate",
  );

  const analysis = await fetchJson(baseUrl, "/api/grants/candidates", {
    method: "PATCH",
    body: { id: candidateId, action: "analyze-rfp" },
  });
  assert(analysis.status === 200, `candidate PATCH analyze failed: ${analysis.status} ${JSON.stringify(analysis.json)}`);
  assert(
    analysis.json.candidate?.rfpAnalysisError,
    "candidate PATCH did not surface expected RFP analysis error",
  );

  const invalidDelete = await fetchJson(baseUrl, "/api/grants/candidates", { method: "DELETE" });
  assert(invalidDelete.status === 400, `candidate invalid DELETE expected 400, got ${invalidDelete.status}`);
  assert(invalidDelete.json.details, "candidate invalid DELETE did not include details");

  const remove = await fetchJson(
    baseUrl,
    `/api/grants/candidates?id=${encodeURIComponent(candidateId)}&exclude=true`,
    { method: "DELETE" },
  );
  assert(remove.status === 200, `candidate DELETE failed: ${remove.status} ${JSON.stringify(remove.json)}`);
  assert(remove.json.removed === true, "candidate DELETE did not return removed=true");
  assert(remove.json.candidate?.id === candidateId, "candidate DELETE response candidate.id mismatch");
  assert(remove.json.exclusionError === null, "candidate DELETE returned an exclusionError");

  const exclusions = await fetchJson(baseUrl, "/api/grants/exclusions");
  assert(
    exclusions.json.exclusions?.some(
      (exclusion) =>
        exclusion.reason === "removed-from-candidate-board" &&
        exclusion.title === opportunity.title,
    ),
    "candidate DELETE with exclude=true did not write an exclusion",
  );

  log(`PASS candidates blank-path: invalid details, save, list, analyze, delete, exclusion ${candidateId}`);
}

async function runSuite(mode) {
  const snapshot = snapshotFiles(defaultStorageFiles);
  const { baseUrl, child } = await startServer(mode);
  try {
    log(`START suite=${mode} nextMode=${nextMode} baseUrl=${baseUrl}`);

    if (mode === "default") {
      await runKeywordPresetChecks(baseUrl, "central");
      await runExclusionChecks(baseUrl, "central");
    } else {
      await runKeywordPresetChecks(baseUrl, "investment");
      await runExclusionChecks(baseUrl, "investment");
      await runCandidateChecks(baseUrl);
    }
  } finally {
    stopServer(child);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    restoreFiles(snapshot);
  }
}

await runSuite("default");
await runSuite("blank");

log("PASS grant storage API verification completed");
