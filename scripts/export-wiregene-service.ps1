param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("meta", "portal")]
  [string]$Service,

  [string]$TargetDir,
  [string]$RepoUrl,
  [switch]$InitGit,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$SourceDir = Split-Path -Parent $PSScriptRoot
$serviceProjectName = if ($Service -eq "meta") { "wiregene-meta-analysis" } else { "wiregene-portal" }

if (-not $TargetDir) {
  $TargetDir = Join-Path (Split-Path -Parent $SourceDir) $serviceProjectName
}

$resolvedSource = (Resolve-Path -LiteralPath $SourceDir).Path
$targetParent = Split-Path -Parent $TargetDir
if (-not (Test-Path -LiteralPath $targetParent)) {
  New-Item -ItemType Directory -Force -Path $targetParent | Out-Null
}

if (Test-Path -LiteralPath $TargetDir) {
  if (-not $Force) {
    throw "Target already exists: $TargetDir. Re-run with -Force to replace generated files."
  }

  $resolvedTarget = (Resolve-Path -LiteralPath $TargetDir).Path
  if ($resolvedTarget -eq $resolvedSource -or $resolvedSource.StartsWith($resolvedTarget, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to overwrite source repository: $resolvedTarget"
  }

  Remove-Item -LiteralPath $TargetDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

function Copy-RepoFile {
  param([string]$RelativePath)
  $sourcePath = Join-Path $SourceDir $RelativePath
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    return
  }
  $targetPath = Join-Path $TargetDir $RelativePath
  $targetDirPath = Split-Path -Parent $targetPath
  if (-not (Test-Path -LiteralPath $targetDirPath)) {
    New-Item -ItemType Directory -Force -Path $targetDirPath | Out-Null
  }
  Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
}

function Copy-RepoDir {
  param([string]$RelativePath)
  $sourcePath = Join-Path $SourceDir $RelativePath
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    return
  }
  $targetPath = Join-Path $TargetDir $RelativePath
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $targetPath) | Out-Null
  Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Recurse -Force
}

$rootFiles = @(
  ".gitattributes",
  ".gitignore",
  ".vercelignore",
  "eslint.config.mjs",
  "next.config.ts",
  "next-env.d.ts",
  "package.json",
  "package-lock.json",
  "postcss.config.mjs",
  "tsconfig.json",
  "vercel.json"
)

foreach ($file in $rootFiles) {
  Copy-RepoFile $file
}

Copy-RepoDir "src"
Copy-RepoDir "public"
Copy-RepoDir "docs"
Copy-RepoDir "scripts"
Copy-RepoDir (Join-Path "synology\docker" $Service)
Copy-RepoDir $Service

$serviceEnv = Join-Path $TargetDir (Join-Path $Service ".env.example")
if (Test-Path -LiteralPath $serviceEnv) {
  Copy-Item -LiteralPath $serviceEnv -Destination (Join-Path $TargetDir ".env.example") -Force
}

$serviceTitle = if ($Service -eq "meta") { "Wiregene Meta" } else { "Wiregene Portal" }
$serviceHost = if ($Service -eq "meta") { "meta.wiregene.com" } else { "portal.wiregene.com" }
$repoUrlForReadme = if ($RepoUrl) { $RepoUrl } else { "https://github.com/rhhyun/$serviceProjectName.git" }

@"
# $serviceTitle

Standalone repository exported from `research-briefing-platform`.

## Service Boundary

- Host: https://$serviceHost
- App mode: $Service
- Synology source directory: /volume1/docker/$serviceProjectName
- Runtime directory: /volume1/docker/$Service

The source is intentionally copied rather than shared with `search.wiregene.com`
so deployments, Vercel aliases, Synology containers, and environment variables
cannot overwrite each other.

## First Commit

```powershell
git init
git add .
git commit -m "Initialize $serviceTitle standalone app"
git branch -M main
git remote add origin $repoUrlForReadme
git push -u origin main
```

Set `WIREGENE_APP_MODE=$Service` in Vercel and Synology.
"@ | Set-Content -LiteralPath (Join-Path $TargetDir "SERVICE.md") -Encoding UTF8

if ($InitGit) {
  git -C $TargetDir init
  git -C $TargetDir add .
  git -C $TargetDir commit -m "Initialize $serviceTitle standalone app"
  git -C $TargetDir branch -M main
  if ($RepoUrl) {
    git -C $TargetDir remote add origin $RepoUrl
  }
}

Write-Host "Exported $Service service to $TargetDir"
