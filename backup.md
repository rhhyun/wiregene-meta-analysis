# Wiregene Meta 작업 백업

작성일: 2026-06-12

## 작업 위치

실제 작업 저장소:

```text
C:\Users\rhhyu\Documents\GitHub\wiregene-meta-analysis
```

원격 저장소:

```text
https://github.com/rhhyun/wiregene-meta-analysis.git
```

주의:

- `C:\Users\rhhyu\Documents\Meta.wiregene.com`은 안내용 폴더이며 실제 Meta 소스는 위 GitHub 폴더에 있다.
- 작업이 끝나면 GitHub에 자동 commit/push한다.
- Synology 자동 배포를 실행하지 못했거나 확인하지 못하면 마지막에 작업 스케줄러 명령을 남긴다.

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
