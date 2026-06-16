# Wiregene Meta 작업 백업

작성일: 2026-06-12

## Canonical workspace rule

2026-06-15부터 Codex와 사용자는 아래 폴더만 `meta.wiregene.com` 실제 앱 작업 기준으로 사용한다.

```text
C:\Users\HyunJK\Documents\GitHub\meta.wiregene.com
```

규칙:

- 앞으로 실제 코드 수정, 빌드, 커밋, push는 반드시 `C:\Users\HyunJK\Documents\GitHub\meta.wiregene.com`에서만 한다.
- `C:\Users\HyunJK\Documents\Playground\research-briefing-platform\wiregene-meta-analysis`는 이전 임시 작업 폴더이며 새 작업 기준으로 사용하지 않는다.
- `C:\Users\HyunJK\Documents\GitHub\wiregene-meta-analysis`는 오래된 복사본이며 새 작업 기준으로 사용하지 않는다.
- `C:\Users\HyunJK\Documents\Meta.wiregene.com`은 문서/기획/handoff workspace이며 실제 Next.js 앱 소스 기준이 아니다.
- 헷갈릴 경우 `src/lib/version.ts`가 `BRIEFING_VERSION = "1.65"` 이상인지 먼저 확인한다.
- 작업 시작 전 `git -C C:\Users\HyunJK\Documents\GitHub\meta.wiregene.com status --short`와 `git -C C:\Users\HyunJK\Documents\GitHub\meta.wiregene.com pull --ff-only origin main`을 확인한다.
- 작업 종료 전 lint/typecheck/build, `backup.md` 업데이트, commit/push, Synology 작업스케줄러 명령 확인을 수행한다.

## 2026-06-16 v1.70 Study title and Search Design workflow fix

User-reported problems from another PC at UI v1.69:

- Three studies are in progress, but two study titles are cut in the left menu.
- `Evidence-informed prediction of preventable post-traumatic disability` still errors when `Search Design` is opened.
- `Search log for this topic` effectively shows only PubMed, non-PubMed Open links are not useful, and too many DBs are listed before the researcher chooses them.
- Current AI model setting is `gpt-5-nano`; user asked whether a more suitable API/model should be used.

Changes made in the actual canonical app repo:

- `src/components/MetaStudyWorkspace.tsx`
  - Split study display title from left-menu label.
  - Left menu now shows concise labels such as `Post-traumatic disability` or `Musician PRMD pain`.
  - Main project header uses the full title via `projectFullTitle()` and no longer depends on a truncated `shortTitle`.
  - New topic creation no longer truncates `title`; only the menu label is shortened.
  - Added a known repair for the stored title `Evidence-informed prediction of preventable post-traumatic disability`.
  - Canonical DB list is fixed to PubMed, Embase, Scopus, Web of Science, and Cochrane.
  - New topics default to PubMed only; the researcher chooses additional DBs in `Search Design`.
  - Added DB selection state and `Generate draft DB queries`.
  - Search log, import log, and CSV export now use only the selected DBs.
  - Added canonical DB normalization for PubMed/PuvMed/MEDLINE, Embase, Scopus, Web of Science/WoS, and Cochrane/CENTRAL.
  - Fixed the likely Search Design crash by escaping database aliases before building regular expressions.
  - Non-PubMed DBs now get generated draft syntax from the project query when possible.
  - Open links are now limited to selected DBs: PubMed/Cochrane open with query URLs; Embase/Scopus/Web of Science open advanced search pages and rely on the Copy query button.
- `src/lib/version.ts`
  - UI version `Ver 1.69` -> `Ver 1.70 | 2026 copyright by JK Hyun`.
- `package.json`, `package-lock.json`
  - app package version `0.1.34` -> `0.1.35`.

Verification during this work:

```text
npx tsc --noEmit: pass.
npm run lint: pass.
npm run build: pass.
Browser verification at http://127.0.0.1:3224:
- Ver 1.70 displayed.
- Left menu displayed `Post-traumatic disability`; main header displayed full title `Evidence-informed prediction of preventable post-traumatic disability`.
- Search Design opened without console errors for a project seeded with `PubMed (MEDLINE)`.
- DB selector showed only PubMed, Embase, Scopus, Web of Science, and Cochrane.
- Default selected DB was PubMed; after selecting Embase and Scopus, search log/import log showed PubMed, Embase, and Scopus only.
- `Generate draft DB queries` stored generated PubMed/Embase/Scopus query overrides.
- Open links resolved to PubMed query URL, Embase advanced search, and Scopus advanced search.
```

Model/API note:

- The OpenAI API key itself does not change by model. For this app, `gpt-5-nano` is acceptable for low-cost simple parsing, but `gpt-5.4-mini` is the better default for structured study-plan parsing/search-query generation. Use `gpt-5.5` selectively for hard protocol/full-text reasoning where quality is more important than cost.

Synology deploy/run command after push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

Verification:

```text
npx tsc --noEmit: pass.
npm run lint: pass.
npm run build: pass.
Browser verification at http://127.0.0.1:3225:
- Ver 1.71 displayed.
- Left sidebar displayed the study-list storage location notice.
- /api/meta-analysis/projects GET returned projects plus storage diagnostics.
- Temporary PUT created one shared project, GET returned count=1, reset PUT returned ok=true.
- Browser console error log was empty.
```

No new Synology Task Scheduler job is required for this UI/search fix; use the existing pull/start command after the GitHub push.

## 2026-06-17 v1.71 Shared study-list storage fix

User-reported problem:

- On another PC, `meta.wiregene.com` showed only one built-in study even though three studies had been created previously.

Root cause:

- The previous storage work saved project CSV/export files to project folders and added a server API for the study list.
- However, the study-list registry still defaulted to local JSON at `.data/meta/user-study-projects.json`.
- On Synology/local Docker that can be shared if the same server/data volume is used.
- On Vercel/serverless or a browser-only workflow, new user-created studies can remain in browser `localStorage` or fail server write silently, so another PC sees only the built-in Study 1.

Changes made:

- `src/lib/meta-project-storage.ts`
  - Added shared user-study-list storage backend support.
  - New env:
    - `META_USER_PROJECTS_STORAGE_BACKEND=local-json|google-drive`
    - `META_USER_PROJECTS_FILE=.data/meta/user-study-projects.json`
    - `META_USER_PROJECTS_DRIVE_FILENAME=meta-user-study-projects.json`
    - `META_USER_PROJECTS_DRIVE_FILE_ID=`
  - On serverless with Google Drive credentials, the study list automatically uses Google Drive if no explicit backend is set.
  - Google Drive corrupt JSON is backed up before resetting to an empty registry.
- `src/app/api/meta-analysis/projects/route.ts`
  - GET/PUT now return storage location diagnostics.
  - GET/PUT return clear 500 JSON errors instead of falling through silently.
- `src/components/MetaStudyWorkspace.tsx`
  - Study-list save/load failures are now shown in the left sidebar.
  - Successful load/save shows the active storage backend/path.
  - Existing local browser projects are still merged back to the shared registry when that PC opens the updated app.
- `.env.example`, `synology/docker/meta/.env.example`, `scripts/synology-start-meta.sh`, `SERVICE.md`
  - Documented and wired the new shared study-list storage env variables.
- `src/lib/version.ts`
  - UI version `Ver 1.70` -> `Ver 1.71 | 2026 copyright by JK Hyun`.
- `package.json`, `package-lock.json`
  - app package version `0.1.35` -> `0.1.36`.

Operational note:

- If the two missing studies exist only in one PC's browser localStorage, they cannot be reconstructed from GitHub alone.
- After v1.71 is deployed and shared storage is configured, open `meta.wiregene.com` once on the PC that still shows all three studies. The app will merge that local list into the shared registry.
- Then other PCs should reload and see the same study list.

Recommended Vercel/serverless env for multi-PC study list sync:

```text
META_USER_PROJECTS_STORAGE_BACKEND=google-drive
META_USER_PROJECTS_DRIVE_FILENAME=meta-user-study-projects.json
GOOGLE_DRIVE_CLIENT_ID=<oauth-client-id>
GOOGLE_DRIVE_CLIENT_SECRET=<oauth-client-secret>
GOOGLE_DRIVE_REFRESH_TOKEN=<oauth-refresh-token>
GOOGLE_DRIVE_FOLDER_ID=<target-folder-id>
```

Synology/local Docker can use:

```text
META_USER_PROJECTS_STORAGE_BACKEND=local-json
META_USER_PROJECTS_FILE=.data/meta/user-study-projects.json
```

Synology deploy/run command after push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-15 New topic study-isolation fix

사용자 지적:

```text
새로 생성한 주제의 PRISMA protocol에 "악기 분류보다 exposure definition을 먼저 고정합니다"라는 엉뚱한 문자가 있습니다. 기존 주제와 믹스되어 진행하면 절대로 안됩니다
```

원인:

- `ProtocolStage`의 header title/detail이 기존 Study 1(오케스트라/악기 비대칭 PRMD) 전용 문구로 하드코딩되어 있었다.
- Search, Screening, Extraction, Analysis, Manuscript, References에도 일부 Study 1 전용 설명 문구와 예시가 하드코딩되어 새로 생성한 user project에 노출될 위험이 있었다.

변경:

- `src/components/MetaStudyWorkspace.tsx`
  - `isOrchestralPainProject()` 분기를 추가해 `orchestral-prmd-asymmetry`일 때만 기존 Study 1 전용 문구를 사용한다.
  - 신규/사용자 생성 project는 generic systematic-review copy만 사용한다.
  - Protocol title은 신규 주제에서 `연구 질문과 eligibility criteria를 먼저 고정합니다`로 표시된다.
  - Protocol feature heading은 신규 주제에서 `Exposure / intervention criteria`로 표시된다.
  - Search/Screening/Workbook/Extraction/Analysis/Manuscript/References stage도 신규 주제용 generic copy로 분리했다.
  - 새 주제에서는 기존 연구의 DB count, Excel sheet, PRMD/악기/biomechanics 문구가 자동 표시되지 않도록 했다.
- `package.json`, `package-lock.json`
  - app package version `0.1.30` -> `0.1.31`.
- `src/lib/version.ts`
  - UI version `Ver 1.65` -> `Ver 1.66 | 2026 copyright by JK Hyun`.

검증:

```text
npm ci: completed; existing audit warning remains 4 vulnerabilities.
npx tsc --noEmit: pass.
npm run lint: pass.
npm run build: pass.
Browser verification with WIREGENE_APP_MODE=meta at http://127.0.0.1:3222:
- Created a new test topic.
- New Protocol screen showed "연구 질문과 eligibility criteria를 먼저 고정합니다".
- New Protocol screen did not show "악기 분류보다 exposure definition을 먼저 고정합니다".
- New Protocol screen did not show "Biomechanical criteria".
- Search, Screening, Extraction, Analysis, Manuscript, References were checked for old Study 1 phrases; none were found in the new topic flow.
```

Synology deploy/run command:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

GitHub update:

```text
Committed and pushed to origin/main:
541b13a Isolate new meta study stage copy
```

## 작업 위치

실제 작업 저장소:

```text
C:\Users\HyunJK\Documents\GitHub\meta.wiregene.com
```

현재 PC 작업 저장소:

```text
C:\Users\HyunJK\Documents\GitHub\meta.wiregene.com
```

원격 저장소:

```text
https://github.com/rhhyun/wiregene-meta-analysis.git
```

주의:

- `C:\Users\HyunJK\Documents\Meta.wiregene.com`은 문서/기획/handoff 폴더이며 실제 Meta 앱 소스는 위 canonical GitHub 폴더에 있다.
- 작업이 끝나면 GitHub에 자동 commit/push한다.
- Synology 자동 배포를 실행하지 못했거나 확인하지 못하면 마지막에 작업 스케줄러 명령을 남긴다.

## 2026-06-15 New topic AI analysis UI actual content fix

사용자 지적:

```text
버전이 문제가 아니라 내용이 안바뀌었습니다
```

원인:

- 앞선 변경은 `C:\Users\HyunJK\Documents\Meta.wiregene.com`의 문서/spec 중심으로 이루어졌다.
- 실제 화면에 보이는 `AI planning prompt 복사`와 `skeleton 복사`는 최신 앱 소스인 `C:\Users\HyunJK\Documents\Playground\research-briefing-platform\wiregene-meta-analysis\src\components\MetaStudyWorkspace.tsx`에 남아 있었다.

변경 내용:

- `src/components/MetaStudyWorkspace.tsx`
  - 신규 주제 화면의 primary action을 `AI 분석 시작`으로 변경.
  - 구상내용 textarea label을 `구상내용 붙여넣기`로 변경.
  - `AI planning prompt 복사` 버튼을 첫 화면 main action에서 제거.
  - `skeleton 복사` 버튼을 제거하고 `고급 옵션: 외부 검토 prompt / 검색식 예시` 안의 `검색식 예시 복사`로 이동.
  - `AI 분석 시작` 클릭 시 `/api/meta-analysis/study-plan/analyze`를 호출해 항목별 draft를 자동 채우도록 연결.
  - AI 분석 후 확인 필요 항목을 화면에 표시.
- `src/app/api/meta-analysis/study-plan/analyze/route.ts`
  - 신규 API route 추가.
  - OpenAI key가 있으면 OpenAI로 연구계획 JSON을 생성.
  - OpenAI key가 없거나 실패하면 규칙 기반 fallback parser로 제목, 질문, population, exposure, outcomes, DB count, eligibility, search block, extraction plan을 채움.
- `package.json`, `package-lock.json`
  - package version `0.1.28` -> `0.1.29`.
- `src/lib/version.ts`
  - UI label `Ver 1.63` -> `Ver 1.64 | 2026 copyright by JK Hyun`.

검증:

```text
npm install: completed; existing dependency audit reports 4 vulnerabilities.
npm run lint: pass.
npx tsc --noEmit: pass.
npm run build: pass.
Build route list includes /api/meta-analysis/study-plan/analyze.
Static code check confirms no visible "AI planning prompt 복사" or "skeleton 복사" main button remains in MetaStudyWorkspace.tsx.
```

제한:

- 이 Codex 세션에서는 Windows background process 생성 권한 문제로 local dev server browser verification을 완료하지 못했다.
- Build는 성공했으므로 배포 가능한 코드 상태는 확인됐다.

Synology deploy/run command:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-15 New topic AI settings and auto-project flow fix

사용자 지적:

```text
신규 주제를 넣었으면 AI 분석 후에 자동 저장, 그리고 다음 단계로 넘어가면서 진행 중인 연구에 추가가 되어야 하는데 지금은 초기 분석, 그것도 AI 분석도 못하고 그 화면에서 더 진행이 안됩니다.
현재 AI 평가 설정은 gpt-5-nano로 분명히 되어 있는데 api key가 없다고하면 얼마나 당황스럽습니까
```

원인:

- 신규 주제 분석 API가 기존 AI 평가 설정 저장소를 사용하지 않고 `config.openaiApiKey` 환경변수만 직접 확인했다.
- 따라서 Meta AI settings 화면에 저장된 key/model이 있어도 신규 주제 분석 route에서는 key가 없는 것처럼 fallback 처리될 수 있었다.
- 신규 주제 draft는 `wiregene-meta-new-topic-draft-v1`에만 저장되고, 왼쪽 `진행 중인 연구` 목록은 정적 `metaStudyProjects` 배열만 렌더링했다.
- 결과적으로 AI 분석 결과가 진행 중인 연구에 추가되거나 다음 Protocol 단계로 넘어가는 구조가 없었다.

변경 내용:

- `src/app/api/meta-analysis/study-plan/analyze/route.ts`
  - `resolveMetaOpenAIConfig()`를 사용하도록 수정했다.
  - 저장된 OpenAI key, 환경변수 key, 저장된 model name을 신규 주제 분석 route에서 동일하게 사용한다.
  - key source를 `saved`, `environment`, `missing`으로 구분해 응답한다.
  - 설정 저장소 읽기 실패와 key 미존재를 구분해 fallback note를 반환한다.
- `src/components/MetaStudyWorkspace.tsx`
  - AI 분석 결과를 `MetaStudyProject`로 변환하는 생성기를 추가했다.
  - 분석 완료 시 draft를 자동 저장하고 `wiregene-meta-user-study-projects-v1`에 사용자 연구로 저장한다.
  - 새 연구를 왼쪽 `진행 중인 연구` 목록 맨 위에 표시한다.
  - 분석 완료 후 새 연구의 `Protocol` 단계로 자동 이동한다.
  - Protocol stage 기본값을 프로젝트별로 생성해, 신규 AI draft가 다음 단계의 editable protocol fields에 반영되도록 했다.
- `package.json`, `package-lock.json`
  - package version `0.1.29` -> `0.1.30`.
- `src/lib/version.ts`
  - UI label `Ver 1.64` -> `Ver 1.65 | 2026 copyright by JK Hyun`.

검증:

```text
npm run lint: pass.
npx tsc --noEmit: pass.
npm run build: pass.
Browser verification: WIREGENE_APP_MODE=meta dev server opened at http://127.0.0.1:3221.
Meta screen displayed Ver 1.65.
New topic screen displayed 신규 주제, 구상내용 붙여넣기, AI 분석 시작, 수정 내용 저장.
Old main-path labels "AI planning prompt 복사" and "skeleton 복사" were not present.
Browser console error/warning log: empty.
```

로컬 API 확인:

```text
POST /api/meta-analysis/study-plan/analyze returned ok=true.
This local dev process had no .data/meta/meta-ai-settings.json and no OpenAI/Meta AI secret environment variables, so apiKeySource=missing and fallback parsing was expected locally.
The route now uses the saved AI settings resolver; Synology/production must run with the same AI settings storage/secret used by the settings panel.
```

Synology deploy/run command:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-15 Why the user still saw Ver 1.64

사용자 지적:

```text
변한게 없고 버전이 1.64인데 왜 이럴까요
```

확인 결과:

- 수정된 실제 소스는 `C:\Users\HyunJK\Documents\Playground\research-briefing-platform\wiregene-meta-analysis`에 있고 여기서는 `BRIEFING_VERSION = "1.65"`가 맞다.
- 하지만 이 변경 6개 파일은 아직 Git commit/push 되지 않은 working tree 상태였다.
- 따라서 Synology/production이 `git pull`을 해도 `Ver 1.65` 코드가 내려갈 수 없었다.
- `localhost:3000`은 Meta 앱이 아니라 `hyunlab-wiregene-platform-frontend` Docker container가 잡고 있었다.
- `C:\Users\HyunJK\Documents\GitHub\wiregene-meta-analysis`는 오래된 복사본이며 `src/components/MetaStudyWorkspace.tsx`에 아직 `skeleton 복사`가 남아 있고 `BRIEFING_VERSION = "1.35"`다.

정리:

- 사용자가 `Ver 1.64`를 본 이유는 새 코드가 실행/배포 서버에 반영되지 않았기 때문이다.
- 반드시 이 repo의 변경사항을 GitHub에 push한 뒤 Synology에서 pull/restart 해야 한다.
- 2026-06-15 후속 정리로 실제 source of truth는 `C:\Users\HyunJK\Documents\GitHub\meta.wiregene.com`으로 이동 및 고정했다.

Required deploy sequence:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

GitHub update:

```text
Committed and pushed to origin/main:
0f33326 Fix meta new topic AI project flow
```

## 2026-06-12 Synology 명령 정정

사용자 오류 보고:

```text
/bin/sh: /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh: No such file or directory
```

원인:

- repo 안에는 `scripts/synology-start-meta.sh`가 있지만, Synology NAS의 `/volume1/docker/wiregene-meta-analysis`에 아직 GitHub repo가 clone/pull 되어 있지 않거나 오래된 checkout이라 해당 파일이 없었다.
- 따라서 `/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh`만 안내하면 첫 실행 또는 checkout 누락 상황에서 실패한다.

앞으로 Synology DSM Task Scheduler에는 아래 bootstrap 명령을 우선 사용한다. 이 명령은 repo clone/pull을 먼저 수행한 뒤 start script를 실행한다.

```sh
/bin/sh -c 'set -eu; export PATH="/usr/local/bin:/usr/bin:/bin:/var/packages/Git/target/bin:/volume1/@appstore/Git/bin:$PATH"; SRC="/volume1/docker/wiregene-meta-analysis"; REPO="https://github.com/rhhyun/wiregene-meta-analysis.git"; command -v git >/dev/null 2>&1 || { echo "git command not found. Install Synology Git package, then rerun."; exit 1; }; mkdir -p /volume1/docker; if [ -d "$SRC/.git" ]; then git -C "$SRC" pull --ff-only origin main; elif [ -e "$SRC" ]; then echo "$SRC exists but is not a git checkout. Move it aside or clone the repo there."; exit 1; else git clone "$REPO" "$SRC"; fi; /bin/sh "$SRC/scripts/synology-start-meta.sh"'
```

주의:

- direct command `/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh`는 `/volume1/docker/wiregene-meta-analysis`가 이미 최신 Git checkout일 때만 유효하다.
- `git command not found`가 나오면 Synology Git 패키지를 설치한 뒤 다시 실행한다.

## 2026-06-12 Synology Basic Auth 누락 오류 처리

사용자 오류 보고:

```text
Cloning into '/volume1/docker/wiregene-meta-analysis'...
2026-06-12 19:31:42 Wiregene Meta DSM scheduler start requested.
2026-06-12 19:31:42 ERROR: No complete Basic Auth credential found in /volume1/docker/meta/.env.
```

의미:

- repo clone은 성공했다.
- `/volume1/docker/meta/.env`가 생성되었지만 `APP_BASIC_AUTH_USERS` 또는 `APP_BASIC_AUTH_USER` + `APP_BASIC_AUTH_PASSWORD`가 비어 있어 서비스 시작이 중단되었다.
- 이 중단은 인증 없이 public으로 열리지 않게 하는 안전장치다.

변경 내용:

- `scripts/synology-start-meta.sh`가 DSM scheduler command 앞에 붙인 `APP_BASIC_AUTH_USER`, `APP_BASIC_AUTH_PASSWORD`, `APP_BASIC_AUTH_USERS`, `WIREGENE_ADMIN_EMAILS`, `APP_ADMIN_USERS`, `APP_ADMIN_USER` 값을 `/volume1/docker/meta/.env`의 빈 값에 자동으로 채우도록 수정했다.
- `scripts/synology-migrate-auth-env.sh`가 meta repo 단독 checkout에서도 동작하도록 수정했다. portal package example이 없으면 portal migration은 건너뛰고 meta env만 이관한다.
- `synology/docker/meta/README.md`, `docs/synology-meta-portal-split.md`, `SERVICE.md`에 Basic Auth 누락 시 복구 명령을 추가했다.

다음 실행 옵션:

기존 Synology search/briefing 환경에서 auth 값을 안전하게 이관:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-migrate-auth-env.sh && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

새 Basic Auth 값을 직접 seed:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && APP_BASIC_AUTH_USER='YOUR_LOGIN_ID' APP_BASIC_AUTH_PASSWORD='YOUR_PASSWORD' WIREGENE_ADMIN_EMAILS='YOUR_ADMIN_EMAIL' /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

검증:

- 로컬 Windows 환경에 `sh`/`bash`가 없어 shell syntax check는 실행하지 못했다.
- 변경은 POSIX `sh` 문법만 사용했다.

## 2026-06-12 Synology Compose 호환성 및 APP_SOURCE_DIR 오류 처리

사용자 오류 보고:

```text
WARNING: APP_SOURCE_DIR is '/volume1/docker/research-briefing-platform' in /volume1/docker/meta/.env, expected '/volume1/docker/wiregene-meta-analysis'.
The Compose file '/volume1/docker/meta/docker-compose.yml' is invalid because:
'name' does not match any of the regexes: '^x-'
```

원인:

- `/volume1/docker/meta/.env`에 이전 search repo 경로 `APP_SOURCE_DIR=/volume1/docker/research-briefing-platform`이 남아 있었다.
- Synology의 구형 `docker-compose`는 Compose spec의 top-level `name:`을 지원하지 않아 `synology/docker/meta/docker-compose.yml`을 읽지 못했다.

변경 내용:

- `synology/docker/meta/docker-compose.yml`: top-level `name:`을 제거하고 `version: "3.3"` + `services:` 구조로 변경했다.
- `scripts/synology-start-meta.sh`: 실행 시 `/volume1/docker/meta/.env`의 `APP_SOURCE_DIR`, `CONTAINER_NAME`, `WIREGENE_APP_MODE`를 meta 서비스 기대값으로 자동 교정하도록 수정했다.

다음 Synology 실행 명령:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-12 Synology HOST_PORT 3001 충돌 처리

사용자 오류 보고:

```text
Bind for 0.0.0.0:3001 failed: port is already allocated
Host is already in use by another container
```

원인:

- meta 서비스가 사용하려는 host port `3001`을 이미 다른 Docker 컨테이너가 점유하고 있다.
- 스크립트가 compose 실행 전에 port owner를 점검하지 않아 Docker compose 에러까지 진행되었다.

변경 내용:

- `scripts/synology-start-meta.sh`: compose 실행 전 host port owner를 `docker ps`로 확인한다.
- 다른 컨테이너가 port를 쓰고 있으면 컨테이너 ID/name/ports를 로그로 출력하고 중단한다.
- 기본 동작은 다른 컨테이너를 자동 중지하지 않는다.
- `META_STOP_PORT_OWNER=true`를 명시했을 때만 port owner container를 `docker stop`한 뒤 meta를 시작한다.
- `HOST_PORT=3003`처럼 scheduler 환경변수로 다른 port를 지정하면 `/volume1/docker/meta/.env`의 `HOST_PORT`를 갱신하도록 했다.
- 이전 실패로 생성된 non-running `wiregene-meta` stale container는 자동 제거한다.

다음 실행 명령:

먼저 최신 스크립트로 일반 재시도:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

로그에 표시된 기존 3001 컨테이너를 meta로 교체하려면:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && META_STOP_PORT_OWNER=true /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

기존 3001 컨테이너를 유지하고 임시로 3003에서 meta를 테스트하려면:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && HOST_PORT=3003 /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-12 Meta 전환 작업

사용자 요청:

```text
지금 이 작업은 다른데서 진행 중이라 meta.wiregne.com에서 필요한 작업으로 전환합니다
```

이번 작업 목표:

1. `meta.wiregene.com` 실제 저장소로 전환한다.
2. Portal 계정 인증으로 Meta 사이트에 접속한 사용자가 앱 UI에서도 사용자 정보로 표시되도록 한다.
3. Meta 사이트 전용 이름/metadata와 버전을 반영한다.
4. 빌드/린트 오류를 확인하고 수정한다.
5. GitHub에 push하고, Synology 작업 스케줄러 명령을 남긴다.

변경 내용:

- `package.json`: package name을 `wiregene-meta-analysis`로 변경하고 버전을 `0.1.1`로 올렸다.
- `src/lib/version.ts`: UI 표시 버전을 `Ver 1.36`으로 올렸다.
- `src/app/layout.tsx`: metadata title/description을 Wiregene Meta 전용 문구로 수정했다.
- `.env.example`: `PORTAL_AUTH_CHECK_SECRET`, `PORTAL_AUTH_CHECK_URL` 예시를 추가했다.
- `src/lib/auth-session.ts`: env Basic Auth뿐 아니라 Portal 계정 원격 검증 결과도 `currentUser`로 반환하도록 비동기화했다.
- `src/app/page.tsx`: app mode를 넘겨 `getCurrentWiregeneUser`를 await하도록 수정했다.
- `src/proxy.ts`: 빈 `PORTAL_AUTH_CHECK_URL` 값이 들어와도 기본 portal auth check URL로 fallback하도록 수정했다.

검증 결과:

```powershell
npm.cmd install      # 통과, package-lock.json 루트 name/version 0.1.1 반영
npm.cmd run lint     # 통과
npm.cmd run build    # 통과
```

로컬 화면 확인:

```text
WIREGENE_APP_MODE=meta / http://127.0.0.1:3011
HTTP 200
Wiregene Meta 표시 확인
Ver 1.36 표시 확인
```

참고:

- `npm.cmd install`에서 moderate 취약점 2건이 보고되었지만, 자동 수정 명령이 `npm audit fix --force`라 breaking change 가능성이 있어 이번 배포 작업에서는 적용하지 않았다.
- 다음 PC에서 이어받을 때는 이 저장소에서 `git pull origin main` 후 이 `backup.md`를 먼저 확인한다.

Synology 작업 스케줄러 명령:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-12 Full-text PDF DOMMatrix error fix

User-reported production/UI error:

```text
Failed to load external module pdf-parse-08f4573089f02674: ReferenceError: DOMMatrix is not defined
```

Root cause:

- The full-text PDF upload path loads `pdf-parse` on the Next.js Node server.
- `pdf-parse@2.4.5` / `pdfjs-dist` can touch browser/canvas globals such as `DOMMatrix`, `ImageData`, and `Path2D` while the external module is loaded.
- In the Next.js server external-module loader this happened before `DOMMatrix` existed, so the analysis failed immediately before text extraction started.

Changed files:

- `src/lib/pdf-text.ts`: added shared server-only PDF extraction helper. It installs `DOMMatrix`, `ImageData`, and `Path2D` from `@napi-rs/canvas` before requiring `pdf-parse`.
- `src/lib/meta-full-text-analysis.ts`: full-text meta-analysis PDF extraction now uses the shared helper with the existing 120-page limit.
- `src/lib/rfp-analysis.ts`: grant/RFP PDF extraction now uses the same helper with the existing 80-page limit.
- `package.json`, `package-lock.json`: added direct dependency `@napi-rs/canvas@0.1.80`, matching the tested `pdf-parse@2.4.5` dependency set.

Independent verification agents:

- Agent 1 checked all affected PDF paths and confirmed the shared helper approach is the safest implementation pattern.
- Agent 2 checked the UI/API upload flow and confirmed the relevant route is `POST /api/meta-analysis/full-text/analyze` with multipart field `file`.

Local verification:

```powershell
npx.cmd tsx -e "import { extractPdfTextWithPdfParse } from './src/lib/pdf-text'; import fs from 'node:fs'; void (async () => { const b = fs.readFileSync('C:/Users/rhhyu/AppData/Local/Temp/wiregene-meta-plan-260611.pdf'); const r = await extractPdfTextWithPdfParse(b, 5); console.log(JSON.stringify({len:r.text.length,totalPages:r.totalPages,pageLimitApplied:r.pageLimitApplied,preview:r.text.slice(0,40)})); })();"
# {"len":5287,"totalPages":14,"pageLimitApplied":true,...}

npm.cmd run lint
# pass

npm.cmd run build
# pass
```

Actual API upload verification:

```powershell
$env:WIREGENE_APP_MODE='meta'
$env:OPENAI_API_KEY=''
npm.cmd run dev -- --port 3017

curl.exe -sS -X POST -F "file=@C:\Users\rhhyu\AppData\Local\Temp\wiregene-meta-plan-260611.pdf;type=application/pdf" http://localhost:3017/api/meta-analysis/full-text/analyze
```

Observed result:

```text
HTTP 200
fileType: pdf
extractedTextLength: 13156
aiUsed: false
decision: uncertain
No DOMMatrix error
```

Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-12 DOMMatrix native canvas fallback fix

User-reported error after the previous DOMMatrix patch:

```text
PDF text extraction could not initialize DOMMatrix from @napi-rs/canvas.
```

Root cause:

- The previous fix still depended on the native `@napi-rs/canvas` package being installed and loadable in the runtime container.
- On Synology or another Linux runtime, that native module can be missing, stale, incompatible, or fail to load even when it exists in `package-lock.json`.
- The app then threw its own error before loading `pdf-parse`, so PDF full-text analysis still failed.

Changes:

- `src/lib/pdf-text.ts`: removed the hard failure when `@napi-rs/canvas` is unavailable.
- `src/lib/pdf-text.ts`: added pure JS fallback classes for `DOMMatrix`, `ImageData`, and `Path2D` before `pdf-parse` is required.
- `src/lib/pdf-text.ts`: added `WIREGENE_PDF_FORCE_JS_POLYFILLS=true` test switch to force the same path that Synology needs when native canvas is unavailable.
- `scripts/synology-start-meta.sh`: changed compose startup to `up -d --force-recreate` so a pulled code change restarts the running app instead of leaving the old server process alive.
- `synology/docker/meta/docker-compose.yml`: changed container startup to rerun `npm ci --include=dev` when `package.json` or `package-lock.json` is newer than the installed `node_modules` lock metadata.
- `package.json`, `package-lock.json`: package version bumped to `0.1.6`.
- `src/lib/version.ts`: UI version bumped to `Ver 1.41`.

Verification:

```powershell
$env:WIREGENE_PDF_FORCE_JS_POLYFILLS='true'
npx.cmd tsx -e "import { extractPdfTextWithPdfParse } from './src/lib/pdf-text'; import fs from 'node:fs'; void (async () => { const b = fs.readFileSync('C:/Users/rhhyu/AppData/Local/Temp/wiregene-meta-plan-260611.pdf'); const r = await extractPdfTextWithPdfParse(b); console.log(JSON.stringify({len:r.text.length,totalPages:r.totalPages,preview:r.text.slice(0,40),domMatrix: typeof globalThis.DOMMatrix})); })();"
# {"len":13156,"totalPages":14,...,"domMatrix":"function"}

npm.cmd run lint
# pass

npm.cmd run build
# pass

"C:\Program Files\Git\bin\bash.exe" -n scripts/synology-start-meta.sh
# pass
```

Actual API verification with native canvas bypassed:

```text
WIREGENE_APP_MODE=meta
OPENAI_API_KEY=
WIREGENE_PDF_FORCE_JS_POLYFILLS=true
POST http://localhost:3019/api/meta-analysis/full-text/analyze
sample PDF: wiregene-meta-plan-260611.pdf
HTTP 200
extractedTextLength: 13156
truncated: false
```

Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

If the running Synology container still shows the old error after this commit, it is running old code and must be restarted/recreated from the updated repository.

If Synology still reports a canvas/DOMMatrix-related error after pulling this commit, verify the native canvas dependency inside the running container:

```sh
docker exec wiregene-meta node -e "const c=require('@napi-rs/canvas'); console.log(process.version, process.platform, process.arch, !!c.DOMMatrix, !!c.ImageData, !!c.Path2D)"
```

Expected final three values are all `true`. Scanned image-only PDFs may still return no text; that is a separate OCR issue, not this `DOMMatrix` module-load error.

## 2026-06-12 Remove app-side PDF size/page limits

User instruction:

```text
PDF 용량제한이나 페이지제한이 있으면 안됩니다
```

Changes:

- `package.json`, `package-lock.json`: package version bumped to `0.1.5`.
- `src/lib/version.ts`: UI version bumped to `Ver 1.40`.
- `src/app/api/meta-analysis/full-text/analyze/route.ts`: removed the app-side 60MB full-text upload limit and the `Content-Length` pre-check.
- `src/app/api/grants/rfp-analysis/route.ts`: removed the app-side 30MB upload/download checks for PDF/RFP documents.
- `src/lib/pdf-text.ts`: changed PDF text extraction from page-limited `parser.getText({ first: ... })` to full-document `parser.getText()`.
- `src/lib/meta-full-text-analysis.ts`: removed the 120-page PDF extraction cap and removed the 70,000-character pre-analysis slice, so the extracted full text is passed through without app-side truncation.
- `src/lib/rfp-analysis.ts`: removed the RFP PDF 80-page extraction cap by using the same full-document PDF helper.

Verification:

```powershell
rg -n "maxUploadBytes|maxPdfPages|getText\(\{ first|extractPdfTextWithPdfParse\([^)]*,|60MB|30MB|처음 .*페이지만|pageLimitApplied" src
# no matches

npx.cmd tsx -e "import { extractPdfTextWithPdfParse } from './src/lib/pdf-text'; import fs from 'node:fs'; void (async () => { const b = fs.readFileSync('C:/Users/rhhyu/AppData/Local/Temp/wiregene-meta-plan-260611.pdf'); const r = await extractPdfTextWithPdfParse(b); console.log(JSON.stringify({len:r.text.length,totalPages:r.totalPages,preview:r.text.slice(0,40)})); })();"
# {"len":13156,"totalPages":14,...}

npm.cmd run lint
# pass

npm.cmd run build
# pass
```

Actual API verification:

```text
POST http://localhost:3018/api/meta-analysis/full-text/analyze
sample PDF: wiregene-meta-plan-260611.pdf
HTTP 200
extractedTextLength: 13156
truncated: false
```

Important deployment note:

- The app code no longer enforces PDF upload size or page-count limits.
- Very large uploads can still be affected by external infrastructure limits, for example reverse proxy, Docker memory, browser memory, DSM/Nginx upload settings, or hosting provider request limits. Those are outside this app code and must be adjusted separately if encountered.

Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-12 Excel workbook 표준 workflow 반영

사용자 지시:

```text
현재 Excel 파일 구조를 모든 메타분석의 표준으로 삼는다.
Summary의 숫자는 이전 PDF 파일 숫자를 기준으로 유지한다.
실제 full-text PDF 확인 중 included data에서 탈락하는 경우가 많으므로 중간 수정이 가능해야 한다.
Core_Comparative_Obs 18개 full-text PDF를 먼저 확인한다.
Core_InstrumentSpecific 36개 full-text PDF를 다음으로 확인한다.
Manual_FullText_Check 18개 full-text PDF는 더 주의깊게 include/exclude 판정한다.
나머지 Excel sheet 리스트는 full-text PDF 업로드가 필요 없다.
```

변경 내용:

- `package.json`, `package-lock.json`: 버전을 `0.1.4`로 올렸다.
- `src/lib/version.ts`: UI 표시 버전을 `Ver 1.39`로 올렸다.
- `src/lib/meta-projects.ts`: Excel workbook sheet 구조를 `workbookSheets` 데이터로 추가했다.
- PDF Summary/Search 숫자는 이전 PDF/스크린샷 기준으로 유지한다. 예: records identified 1,652, deduplicated 259, abstract text 253, previous PDF full-text planning queue 82.
- 실제 active full-text upload 대상은 Excel sheet row count 기준으로 분리했다.
  - `Core_Comparative_Obs`: 18개, priority 1, 먼저 업로드/검토
  - `Core_InstrumentSpecific`: 36개, priority 2, instrument-specific denominator 검토
  - `Manual_FullText_Check`: 18개, priority 3, cautious review
  - active upload total: 72개
- `Exposure_Support_Biomech`, `Excluded_RCT_Treatment`, `Excluded_Other`, `Screening_All_259_Strict`, `Extraction_Template_ObsOnly`, `Decision_Rules`는 no-upload sheet로 표시했다.
- `src/components/MetaStudyWorkspace.tsx`: Screening 탭에 `Excel workbook standard workflow` board를 추가했다.
- board에서 active sheet별 `current`, `included`, `excluded`, `pending`, notes를 직접 수정할 수 있게 했다.
- board 변경값은 같은 브라우저에서 `localStorage`에 유지되며, `board CSV 복사`로 다른 PC/Excel에 넘길 수 있다.
- Search/Overview metric은 `PDF FT plan` 82와 `Active Excel PDFs` 72를 분리해 표시한다.
- `src/components/MetaFullTextAssistant.tsx`: PDF 분석 assistant에 `Excel source sheet` 선택 필드를 추가했다.
- 선택 가능한 source sheet는 업로드가 필요한 3개 sheet만 표시한다.
- verification CSV에 `source_sheet`를 추가했다.
- `Manual_FullText_Check`를 선택하면 AI 판정을 낮은 신뢰도의 초안으로 보고 더 엄격히 확인하라는 caution을 표시한다.

검증 결과:

```powershell
npm.cmd run lint      # 통과
npm.cmd run build     # 통과
```

브라우저 검증:

```text
WIREGENE_APP_MODE=meta / http://127.0.0.1:3015
Wiregene Meta 표시 확인
Ver 1.39 표시 확인
Screening 탭: Excel workbook standard workflow 표시 확인
ACTIVE UPLOAD PDFS 72 표시 확인
Core_Comparative_Obs, Core_InstrumentSpecific, Manual_FullText_Check 표시 확인
No-upload sheets 표시 확인
Excel source sheet select options 3개 확인
Manual_FullText_Check 선택 시 caution 표시 확인
콘솔 error log 없음
```

주의점:

- 현재 board 수정값은 브라우저 `localStorage`와 CSV 복사 기반이다. 여러 PC/사용자 간 영구 공유가 필요하면 다음 단계에서 DB 또는 Google Drive/Excel file write-back 저장소를 붙여야 한다.
- actual include count는 full-text PDF extraction과 reviewer conflict resolution 후 확정한다.

Synology 작업 스케줄러 명령:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-12 full-text PDF AI screening/extraction workflow 추가

사용자 문제 제기:

```text
실제 검색 데이터는 Excel에 있고, 각 논문 full-text PDF도 확보했다.
연구자가 반복적으로 해야 하는 핵심 작업은 1) 연구 목적에 맞는 논문인지 거르는 일, 2) 포함 논문 PDF에서 parameter 수치를 Excel에 입력하는 일이다.
이 두 작업은 지루하고 human error가 커서, full-text PDF 업로드 후 AI가 초안을 만들고 연구자가 검증하는 플랫폼이 필요하다.
필요하면 Gemini 또는 ChatGPT/OpenAI API를 최대한 활용해야 한다.
```

확인한 Excel 파일:

```text
G:\내 드라이브\1_Thesis\Review_Pain Violin\Data\260606 New data\270611_10th ObservationOnly_Strict_Screening_Postural_Asymmetry_PRMD_Hyun.xlsx
```

Excel workbook 구조:

- Sheets: `Summary`, `Core_Comparative_Obs`, `Core_InstrumentSpecific`, `Manual_FullText_Check`, `Exposure_Support_Biomech`, `Excluded_RCT_Treatment`, `Excluded_Other`, `Screening_All_259_Strict`, `Extraction_Template_ObsOnly`, `Decision_Rules`
- Summary 기준: master records 259, primary observation-only candidates 59, core comparative observational 19, instrument-specific observational 40, manual full-text check 23, biomechanical/asymmetry support 76, treatment/RCT/intervention excluded 5, other exclusions 96
- 실제 tab row count는 Summary와 일부 불일치가 있었다. 예: `Core_Comparative_Obs`는 header 제외 18행, `Core_InstrumentSpecific`는 36행, `Manual_FullText_Check`는 18행으로 확인됨. 앱에서는 Excel template과 Summary 수치를 함께 보존하고, 최종 included count는 full-text 검증 후 확정한다.

`Extraction_Template_ObsOnly`에서 확인한 61개 컬럼:

```text
study_id, first_author, year, country, design, sample_size_total, sample_size_analyzed, population_source, professional_status, mean_age, female_percent, instrument_group_reported, specific_instrument, mapped_asymmetry_group, mapping_confidence, playing_hours, years_experience, recall_window, pain_definition, prmd_definition, neck_n, neck_total, left_shoulder_n, left_shoulder_total, right_shoulder_n, right_shoulder_total, shoulder_unspecified_n, shoulder_unspecified_total, left_elbow_n, left_elbow_total, right_elbow_n, right_elbow_total, elbow_unspecified_n, elbow_unspecified_total, left_wrist_hand_n, left_wrist_hand_total, right_wrist_hand_n, right_wrist_hand_total, wrist_hand_unspecified_n, wrist_hand_unspecified_total, upper_back_n, upper_back_total, lower_back_n, lower_back_total, tmj_jaw_n, tmj_jaw_total, headache_n, headache_total, pain_intensity_mean, pain_intensity_sd, pain_interference_mean, pain_interference_sd, performance_limitation_n, performance_limitation_total, adjusted_or, adjustment_covariates, notes_on_extractability, source_pdf_available, coder, second_reviewer, conflict_status
```

변경 내용:

- `package.json`, `package-lock.json`: 버전을 `0.1.3`으로 올렸다.
- `src/lib/version.ts`: UI 표시 버전을 `Ver 1.38`로 올렸다.
- `src/lib/meta-projects.ts`: extraction columns를 Excel의 `Extraction_Template_ObsOnly` 61개 컬럼으로 교체하고 section grouping을 새 템플릿에 맞췄다.
- `src/lib/meta-full-text-analysis.ts`: PDF/TXT full-text 분석 라이브러리를 추가했다. OpenAI API key가 있으면 `responses.create`로 strict JSON screening/extraction 초안을 생성하고, key가 없으면 규칙 기반 fallback으로 eligibility/evidence/CSV row 초안을 만든다.
- `src/app/api/meta-analysis/full-text/analyze/route.ts`: multipart upload API를 추가했다. 60MB 이하 PDF/TXT, optional reference screening row, optional extraction columns를 받는다.
- `src/components/MetaFullTextAssistant.tsx`: full-text PDF 업로드 UI를 추가했다. 논문 PDF와 Excel row를 올리면 eligibility decision, reviewer checks, study signals, evidence snippets, missing fields, n/total validation issues, extraction CSV copy를 제공한다.
- `src/components/MetaStudyWorkspace.tsx`: Screening 탭에는 eligibility assistant, Extraction 탭에는 extraction assistant를 배치했다.
- `src/components/MetaStudyWorkspace.tsx`: validator와 analysis readiness 기준을 기존 `asymmetry_class`에서 Excel 실제 컬럼인 `mapped_asymmetry_group`으로 수정했다.

AI workflow 의도:

- AI 결과는 최종 판정이 아니라 reviewer verification 초안이다.
- quantitative include는 original observational data, instrument/instrument-group data, region-specific pain outcome, extractable numerator/denominator가 확인될 때만 권장하도록 prompt를 제한했다.
- RCT, intervention/treatment, case report, review, conference-only, wrong population/outcome, denominator 불명확 논문은 제외 또는 보류 후보로 표시한다.
- Excel에 바로 붙여넣을 수 있도록 61개 컬럼 순서의 CSV를 생성한다.
- `*_n > *_total` 같은 명백한 수치 오류와 critical field 누락을 자동 표시한다.

검증 결과:

```powershell
npm.cmd run lint      # 통과
npm.cmd run build     # 통과
```

API 검증:

```text
POST /api/meta-analysis/full-text/analyze
테스트 파일: C:\Users\rhhyu\AppData\Local\Temp\wiregene-meta-plan-260611.pdf
OPENAI_API_KEY 없이 fallback rules 경로 확인
fileType: pdf
extractedTextLength: 13,156
aiUsed: false
decision: exclude
```

브라우저 검증:

```text
WIREGENE_APP_MODE=meta / http://127.0.0.1:3013
Wiregene Meta 표시 확인
Ver 1.38 표시 확인
Screening 탭: Full-text PDF AI eligibility assistant, PDF 업로드, AI 초안, 연구자 검증, full-text 분석 버튼 표시 확인
Extraction 탭: Full-text PDF AI extraction assistant, Extraction CSV validator, mapped_asymmetry_group, adjusted_or, conflict_status 표시 확인
```

에이전트 검증:

- 메타분석/통계 방법론 검증 에이전트와 기술 QA 검증 에이전트를 별도로 실행했다.
- 메타분석/통계 방법론 검증 에이전트는 fallback 오분류 위험, cell-level provenance 부재, OCR/table extraction 한계, reviewer workflow 부족, validator 부족을 지적했다.
- 기술 QA 검증 에이전트는 OpenAI 실패 시 `aiUsed=true`로 보일 위험, JSON schema validation 부재, PDF page/text truncation 표시 부족, CSV validator의 row-level blank 검증 부족, client column 검증 부족을 지적했다.

에이전트 지적 반영:

- fallback rules는 더 이상 include/exclude를 확정하지 않는다. OpenAI API key가 없거나 OpenAI/JSON validation이 실패하면 `decision=uncertain`, confidence 20, `aiUsed=false`로 표시한다.
- OpenAI 응답은 `zod` schema validation을 통과해야만 AI 결과로 사용한다.
- AI가 성공한 경우에도 fallback instrument와 AI instrument를 무조건 합치지 않고, AI가 실제 sample/group 근거로 추출한 instrument를 우선한다.
- extraction 결과에 `fieldEvidence`를 추가했다. AI가 `neck_n`, `left_shoulder_n` 같은 정량 cell을 채우면 row index, field, value, short evidence, page/table/source hint를 함께 반환하도록 prompt와 normalizer를 확장했다.
- Screening/Extraction assistant 결과 영역에 `Human verification worksheet`를 추가했다. reviewer 1, reviewer 2, fixed exclusion reason, conflict status, reviewer notes를 기록하고 verification CSV로 복사할 수 있다.
- 결과 영역에 `Cell-level evidence` panel을 추가했다. cell별 근거가 없으면 정량값을 확정하지 말고 원문 table/figure/supplement를 확인하라는 메시지를 표시한다.
- PDF 추출은 처음 120페이지와 70,000자 분석 cap을 명시하고, cap에 걸리면 validation issue로 표시한다.
- full-text upload API는 `Content-Length`와 60MB 제한을 먼저 확인하고, extraction columns는 Excel template의 허용 컬럼으로 제한한다.
- CSV validator는 header뿐 아니라 row별 필수값 누락, percent-only 값, 비정수 n/total, 음수, sample size보다 큰 denominator, `*_n`만 있고 `*_total`이 없는 경우를 잡는다.
- 오래된 `asymmetry_class` 문구를 `mapped_asymmetry_group`으로 교체했다.

남은 주의점:

- 실제 논문 PDF들로 extraction accuracy를 검증해야 한다.
- 스캔 PDF는 현재 텍스트 추출이 되지 않으면 OCR 후 업로드해야 한다.
- 이번 구현은 OpenAI API 경로를 먼저 붙였다. Gemini는 아직 provider abstraction에 추가하지 않았으며, API key/패키지/비용 정책이 정해지면 동일 인터페이스로 확장한다.
- 아직 영구 DB 저장/audit log는 없다. 현재는 reviewer가 CSV를 복사해 Excel에 붙여 검증하는 단계이며, 다음 단계에서 paper별 저장, reviewer conflict resolution, OCR/table extraction, provider abstraction을 붙여야 한다.

추가 검증 결과:

```powershell
npm.cmd run lint      # 통과
npm.cmd run build     # 통과
```

API 재검증:

```text
POST /api/meta-analysis/full-text/analyze
OPENAI_API_KEY 없이 fallback rules 경로 확인
aiUsed: false
decision: uncertain
confidence: 20
rows: 1
fieldEvidence: 0
```

브라우저 재검증:

```text
WIREGENE_APP_MODE=meta / http://127.0.0.1:3014
Wiregene Meta 표시 확인
Ver 1.38 표시 확인
Screening 탭: Full-text PDF AI eligibility assistant 표시 확인
Extraction 탭: Full-text PDF AI extraction assistant, mapped_asymmetry_group, adjusted_or, conflict_status 표시 확인
콘솔 error log 없음
```

Synology 작업 스케줄러 명령:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-12 업로드 자료 재반영 및 Meta 워크플로 보강

사용자 문제 제기:

```text
전에 올린 자료가 전혀 반영되지 않았고, 검색식과 결과에 대한 PRISMA 표도 만들지 못했으며, meta 페이지에서 연구자가 할 수 있는 것이 없다.
```

첨부/확인 자료:

```text
G:\내 드라이브\1_Thesis\Review_Pain Violin\Plan\260611 Plan Pain_Asymm musicians_Hyun.pdf
C:\Users\rhhyu\AppData\Local\Temp\codex-clipboard-411d1438-59b2-46be-bbc4-5dd481680bbe.png
C:\Users\rhhyu\AppData\Local\Temp\codex-clipboard-66a4fe8e-9663-427c-9ed7-c66ef080abb8.png
C:\Users\rhhyu\AppData\Local\Temp\codex-clipboard-abd46788-c76b-4c84-851c-09c1740f9138.png
C:\Users\rhhyu\AppData\Local\Temp\codex-clipboard-864ace2d-7c54-4699-91f3-f68ac1c47c85.png
C:\Users\rhhyu\AppData\Local\Temp\codex-clipboard-95795aa6-625e-4c83-b172-e2a254a7e01b.png
```

에이전트 분담 및 검증:

- 검색식/PRISMA 전문 에이전트: 스크린샷 5개 DB 검색식과 결과 수를 추출하고, PDF에는 exact search string과 DB별 hit count가 없다는 점을 확인했다.
- 메타분석/통계 워크플로 에이전트: 기존 Meta 페이지가 실제 연구 워크플로가 아니라 정적 가이드에 가깝다는 문제를 검토했고, Search log, PRISMA counter, screening decision, extraction validation, analysis readiness가 우선 필요하다고 제안했다.

반영된 DB별 검색 결과:

| Database | Date | n |
|---|---:|---:|
| PubMed | 2026-06-07 | 221 |
| Web of Science | 2026-06-07 | 413 |
| Scopus | 2026-06-07 | 561 |
| Embase | 2026-06-07 | 343 |
| Cochrane | 2026-06-07 | 114 |
| Total identified |  | 1,652 |

PRISMA/진행 상태:

- Records identified from databases: 1,652
- Records after deduplication: 259
- PubMed/WoS/Scopus source linked: 257
- Abstract text available: 253
- Full-text assessment queue: 82
- Core comparative observational: PDF 표에는 18, 본문 계산에는 19로 불일치가 있어 앱에서는 82편 queue 기준을 따르되 주의 문구를 표시한다.
- 1,393 removed before screening은 `1,652 - 259` 계산값이며 dedup log 확인 전까지 순수 duplicate라고 단정하지 않는다.

변경 내용:

- `package.json`, `package-lock.json`: 버전을 `0.1.2`로 올렸다.
- `src/lib/version.ts`: UI 표시 버전을 `Ver 1.37`로 올렸다.
- `src/lib/meta-analysis-pubmed.ts`: 앱 기본 PubMed 검색식을 업로드 스크린샷의 260607 PubMed 구조로 교체하고 English/humans filter를 반영했다.
- `src/lib/meta-projects.ts`: PubMed, Web of Science, Scopus, Embase, Cochrane exact search string, hit count, limits, export action을 데이터화했다.
- `src/lib/meta-projects.ts`: PDF의 PRISMA 진행 상태, full-text queue, 6개 extraction block과 전체 extraction columns를 반영했다.
- `src/components/MetaStudyWorkspace.tsx`: Search 탭에 DB별 search log table, query copy, search log CSV copy, PRISMA 2020 identification table, PRISMA CSV copy, 검색식 불일치 risk flag를 추가했다.
- `src/components/MetaStudyWorkspace.tsx`: Screening 탭에 82편 full-text triage queue, screening CSV header, two-reviewer fields, fixed exclusion reason 목록을 추가했다.
- `src/components/MetaStudyWorkspace.tsx`: Extraction 탭에 6개 extraction block, 전체 CSV header copy, CSV validator를 추가했다. Validator는 필수 header 누락과 `*_n > *_total` 오류를 잡는다.
- `src/components/MetaStudyWorkspace.tsx`: Analysis 탭에 outcome별 analysis readiness dashboard를 추가했다.

검증 결과:

```powershell
npm.cmd run lint      # 통과
npm.cmd run build     # 통과
git diff --check      # 공백 오류 없음
```

브라우저 검증:

```text
WIREGENE_APP_MODE=meta / http://127.0.0.1:3012
Wiregene Meta 표시 확인
Ver 1.37 표시 확인
Search 탭: Search log from uploaded screenshots, PRISMA 2020 identification table, 1,652, PubMed 221, Scopus 561 표시 확인
Screening 탭: Core 19, Instrument-specific 40, Manual 23, exclusion reason 표시 확인
Extraction 탭: extraction blocks, left/right fields, risk factor fields, CSV validator 표시 확인
Extraction validator: neck_n 12 / neck_total 10 예시 오류 표시 확인
Analysis 탭: laterality, TMJ/jaw modifier, meta-regression guard 표시 확인
```

남은 주의점:

- Cochrane 검색식은 다른 DB보다 좁아 protocol supplement에서 별도 확인이 필요하다.
- PubMed/Cochrane의 1990-2026 제한과 WoS/Scopus/Cochrane의 English limit는 스크린샷상 명확하지 않아 run log 확인이 필요하다.
- 실제 포함 논문 수와 분석 가능 outcome은 full-text extraction이 끝나야 확정된다.

Synology 작업 스케줄러 명령:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```
## 2026-06-12 PDF worker bundling fix

User-reported error:

```text
Setting up fake worker failed: "Cannot find module '/var/task/node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs' imported from /var/task/node_modules/pdf-parse/dist/pdf-parse/cjs/index.cjs".
```

Root cause:

- The previous DOMMatrix fix allowed `pdf-parse` to initialize, but the deployed Next/Vercel server bundle did not include the `pdf.worker.mjs` file that `pdf-parse` dynamically imports.
- On Vercel this appears under `/var/task/node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs`.
- On Windows local verification, giving pdf.js a raw absolute path also failed because the ESM loader requires a `file://` URL for Windows paths.

Changes:

- `src/lib/pdf-text.ts`: after loading `pdf-parse`, resolve the worker file next to `pdf-parse`'s CJS entry and pass it to `PDFParse.setWorker(...)` as a `file://` URL.
- `next.config.ts`: added `outputFileTracingIncludes` for the meta full-text API and grant/RFP PDF API so `pdf.worker.mjs` is included in serverless output tracing.
- `package.json`, `package-lock.json`: package version bumped to `0.1.7`.
- `src/lib/version.ts`: UI version bumped to `Ver 1.42`.

Verification:

```text
Forced JS fallback PDF helper test: pass, 14 pages, 13,156 chars, DOMMatrix function.
npm.cmd run lint: pass.
npm.cmd run build: pass.
Direct Next route handler upload test: HTTP 200, hasAnalysis true, fileType pdf, extractedTextLength 13,156, truncated false, aiUsed false.
```

Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

If this exact worker error still appears after pulling this commit, the running deployment is still using an old server bundle or the hosting platform did not rebuild from the latest commit. Rebuild/restart from the updated repository before retesting PDF upload.
## 2026-06-12 Full-text Word file support

User clarification:

```text
full-text article은 PDF나 word 파일로 되어 있습니다
```

Implemented:

- `src/lib/word-text.ts`: added server-side Word text extraction using `word-extractor`.
- Supports Word `.doc` and `.docx` uploads from a Buffer without Microsoft Office or native binaries.
- `src/lib/meta-full-text-analysis.ts`: full-text analysis file type expanded from `pdf | text` to `pdf | word | text`.
- Word MIME/type detection added for `.doc`, `.docx`, `application/msword`, and `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
- `src/app/api/meta-analysis/full-text/analyze/route.ts`: API error messages now say PDF/Word/TXT instead of PDF/TXT only.
- `src/components/MetaFullTextAssistant.tsx`: upload UI now accepts `.pdf,.doc,.docx,.txt,.md` and displays `PDF, Word, TXT`.
- `package.json`, `package-lock.json`: added `word-extractor@1.0.4`; package version bumped to `0.1.8`.
- `src/lib/version.ts`: UI version bumped to `Ver 1.43`.

Verification:

```text
Synthetic .docx Word extraction helper test: pass, extracted 72 chars.
Direct full-text route upload with .docx: HTTP 200, fileType word, extractedTextLength 72, aiUsed false, decision uncertain.
PDF regression route test: HTTP 200, fileType pdf, extractedTextLength 13,156.
npm.cmd run lint: pass.
npm.cmd run build: pass.
```

Notes:

- `.docx` and `.doc` are both routed through `word-extractor`.
- If a Word file is damaged, encrypted, or not actually a Word document despite its extension, the API returns a Word-specific read error instead of a PDF/OCR error.
- AI output is still a draft for human verification; Word support only changes full-text ingestion.

Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```
## 2026-06-12 OpenAI key requirement for full-text accuracy

User question:

```text
full-text 판정시 openai key를 사용하는게 정확도가 올라가지 않을까요?
```

Answer and implementation:

- Yes. The full-text article workflow is much more useful when `OPENAI_API_KEY` is configured.
- Current code path: `src/lib/meta-full-text-analysis.ts` uses OpenAI when `OPENAI_API_KEY` exists; otherwise it returns conservative fallback output with `aiUsed=false`.
- `src/components/MetaFullTextAssistant.tsx`: result notice now explicitly says whether OpenAI was used or whether fallback rules were used because the key is missing or AI validation failed.
- `scripts/synology-start-meta.sh`: `OPENAI_API_KEY` and `OPENAI_MODEL` are now seeded from the DSM scheduler environment into `/volume1/docker/meta/.env` when those values are provided and the runtime env values are empty.
- `scripts/synology-start-meta.sh`: logs a warning when `OPENAI_API_KEY` is empty because full-text judgment will use fallback rules.
- Synology docs updated with the OpenAI seeding command.
- `package.json`, `package-lock.json`: package version bumped to `0.1.9`.
- `src/lib/version.ts`: UI version bumped to `Ver 1.44`.

Synology OpenAI setup command:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && OPENAI_API_KEY='YOUR_OPENAI_API_KEY' OPENAI_MODEL='gpt-5-nano' /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-16 Screening project-folder export storage

User asked where Screening-generated Excel/CSV/data files are saved and requested a folder option or per-project folders.

Current diagnosis:

- Before this change, Screening/Search export buttons were clipboard-only.
- `Search import log` and workbook board edits were browser `localStorage` only, scoped by project id but not shared across PCs.
- Full-text analysis history was already server-side in `.data/meta/meta-full-text-history.json` or Google Drive when configured.
- Draft Excel CSV in the extraction dataset panel was explicitly `Copy draft Excel CSV (not saved)`.

Implemented in the canonical actual app repository:

```text
C:\Users\HyunJK\Documents\GitHub\meta.wiregene.com
```

Changed files:

- `src/lib/meta-project-storage.ts`
- `src/app/api/meta-analysis/projects/[projectId]/files/route.ts`
- `src/components/MetaStudyWorkspace.tsx`
- `src/components/MetaExtractionDatasetPanel.tsx`
- `.env.example`
- `synology/docker/meta/.env.example`
- `scripts/synology-start-meta.sh`
- `SERVICE.md`
- `package.json`
- `package-lock.json`
- `src/lib/version.ts`

Behavior now:

- New API: `/api/meta-analysis/projects/[projectId]/files`.
- Default app path: `.data/meta/projects/{projectId}/`.
- Default Synology host path: `/volume1/docker/meta/data/projects/{projectId}/`.
- Root folder option: `META_PROJECT_STORAGE_ROOT`; default `.data/meta/projects`.
- Screening tab shows `Project file storage` with app path, Synology host-path hint, saved file count, and file list.
- Save buttons now exist for search log CSV, search import CSV, PRISMA CSV, workbook board CSV, screening decision header CSV, and draft Excel dataset CSV.

Version:

- Actual app package version: `0.1.32`.
- Visible UI version: `Ver 1.67 | 2026 copyright by JK Hyun`.

Verification:

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm run build`: passed without Turbopack warnings.
- Browser verification on `http://127.0.0.1:3223` confirmed the Screening storage panel and save buttons.
- `Save header` created `.data/meta/projects/orchestral-prmd-asymmetry/screening-decision-header.csv`.
- `Save board` created `.data/meta/projects/orchestral-prmd-asymmetry/workbook-fulltext-board.csv`.

Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-14 Meta workflow UX pass for protocol/search/screening verification

Actual working repository:

```text
C:\Users\rhhyu\Documents\GitHub\wiregene-meta-analysis
```

User request:

- New topic workflow must not be only "skeleton copy"; researchers need to paste ChatGPT/Gemini planning text, edit fields, and save.
- PRISMA protocol must be editable and support paste/review prompt workflow.
- Search design must support PubMed plus other DB access links and allow externally searched result counts/export files to be entered.
- Screening must show full-text AI decision categories at the top and let the user click them to filter saved papers.
- Reviewer verification progress must be visible and saved results must remain reviewable later.
- Included-paper Excel dataset must show what will be copied/exported before CSV copy.
- Consider future multi-model comparison, but start with reliable saved artifacts and prompt/export surfaces.

Specialist agent input used:

- Meta-analysis/statistics workflow review: history records should become the authority for saved screening and verification counts.
- Protocol/search workflow review: add editable/pasteable planning surfaces before skeleton/query copy actions.
- AI architecture review: implement prompt/export surfaces first; add multi-model provider comparison later after persistence and cost controls are stable.

Implemented:

- `src/components/MetaStudyWorkspace.tsx`
  - Added editable new-topic draft with ChatGPT/Gemini paste area, structured fields, save button, saved timestamp, and AI planning prompt copy.
  - Added editable PRISMA protocol draft with PICO/PEO, eligibility, exclusion, synthesis fields, save button, saved timestamp, and AI review prompt copy.
  - Added DB `Open` links for PubMed, Scopus, Web of Science, Embase, and Cochrane.
  - Added external search result import log with actual n, export file, notes, local save, saved timestamp, and CSV copy.
- `src/components/MetaFullTextAssistant.tsx`
  - Added top decision cards for quantitative candidate, uncertain, exclude candidate, and narrative/evidence candidate.
  - Cards filter the saved article list.
  - Added all/pending/verified filters.
  - Added source-sheet progress table showing saved, human verified, human include, human exclude, and pending/conflict counts.
- `src/lib/meta-full-text-history.ts`
  - Added reviewer decision/exclusion/conflict fields to history summaries so client-side progress can be computed from saved records.
- `src/components/MetaExtractionDatasetPanel.tsx`
  - Renamed draft CSV action to make clear it is not saving.
  - Added Excel dataset preview before CSV copy, including row/column counts and first five audit rows.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.28`
  - UI label: `Ver 1.63 | 2026 copyright by JK Hyun`

Verification:

```text
npm run lint: pass.
npx tsc --noEmit --pretty false: pass.
npm run build: pass.
Browser verification in Meta mode on http://127.0.0.1:3214:
- Ver 1.63 visible.
- New topic page shows AI-planned topic draft, save button, and skeleton as secondary block.
- PRISMA Protocol page shows Editable PRISMA protocol draft and save/prompt buttons.
- Search Design page shows External search result import log and 5 DB Open links.
- Screening page shows source-sheet progress, decision filter cards, saved-article list, and included-paper dataset panel.
- Browser console errors/warnings: none.
```

Current limitation / next work:

- New-topic/protocol/search draft saves are local-browser persistence only. For team-wide persistence across PCs, next iteration should add project-level server/Google Drive storage APIs.
- Multi-model comparison is not implemented yet. Recommended next step is to add a model-review prompt pack/export first, then provider adapters for OpenAI/Gemini/open models once storage and cost controls are ready.

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-14 Google Drive resumable chunk-size correction

User reported the same 5.6 MB Zuhdi PDF still failed after the chunk proxy fix:

```text
Large-file chunk upload failed before analysis.
phase: forward_chunk_to_google_drive
chunkStart: 2500000
chunkEnd: 4999999
fileSize: 5916449
chunkBytes: 2500000
httpStatus: 503
message: Invalid request. According to the Content-Range header, the upload offset is 2500000 byte(s), which exceeds already uploaded size of 2359296 byte(s).
```

Root cause:

- The previous chunk proxy used an arbitrary chunk size of `2,500,000` bytes.
- Google Drive resumable upload requires non-final chunks to align to 256 KiB units.
- Google accepted only `2,359,296` bytes (`256 * 1024 * 9`) from the first chunk, then rejected the second chunk because the client started at `2,500,000`.

Implemented:

- `src/components/MetaFullTextAssistant.tsx`
  - Replaced `2,500,000` byte chunks with `256 * 1024 * 9 = 2,359,296` byte chunks.
  - Added parsing of Google `Range: bytes=0-N` responses so the next chunk starts at the exact acknowledged offset.
- `src/app/api/meta-analysis/full-text/upload-chunk/route.ts`
  - Added server-side validation that all non-final chunks must be a multiple of `262,144` bytes before forwarding to Google Drive.
  - Improved the error help for stale page bundles: refresh and confirm `Ver 1.62` or later.
- Package version bumped to `0.1.27`.
- UI version bumped to `Ver 1.62 | 2026 copyright by JK Hyun`.

Verification:

```text
npm run lint: pass.
npx tsc --noEmit: pass.
npm run build: pass.
Production build includes /api/meta-analysis/full-text/upload-chunk.
Targeted bad chunk test: 2,500,000-byte non-final chunk is rejected locally with HTTP 400 before Google forwarding, message says non-final chunks must be a multiple of 262144 bytes.
Targeted aligned chunk test: 2,359,296-byte non-final chunk passes local validation and reaches Google forwarding; fake upload id returns expected HTTP 502/404 from Google.
curl with Host: meta.wiregene.com showed Ver 1.62.
Browser verification in forced Meta mode on http://127.0.0.1:3212: Ver 1.62 visible; Screening tab unique; full-text upload visible; file input multiple=true; accepts PDF, Word, TXT, MD; Analyze full text visible; console errors=[].
```

Notes:

- No private full-text PDF was transmitted during this verification.
- No OpenAI or Google secret was written to Git or backup.

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-13 Google Drive OAuth invalid_grant guidance fix

User-reported error:

```text
meta AI settings storage read failed.
path: google-drive:meta-ai-settings.json
message: Google OAuth refresh failed: invalid_grant.
```

Meaning:

- The Vercel `GOOGLE_DRIVE_REFRESH_TOKEN` is invalid, revoked, copied incorrectly, expired, or was generated with a different `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` pair.
- The fix is to regenerate `GOOGLE_DRIVE_REFRESH_TOKEN` locally using the exact same client id and client secret currently stored in Vercel Production Environment Variables.
- Do not paste Google or OpenAI secrets into Git or `backup.md`.

Code/docs change:

- `src/lib/google-drive-oauth.ts`: changed the invalid_grant message from GitHub-Actions-only wording to deployment-environment wording that explicitly includes Vercel Environment Variables.
- `package.json`, `package-lock.json`: package version bumped to `0.1.15`.
- `src/lib/version.ts`: UI version bumped to `Ver 1.50`.

User-side repair steps:

```powershell
cd C:\Users\rhhyu\Documents\GitHub\wiregene-meta-analysis
$env:GOOGLE_DRIVE_CLIENT_ID="<copy from Vercel Production GOOGLE_DRIVE_CLIENT_ID>"
$env:GOOGLE_DRIVE_CLIENT_SECRET="<copy from Vercel Production GOOGLE_DRIVE_CLIENT_SECRET>"
npm.cmd run google-drive:oauth
```

Then copy only the newly printed refresh token into Vercel:

```text
GOOGLE_DRIVE_REFRESH_TOKEN=<new refresh token>
```

Redeploy Vercel Production after updating the environment variable.

## 2026-06-13 Full-text fallback warning specificity fix

User issue:

```text
PDF 업로드 후 분석을 시작했는데 왜 "OPENAI_API_KEY가 없거나 AI 응답 검증에 실패해 fallback rules로만 초안을 생성했습니다..."가 나오나요? 당연히 OpenAI key는 입력했습니다.
```

Root cause:

- The UI used one generic fallback notice for several different cases:
  - no key available to the server,
  - in-app saved key could not be read from Meta AI settings storage,
  - OpenAI request failed,
  - OpenAI response schema validation failed.
- Entering an OpenAI key in the settings form is not enough; the full-text analysis API must be able to read the saved encrypted key at analysis time.
- If Google Drive OAuth for Meta AI settings storage is broken, the saved key cannot be read even if the user typed it earlier.

Implemented:

- `src/lib/meta-full-text-analysis.ts`: added `aiConfigSource` and `aiWarning` to every full-text analysis result.
- Full-text analysis now catches Meta AI settings read failures and returns fallback with a specific warning instead of hiding the cause.
- OpenAI request failures and schema-validation failures now return specific warnings.
- Missing/disabled key state now says that the analysis server could not access a saved key or `OPENAI_API_KEY`.
- `src/components/MetaFullTextAssistant.tsx`: fallback notice now displays `analysis.aiWarning`.
- Added an amber warning panel to the result when fallback is caused by AI settings/OpenAI issues.
- Verification CSV now includes `ai_config_source` and `ai_warning`.
- `package.json`, `package-lock.json`: package version bumped to `0.1.16`.
- `src/lib/version.ts`: UI version bumped to `Ver 1.51`.

Verification:

```text
npx.cmd tsc --noEmit: pass.
Missing-key direct full-text test: aiUsed=false, aiConfigSource=missing, aiWarning explains that the analysis server could not access a key.
Google Drive settings-read failure direct full-text test: aiUsed=false, aiWarning includes google-drive settings read failure details.
npm.cmd run lint: pass.
npm.cmd run build: pass.
```

User-facing interpretation:

- If fallback still appears after this build, read the amber `aiWarning`.
- If it says Google Drive OAuth/settings could not be read, fix `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, and `GOOGLE_DRIVE_REFRESH_TOKEN` in Vercel, redeploy, then rerun.
- If it says no key is available, open AI settings and confirm Source shows `saved encrypted key`, or set `OPENAI_API_KEY` in Vercel Production and redeploy.

## 2026-06-13 OpenAI Structured Outputs schema fix

User-reported error:

```text
OpenAI request failed, so fallback rules were used.
Details: 400 Invalid schema for response_format 'meta_full_text_analysis':
In context=(), 'additionalProperties' is required to be supplied and to be false.
```

Root cause:

- OpenAI Structured Outputs requires every object in the supplied JSON schema to set `additionalProperties: false`.
- Strict structured schemas also require every key in `properties` to be listed in `required`; optional values should be represented with nullable types.
- The previous `meta_full_text_analysis` schema used `additionalProperties: true` for root and nested objects, so OpenAI rejected the request before analysis started.

Implemented:

- `src/lib/meta-full-text-analysis.ts`: replaced the static loose schema with `createMetaFullTextResponseFormat(extractionColumns)`.
- The response format now uses `strict: true`, `additionalProperties: false` on every object, and complete `required` arrays.
- Extraction row schema is generated from the active Excel extraction columns, so OpenAI returns only the expected columns.
- Removed `minimum`/`maximum` numeric schema keywords and kept runtime clamping in code.
- `package.json`, `package-lock.json`: package version bumped to `0.1.17`.
- `src/lib/version.ts`: UI version bumped to `Ver 1.52`.

Verification:

```text
Structured schema recursive local check: pass; strict=true and no object missing additionalProperties:false or required properties.
npx.cmd tsc --noEmit: pass.
```

Official reference checked:

- OpenAI Structured Outputs documentation says `additionalProperties: false` must always be set in objects, and all fields should be required with nullable types used for optional values.

## 2026-06-13 Full-text analysis history auto-save

User request:

```text
이제 잘 작동합니다. 나중에 확인하려면 결과들이 다 저장되어야 합니다.
현재 세팅으로 자동저장이 되는 상황인지요?
저장하면 리스트업을 하고 나중에 리스트 클릭하면 확인도 하는 기능이 기본적으로 있어야 합니다.
```

Answer before this change:

- No. Full-text PDF/Word analysis results were only held in the browser state and copied through CSV buttons.
- Refreshing the page or opening the app from another PC would not show previous full-text analysis results.

Implemented:

- `src/lib/meta-full-text-history.ts`: new server-side history storage for full-text analysis results.
- Stores analysis JSON, source sheet metadata, source label, review mode, reference row text, AI source/warning, and reviewer verification fields.
- Storage backend:
  - Vercel/serverless: automatically uses Google Drive if Google Drive credentials are configured.
  - Can be forced with `META_FULL_TEXT_HISTORY_STORAGE_BACKEND=google-drive`.
  - Synology/local Docker: defaults to `.data/meta/meta-full-text-history.json`.
  - Default Google Drive file: `meta-full-text-history.json`.
- `src/app/api/meta-analysis/full-text/analyze/route.ts`: auto-saves every completed analysis and returns `savedRecord`; if save fails, returns `saveError` while still showing the analysis.
- `src/app/api/meta-analysis/full-text/history/route.ts`: lists saved full-text analysis summaries.
- `src/app/api/meta-analysis/full-text/history/[id]/route.ts`: loads a saved analysis and updates reviewer verification fields.
- `src/components/MetaFullTextAssistant.tsx`: added **Saved full-text analyses** list, refresh button, click-to-open saved record, current saved-record highlighting, and **Save verification** button.
- `synology/docker/meta/.env.example`: added full-text history storage env placeholders.
- `scripts/synology-start-meta.sh`: seeds full-text history storage env values from DSM scheduler environment.
- `SERVICE.md` and `synology/docker/meta/README.md`: documented automatic full-text history saving.
- `package.json`, `package-lock.json`: package version bumped to `0.1.18`.
- `src/lib/version.ts`: UI version bumped to `Ver 1.53`.

Verification:

```text
Local full-text history storage test: saved=true, listed=1, loaded=history-test.txt, verification update persisted.
npx.cmd tsc --noEmit: pass.
bash -n scripts/synology-start-meta.sh: pass.
git diff --check: pass, CRLF warnings only.
npm.cmd run lint: pass.
npm.cmd run build: pass.
Browser check on http://127.0.0.1:3022 Screening tab: Saved full-text analyses, Refresh, and empty-list state rendered.
```

Vercel behavior:

- With the current Vercel Google Drive credentials working, this will auto-save to `google-drive:meta-full-text-history.json` after redeploy.
- If storage fails, the result remains visible and a `saveError` warning is shown so the user knows the record was not persisted.

Recommended Vercel env, optional but explicit:

```text
META_FULL_TEXT_HISTORY_STORAGE_BACKEND=google-drive
META_FULL_TEXT_HISTORY_DRIVE_FILENAME=meta-full-text-history.json
```

## 2026-06-13 Meta AI settings storage write fix

User report:

```text
openai key가 저장인 안됩니다 meta AI settings storage write failed.
```

Root cause:

- Meta AI settings originally reused the generic grant/report JSON storage helper.
- That helper can inherit `REPORT_STORAGE_BACKEND` or `GRANT_STORAGE_BACKEND`, so the AI key save path could be affected by unrelated storage settings.
- The API only returned the short error string, so the UI did not show the actual path/backend/code.

Fix:

- `src/lib/meta-ai-settings.ts`: replaced generic grant/report storage with dedicated Meta AI settings local JSON storage.
- The storage path is still `META_AI_SETTINGS_STORAGE_PATH`, default `.data/meta/meta-ai-settings.json`.
- Meta AI settings no longer inherit `REPORT_STORAGE_BACKEND` or `GRANT_STORAGE_BACKEND`.
- Storage write failures now return detailed diagnostics: operation, path, OS code, message, and help text.
- `src/app/api/meta-analysis/ai-settings/route.ts`: error responses now include detailed storage diagnostics for the UI.
- `SERVICE.md` and `synology/docker/meta/README.md`: documented that Meta AI settings storage is independent of report/grant storage.
- `package.json`, `package-lock.json`: package version bumped to `0.1.13`.
- `src/lib/version.ts`: UI version bumped to `Ver 1.48`.

Verification:

```text
npx.cmd tsc --noEmit: pass.
AI settings save with REPORT_STORAGE_BACKEND=google-drive and local META_AI_SETTINGS_STORAGE_PATH: PATCH 200, GET 200, source saved, raw key not leaked.
Serverless/read-only simulation: PATCH 400 with details.code SERVERLESS_LOCAL_STORAGE plus path/help.
npm.cmd run lint: pass.
npm.cmd run build: pass.
git diff --check: pass.
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

Never write the real OpenAI API key into `backup.md` or Git-tracked files.

## 2026-06-13 Portal-only ID/PW account management

User request:

```text
앞으로 ID, PW 삭제 추가 변경은 portal.wiregene.com에서 진행하도록 합니다
```

Implemented:

- Confirmed `/api/admin/accounts` remains writable only in Portal mode.
- Added `deletePortalAccount()` in `src/lib/portal-accounts.ts`.
- Added `DELETE /api/admin/accounts` for Portal-managed account deletion. It still requires Portal/admin authentication and is blocked outside Portal mode.
- `src/components/AccountManagementPanel.tsx`: added a Portal-only operation notice: ID/PW add/delete/change happens on `portal.wiregene.com`.
- `src/components/AccountManagementPanel.tsx`: added **ID 삭제** next to **PW 재발급** for Portal DB accounts.
- `src/components/MetaAnalysisApp.tsx`: changed the Meta header link from `Portal` to `Portal ID/PW`.
- `src/components/PortalDashboard.tsx`: added a platform notice that ID/PW add/delete/reset is handled only by Portal and research sites use Portal auth.
- `docs/wiregene-service-repo-split.md` and `docs/synology-meta-portal-split.md`: documented the Portal-only account-management rule.
- Package version bumped to `0.1.23`.
- UI version bumped to `Ver 1.58`.

Verification:

```text
npx.cmd tsc --noEmit: pass.
npm.cmd run lint: pass.
npm.cmd run build: pass.
Portal-mode API test on http://127.0.0.1:3028: created a temporary Portal account, deleted it with DELETE /api/admin/accounts, and confirmed the count dropped.
Browser verification on http://127.0.0.1:3028: Ver 1.58 visible, Portal-only ID/PW notice visible, temporary Portal user visible, PW 재발급 and ID 삭제 buttons visible, console errors=[].
Temporary account and dev server were cleaned up after verification.
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

Important:

- Do not manage writable ID/PW operations inside Meta or Search.
- Do not store real passwords, temporary passwords, API keys, or tokens in Git or `backup.md`.

## 2026-06-13 Saved full-text dropdown, upload-button placement, and reference row cleanup

User request:

```text
Full-text article AI eligibility assistant 항목에 현재 논문이 8개 밖에 안보입니다. 올린 리스트 전체가 보일 수 있도록 풀다운이나 드롭다운 형식으로 변경합니다. 그리고 full-text 분석 버튼을 업로드 버튼 주변에 위치해야 하고 엑셀 screening row 또는 논문 정보에는 왜 반복되는 3개 내용이 보이나요?
```

Implemented:

- `src/components/MetaFullTextAssistant.tsx`: replaced the saved full-text card list limited by `slice(0, 8)` with a full saved-article dropdown.
- Saved history loading now requests `limit=500`, matching the current maximum stored history count.
- `src/app/api/meta-analysis/full-text/history/route.ts`: default GET and reviewer-settings PATCH overview limit changed from 50 to 500.
- Moved the **Analyze full text / Analyze queue** button into the full-text upload box directly below the file input.
- Added `stripGeneratedReferenceContext()` so generated `Excel source sheet: ...; review mode: ...` lines are hidden from the textarea and cannot accumulate on repeat analysis.
- Existing saved records that contain repeated generated context lines are cleaned when opened in the UI.
- Package version bumped to `0.1.22`.
- UI version bumped to `Ver 1.57`.

Verification:

```text
npx.cmd tsc --noEmit: pass.
npm.cmd run lint: pass.
npm.cmd run build: pass.
Seeded 10 temporary TXT full-text records through POST /api/meta-analysis/full-text/analyze.
Browser verification on http://127.0.0.1:3027: Ver 1.57 rendered; Saved article list showed 10/10; saved dropdown had 11 options including placeholder; file input multiple=true; Analyze full text button was inside the upload box; repeated Excel source sheet lines were stripped from the reference textarea; console errors=[].
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

Do not store real API keys or Google tokens in Git or backup files.

## 2026-06-13 Batch full-text upload and sequential AI review

User request:

```text
논문을 AI가 리뷰할 때 한꺼번에 화일 업로드하고 순차적으로 분석하는 방법이 좋겠습니다. 업로드를 하나하나 하다보니 상당한 매뉴얼 작업이 들어갑니다
```

Implemented:

- `src/components/MetaFullTextAssistant.tsx`: changed the full-text upload state from a single `File` to a multi-file queue.
- The file input now supports `multiple` for PDF, Word, TXT, and MD full-text files.
- The full-text analysis button now processes selected files sequentially, one request at a time, through the existing `POST /api/meta-analysis/full-text/analyze` route.
- Each file still gets its own saved full-text history record, so later verification can open records from **Saved full-text analyses**.
- Added a **Batch analysis queue** panel showing each file as `pending`, `analyzing`, `saved`, or `failed`, plus decision/confidence/message when available.
- Final batch notice reports saved and failed counts, e.g. `Saved X/Y files; failed Z`.
- The file input is disabled while the sequential batch is running to prevent queue/history mismatch.
- Package version bumped to `0.1.21`.
- UI version bumped to `Ver 1.56`.

Verification:

```text
npx.cmd tsc --noEmit: pass.
npm.cmd run lint: pass.
npm.cmd run build: pass.
Browser verification on http://127.0.0.1:3026: Ver 1.56 rendered, Screening tab opened, file input has multiple=true, batch instruction text rendered, console errors=[].
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

Notes for next PC:

- Continue from `C:\Users\rhhyu\Documents\GitHub\wiregene-meta-analysis`.
- Do not store real OpenAI keys or Google tokens in Git or backup files.
- Batch upload is UI-driven; server API remains single-file per request to keep extraction/OpenAI/storage load sequential and traceable.

## 2026-06-14 Large full-text upload diagnostics and direct Google Drive path

Actual working repository:

```text
C:\Users\rhhyu\Documents\GitHub\wiregene-meta-analysis
```

User-reported unresolved failure:

```text
After uploading 18 Zuhdi-OccupationalHealthProblems-2020.pdf (5.6 MB), Batch analysis queue showed saved 0, failed 1, and only "full-text analysis failed" / "full-text 분석에 실패했습니다."
```

Root cause found by two delegated specialist agents:

- PDF extraction itself is not the likely failure for the Zuhdi PDF. Local extraction of the recorded 5.9 MB / 146 page PDF succeeded with 140,617 chars in the previous verification.
- On Vercel, direct function request/response body size is 4.5 MB. A 5.6 MB multipart upload can be rejected by the platform before the analyzer route runs, producing a non-JSON 413 style response that the old UI collapsed into a generic failure.
- Save failure, analysis failure, OpenAI fallback, and platform upload rejection were mixed together in the batch UI.

Implemented:

- `src/app/api/meta-analysis/full-text/upload-session/route.ts`: new small JSON endpoint creates a Google Drive resumable upload session for large files.
- `src/lib/google-drive-storage.ts`: added Google Drive resumable upload session creation, binary download, and metadata lookup helpers.
- `src/app/api/meta-analysis/full-text/analyze/route.ts`: accepts both normal multipart uploads and JSON `{ driveFileId }` analysis requests.
- Large files are downloaded by the server from Google Drive after the browser uploads them directly, so the Vercel request body no longer carries the PDF.
- Full-text analyze route now returns structured diagnostics: `requestId`, `phase`, `source`, `fileName`, `fileSize`, `mimeType`, `elapsedMs`, `status`, `extractedTextLength`, and actionable `help`.
- Analysis success plus history save failure is now returned as `analyzed_not_saved`, not as a failed analysis.
- `src/components/MetaFullTextAssistant.tsx`: files larger than 4 MB automatically use the direct Google Drive upload path, then call analysis with the Drive file id.
- Batch queue statuses are now `pending`, `analyzing`, `saved`, `analyzed_not_saved`, and `failed`.
- Batch queue summary now shows saved, analyzed-not-saved, and failed counts separately.
- Batch rows preserve long diagnostic text with line breaks and include `Open saved result` for saved rows.
- Non-JSON HTTP errors such as Vercel 413 are now converted into visible diagnostic payloads instead of the generic failure text.
- `src/lib/pdf-text.ts`: worker resolution now checks actual existing `pdf.worker.mjs` candidates before calling `PDFParse.setWorker`, and PDF parser failures are mapped to useful messages for DOMMatrix, worker, encrypted PDF, invalid PDF, and generic parse failures.
- `next.config.ts`: added `experimental.proxyClientMaxBodySize: "250mb"` so self-hosted Next proxy buffering does not silently truncate larger local/Synology uploads.
- Full-text analyze route `maxDuration` increased to 300 seconds.
- Package version bumped to `0.1.25`.
- UI version bumped to `Ver 1.60 | 2026 copyright by JK Hyun`.

Verification:

```text
npm run lint: pass
npx tsc --noEmit: pass
npm run build: pass
```

API verification on existing local dev server with `Host: meta.wiregene.com`:

```text
Small TXT multipart upload: HTTP 200, saved true, source multipart, status saved, extractedTextLength 283.
Bad JSON Drive request: HTTP 400, error includes driveFileId requirement, phase parse_google_drive_reference, source google-drive, requestId, help.
Upload-session request without local Drive credentials: HTTP 400, phase create_google_drive_upload_session, help explains required Google Drive env vars.
Actual user-provided plan PDF path: HTTP 200, saved true, source multipart, status saved, extractedTextLength 13,156, aiUsed false locally because no local OpenAI key was configured.
```

Browser verification:

```text
Production server in meta mode on http://127.0.0.1:3210: Ver 1.60 visible.
Screening tab opened.
Full-text article AI eligibility assistant visible.
Analyze full text button visible.
Saved full-text analyses list visible.
Console errors: none.
Temporary verification server stopped after the check.
```

Operational requirements for Vercel large PDF uploads:

```text
META_FULL_TEXT_HISTORY_STORAGE_BACKEND=google-drive or REPORT_STORAGE_BACKEND=google-drive
GOOGLE_DRIVE_CLIENT_ID=<oauth-client-id>
GOOGLE_DRIVE_CLIENT_SECRET=<oauth-client-secret>
GOOGLE_DRIVE_REFRESH_TOKEN=<oauth-refresh-token generated with the same client id/secret>
GOOGLE_DRIVE_FOLDER_ID=<target folder id>
OPENAI_API_KEY=<deployment secret> or saved Meta AI settings
```

Do not store real Google tokens, OpenAI keys, passwords, or temporary credentials in Git or backup files.

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-13 Included-paper Excel dataset verification

User request:

```text
Screening 메뉴에서 included로 된 논문의 data들은 엑셀로 정리해야 하므로, 논문 분석에 필요한 모든 parameter와 publication bias, RoB 근거 자료까지 자동 저장하고 검증/수동입력 페이지가 필요합니다. 검증되면 엑셀 데이터로 자동 저장되어야 합니다.
```

Implemented:

- Added RoB/publication-bias fields to the project extraction schema:
  - `risk_of_bias_tool`, `rob_selection_recruitment`, `rob_measurement_outcome`, `rob_confounding_adjustment`, `rob_missing_data`, `rob_selective_reporting`, `rob_overall_judgement`, `rob_supporting_quote`, `rob_page_table`
  - `response_rate`, `funding_source`, `conflict_of_interest`
  - `publication_bias_outcome_group`, `publication_bias_effect_size`, `publication_bias_standard_error`, `publication_bias_small_study_notes`, `publication_bias_eligible_for_funnel`
  - `manual_required_fields`, `manual_verification_notes`, `data_extractor`, `data_verifier`, `data_verified`
- Updated OpenAI full-text instructions so RoB fields and publication-bias inputs are extracted only when supported by article evidence, and missing items are listed for manual review.
- Added `MetaFullTextExtractionReview` storage inside each full-text history record so corrected Excel rows, verified state, verifier, notes, and verification time persist.
- Added `src/lib/meta-extraction-dataset.ts` to build an Excel-ready dataset from human-included full-text records only.
- Added `GET/PATCH /api/meta-analysis/extraction-dataset`.
  - GET returns included records, Excel-ready columns, CSV, and counts.
  - PATCH saves corrected/verified Excel rows back to the full-text history record.
- Added `src/components/MetaExtractionDatasetPanel.tsx` in the Screening stage.
  - Shows included records only.
  - Displays saved counts: included records, Excel rows, verified rows, manual fields.
  - Shows all extraction sections plus audit fields, RoB fields, publication-bias fields, missing fields, and validation issues.
  - Supports `Save draft`, `Save verified Excel data`, row CSV copy, and full Excel CSV copy.
- `package.json`, `package-lock.json`: package version bumped to `0.1.20`.
- `src/lib/version.ts`: UI version bumped to `Ver 1.55`.

Verification:

```text
Temporary dataset storage test: included=1, rows=1, verified=1, columns include risk_of_bias_tool, CSV contains RoB value.
npx.cmd tsc --noEmit: pass.
npm.cmd run lint: pass.
npm.cmd run build: pass.
Browser verification on local meta mode: Ver 1.55 visible; Screening shows Included-paper Excel dataset verification panel; included test record appears; risk_of_bias_tool and publication_bias_eligible_for_funnel fields visible; Save verified Excel data displays 저장완료 and verified count updates.
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-13 Meta full-text reviewer names and save confirmation

User request:

```text
Reviewer verification checks, Human verification worksheet의 CSV 복사 버튼이 저장인지 혼동됩니다. 저장이면 저장으로 표시하고 저장완료와 완료 파일 수가 보여야 합니다. Reviewer 1/2 이름도 분석 전에 저장되어야 합니다.
```

Implemented:

- CSV buttons are explicitly copy-only:
  - `Copy extraction CSV (not saved)`
  - `Copy verification CSV (not saved)`
  - Clipboard notice now says the CSV was copied and is not saved.
- Added reviewer name setup above full-text upload:
  - `reviewer 1 name`
  - `reviewer 2 name`
  - `Save reviewer names`
  - `Reviewer names: saved/not saved`
  - `Saved files: n · Verification completed: n`
- Full-text analysis is disabled until both reviewer names are saved, not merely typed.
- Saving reviewer names persists to full-text history storage and fills missing reviewer names in existing saved records without overwriting already recorded names.
- Saved full-text history summaries now show verification pending/complete and reviewer 1/2 names.
- Human verification save now stores reviewer names with the verification record and shows `저장완료` with total saved files and verification completed count.
- History API now returns `{ records, reviewerSettings, stats }`.
- Added `PATCH /api/meta-analysis/full-text/history` for reviewer name settings.
- `package.json`, `package-lock.json`: package version bumped to `0.1.19`.
- `src/lib/version.ts`: UI version bumped to `Ver 1.54`.

Verification:

```text
Temporary local history storage test: saved=true, reviewer names saved, total=1, verification completed=1.
npx.cmd tsc --noEmit: pass.
npm.cmd run lint: pass.
npm.cmd run build: pass.
Browser verification on local meta mode: Ver 1.54 visible; reviewer name fields visible; saved names/status/count visible; saved history item shows reviewer names; loaded analysis shows Copy extraction CSV (not saved), Save verification, Copy verification CSV (not saved); UI save verification displays 저장완료 and updates Verification completed to 1.
```

Operational note:

- Do not open local Basic Auth test URLs as `http://user:password@host`; browser relative `fetch()` can fail when the base URL contains credentials. Use normal Basic Auth or remove credentials from the URL after authentication.

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-13 Meta AI settings Vercel Google Drive storage fix

User-reported error:

```text
meta AI settings storage write failed.
operation: write
path: /var/task/.data/meta/meta-ai-settings.json
code: SERVERLESS_LOCAL_STORAGE
message: The deployment filesystem is read-only, so Meta AI settings cannot be saved as a local JSON file.
```

Root cause:

- `/var/task` means the running deployment is serverless/read-only, not the writable Synology Docker volume.
- The previous Meta AI settings storage supported local JSON only, so in-app key saving could not work on Vercel/serverless deployments.
- Real OpenAI keys must never be committed to Git or written into `backup.md`.

Implemented:

- `src/lib/meta-ai-settings.ts`: added dedicated `META_AI_SETTINGS_STORAGE_BACKEND` with `local-json` and `google-drive`.
- On Vercel/serverless, if Google Drive credentials are already configured, Meta AI settings automatically use `google-drive`.
- Explicit `META_AI_SETTINGS_STORAGE_BACKEND=google-drive` stores the encrypted Meta AI settings JSON through the existing Google Drive helper.
- Added `META_AI_SETTINGS_DRIVE_FILENAME` and `META_AI_SETTINGS_DRIVE_FILE_ID` support.
- Added precise errors:
  - `SERVERLESS_LOCAL_STORAGE` now tells the user to use Google Drive storage or deployment `OPENAI_API_KEY`.
  - `GOOGLE_DRIVE_NOT_CONFIGURED` tells the user which Google Drive credentials are missing.
- `src/components/MetaAiSettingsPanel.tsx`: displays the active storage backend/path.
- `synology/docker/meta/.env.example`: added Meta AI Drive storage and Google Drive credential placeholders.
- `scripts/synology-start-meta.sh`: can seed the new Meta AI/Google Drive env values from DSM scheduler environment.
- `SERVICE.md` and `synology/docker/meta/README.md`: documented the Vercel read-only behavior and storage options.
- `package.json`, `package-lock.json`: package version bumped to `0.1.14`.
- `src/lib/version.ts`: UI version bumped to `Ver 1.49`.

Verification:

```text
npx.cmd tsc --noEmit: pass.
Local Meta AI settings save with REPORT_STORAGE_BACKEND=google-drive: pass; backend remained local-json and saved key was masked.
Forced Vercel local-json save: returned SERVERLESS_LOCAL_STORAGE with Vercel/Google Drive guidance.
Forced google-drive without Drive credentials: returned GOOGLE_DRIVE_NOT_CONFIGURED with credential guidance.
bash -n scripts/synology-start-meta.sh: pass.
npm.cmd run lint: pass.
npm.cmd run build: pass.
```

Vercel/serverless setup options:

```text
Option A, in-app key storage:
META_AI_SETTINGS_STORAGE_BACKEND=google-drive
META_AI_SETTINGS_SECRET=<stable-secret>
GOOGLE_DRIVE_CLIENT_ID=<oauth-client-id>
GOOGLE_DRIVE_CLIENT_SECRET=<oauth-client-secret>
GOOGLE_DRIVE_REFRESH_TOKEN=<oauth-refresh-token>

Option B, no in-app key storage:
OPENAI_API_KEY=<deployment-secret>
OPENAI_MODEL=gpt-5-nano
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-12 In-app AI evaluation settings menu

User request:

```text
필요하면 hyunlab-wiregene-platform처럼 AI 평가 메뉴를 만들고 api key를 넣도록 합니다
```

Implemented:

- `src/lib/meta-ai-settings.ts`: added encrypted Meta AI settings storage.
  - Storage env: `META_AI_SETTINGS_STORAGE_PATH`
  - Default path: `.data/meta/meta-ai-settings.json`
  - Encryption seed env: `META_AI_SETTINGS_SECRET` preferred; falls back to existing server secrets such as `WIREGENE_SECRET_KEY`, `PORTAL_AUTH_CHECK_SECRET`, or Basic Auth secrets.
  - Stored OpenAI key is encrypted with AES-256-GCM and only masked values are returned to the UI.
- `src/app/api/meta-analysis/ai-settings/route.ts`: added admin-only GET/PATCH API for Meta AI settings.
- `src/components/MetaAiSettingsPanel.tsx`: added the in-app **AI 평가 설정** panel for enabled/model/API key save/delete.
- `src/components/MetaStudyWorkspace.tsx`: admin users now see an **AI 평가 설정** menu item in the Meta sidebar.
- `src/lib/meta-full-text-analysis.ts`: full-text analysis now resolves OpenAI config from saved Meta AI settings first, then falls back to environment `OPENAI_API_KEY`.
- `synology/docker/meta/.env.example`: added `META_AI_SETTINGS_STORAGE_PATH` and `META_AI_SETTINGS_SECRET`.
- `scripts/synology-start-meta.sh`: scheduler env seeding now includes `META_AI_SETTINGS_STORAGE_PATH` and `META_AI_SETTINGS_SECRET`.
- Docs updated in `SERVICE.md`, `docs/synology-meta-portal-split.md`, and `synology/docker/meta/README.md`.
- `package.json`, `package-lock.json`: package version bumped to `0.1.11`.
- `src/lib/version.ts`: UI version bumped to `Ver 1.46`.

Verification:

```text
npx.cmd tsc --noEmit: pass.
AI settings API temp-key test: PATCH 200, GET 200, source saved, masked key returned, raw test key not leaked.
npm.cmd run lint: pass.
npm.cmd run build: pass.
Git Bash syntax check for scripts/synology-start-meta.sh: pass.
Browser verification on http://127.0.0.1:3017 with temporary admin auth: Ver 1.46, admin badge, AI 평가 설정 button, OpenAI full-text 평가 설정 panel, API key field, model field, save button all rendered.
```

Synology first setup with a stable AI settings encryption secret:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && META_AI_SETTINGS_SECRET='YOUR_STABLE_RANDOM_SECRET' /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

Optional one-line setup with OpenAI key as scheduler env:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && META_AI_SETTINGS_SECRET='YOUR_STABLE_RANDOM_SECRET' OPENAI_API_KEY='YOUR_OPENAI_API_KEY' OPENAI_MODEL='gpt-5-nano' /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

Never write the real OpenAI API key or real `META_AI_SETTINGS_SECRET` into `backup.md` or Git-tracked files.

## 2026-06-13 AI settings menu visibility fix

User report:

```text
왼쪽에 AI 설정 메뉴가 안보입니다
```

Root cause:

- The Meta sidebar showed **AI 평가 설정** only when `currentUser.isAdmin` was true.
- On Synology/Meta standalone Basic Auth, a user can be authenticated but not marked admin if `WIREGENE_ADMIN_EMAILS`, `APP_ADMIN_USERS`, or `APP_ADMIN_USER` is not set.
- The AI settings API also required `isAdmin`, so the menu could be hidden for the normal Meta login user.

Fix:

- `src/components/MetaStudyWorkspace.tsx`: show **AI 평가 설정** to any authenticated Meta user (`currentUser`) instead of admin-only.
- `src/app/api/meta-analysis/ai-settings/route.ts`: allow authenticated Meta users to GET/PATCH AI settings. Unauthenticated requests still return `401`.
- `package.json`, `package-lock.json`: package version bumped to `0.1.12`.
- `src/lib/version.ts`: UI version bumped to `Ver 1.47`.

Verification:

```text
npx.cmd tsc --noEmit: pass.
Non-admin Basic Auth AI settings API test: GET 200 with settings payload.
npm.cmd run lint: pass.
npm.cmd run build: pass.
Browser verification with non-admin Basic Auth user on http://127.0.0.1:3018: Ver 1.47 visible, no admin badge, AI 평가 설정 button visible, settings panel opens with API key/model/save controls.
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-12 Hyunlab-style OpenAI quality review for full-text meta-analysis

User request:

```text
현재 hyunlab-wiregene-platform이 Openai platform을 사용하여 연구원들 주간보고를 평가하는데 사용 중입니다. 이를 여기에도 활용하는게 좋겠습니다
```

Implemented:

- `src/lib/meta-full-text-analysis.ts`: added required `reviewEvaluation` to every full-text analysis result.
- `reviewEvaluation` follows the Hyunlab weekly-report evaluation pattern: `score`, `grade`, `summary`, `improvement`, criteria-level score/status/comment, and `modelName`.
- OpenAI full-text analysis now requests Structured Outputs with a JSON schema and asks the model to score its own extraction against meta-analysis criteria.
- Meta-specific review criteria added:
  - eligibility fit
  - extraction completeness
  - evidence traceability
  - quantitative integrity
  - reviewer actionability
  - risk visibility
- Added a conservative safety downgrade: if OpenAI proposes `include_quantitative` but no explicit denominator-based outcome pair or no numeric cell-level evidence is present, the decision is downgraded to `uncertain` and a validation issue is shown.
- Fallback mode now records a low quality-review score (`25`, `fallback-human-verification-required`) instead of looking like a normal AI result.
- `src/components/MetaFullTextAssistant.tsx`: added an `AI review evaluation` panel showing score, grade, summary, improvement, and criteria cards.
- `src/components/MetaFullTextAssistant.tsx`: verification CSV now includes AI review score/grade/summary/improvement/criteria JSON so the Excel verification trail can preserve this information.
- `SERVICE.md`, `docs/synology-meta-portal-split.md`, and `synology/docker/meta/README.md`: documented that OpenAI enables eligibility/extraction plus Hyunlab-style quality review.
- `package.json`, `package-lock.json`: package version bumped to `0.1.10`.
- `src/lib/version.ts`: UI version bumped to `Ver 1.45`.

Verification:

```text
npx.cmd tsc --noEmit: pass.
npm.cmd run lint: pass.
npm.cmd run build: pass.
Direct full-text route fallback test with synthetic TXT: HTTP 200, aiUsed false, decision uncertain, reviewScore 25, reviewGrade fallback-human-verification-required, all six review criteria returned.
```

Synology OpenAI setup command:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && OPENAI_API_KEY='YOUR_OPENAI_API_KEY' OPENAI_MODEL='gpt-5-nano' /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

Never write the real OpenAI API key into `backup.md` or Git-tracked files.
## 2026-06-14 Meta full-text upload and workspace width fix

User clarified that the requested UI/upload work belongs to `meta.wiregene.com`, not Omni.

Changes completed in the real source repository `C:\Users\rhhyu\Documents\GitHub\wiregene-meta-analysis`:

- Added a collapsible outer left navigation rail in `ResearchWorkspaceShell`.
- Added a collapsible Meta study project rail in `MetaStudyWorkspace`.
- Moved recurring stage/workbook explanatory copy into closed `details` sections so routine work screens are less crowded.
- Replaced the `Saved full-text analyses` dropdown with a tall scrollable saved-article list and kept the client-side history upsert cap at 500 records.
- Added full-text analyze route diagnostics for upload received, analysis completed, history saved, history save failed, and analysis failure.
- Set the full-text analyze route `maxDuration` to 60 seconds.
- Added long full-text compaction before OpenAI review. Full extracted text still feeds fallback signals, but OpenAI receives a bounded article-focused text bundle to avoid timeout/context failures.
- Set OpenAI full-text calls to no retries and a 45 second request timeout.
- Updated visible version label to include `2026 copyright by JK Hyun`.
- Bumped visible app version to `Ver 1.59 | 2026 copyright by JK Hyun` and npm package version to `0.1.24`.

18 Zuhdi PDF verification:

- File checked: `G:\내 드라이브\1_Thesis\Review_Pain Violin\Data\260606 New data\Articles\A2 Instrument 36\18 Zuhdi-OccupationalHealthProblems-2020.pdf`
- PDF header `%PDF-1.6`, not encrypted, 5,916,449 bytes.
- `pdf-parse` extraction succeeded: 146 pages, 140,617 extracted characters.
- Direct full-text analysis succeeded with OpenAI disabled fallback.
- Route-handler FormData upload test succeeded: HTTP 200, saved history record created, extractedTextLength 140,617.
- The long PDF warning was recorded: full text compacted for AI review from 137,670 to 63,977 chars.

Verification:

- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed.

## 2026-06-14 Large full-text upload CORS fix with same-origin chunk proxy

User reported that the 5.6 MB full-text PDF still failed in the UI:

```text
Large-file direct upload failed before analysis. Details: Failed to fetch
```

Root cause:

- The previous fix created a Google Drive resumable upload session, but the browser then sent the PDF directly to the Google upload URL.
- That can fail before the Meta analyzer route sees the file, typically as browser/CORS/network-layer `Failed to fetch`.
- The direct browser-to-Google path has now been removed.

Implemented in `C:\Users\rhhyu\Documents\GitHub\wiregene-meta-analysis`:

- Added `src/app/api/meta-analysis/full-text/upload-chunk/route.ts`.
- Large files now use this path:
  1. Browser requests `/api/meta-analysis/full-text/upload-session`.
  2. Browser slices the file into about 2.5 MB chunks.
  3. Browser sends each chunk only to same-origin `/api/meta-analysis/full-text/upload-chunk`.
  4. The Meta server forwards each chunk to the Google Drive resumable upload URL with `Content-Range`.
  5. After Google Drive returns the final file id, `/api/meta-analysis/full-text/analyze` analyzes by `driveFileId`.
- Updated `src/components/MetaFullTextAssistant.tsx` to remove direct browser `PUT` to Google Drive.
- Updated upload/analyze diagnostics so failures now identify `receive_or_forward_upload_chunk` or `forward_chunk_to_google_drive` rather than collapsing into only `Failed to fetch`.
- Updated large-file help text from "direct Google Drive upload" to "Meta server chunk upload path".
- Bumped npm package version to `0.1.26`.
- Bumped visible UI version to `Ver 1.61 | 2026 copyright by JK Hyun`.

Verification:

```text
npm run lint: pass.
npx tsc --noEmit: pass.
npm run build: pass.
Production build includes /api/meta-analysis/full-text/upload-chunk.
Local chunk API missing-session test: HTTP 400 JSON with requestId and phase receive_or_forward_upload_chunk.
Local chunk API fake Google session test: HTTP 502 JSON with phase forward_chunk_to_google_drive and chunk byte diagnostics, proving server-side forwarding path runs.
curl with Host: meta.wiregene.com showed Ver 1.61.
Browser verification in forced Meta mode on http://127.0.0.1:3211: Ver 1.61 visible; Screening tab unique; full-text upload label visible; file input multiple=true; accepts PDF, Word, TXT, MD; Analyze full text visible; console errors=[].
```

Notes:

- No OpenAI or Google secret was written to Git or backup.
- The test did not upload a real full-text article to Google/OpenAI. It verified the new upload path and UI without transmitting a private PDF.

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```
