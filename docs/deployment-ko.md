# 외부 배포 가이드: Vercel + GitHub Actions + Google Drive

이 프로젝트는 두 부분으로 나누어 운영합니다.

- **Vercel**: 인터넷에서 접속하는 웹 대시보드와 Zotero 동기화 버튼을 제공합니다.
- **GitHub Actions**: 매주 월요일/목요일 05:00 KST에 PubMed와 뉴스를 검색하고 Google Drive JSON DB를 갱신합니다.

이렇게 분리하면 예약 실행은 이미 성공한 GitHub Actions 구조를 유지하고, Vercel은 어디서나 접속 가능한 화면 역할만 담당합니다.

## 1. GitHub에 최신 코드 올리기

GitHub Desktop에서 이 저장소를 열고 `Fetch origin` 후 변경사항을 commit/push합니다.

저장소:

```text
rhhyun/research-briefing-platform
```

## 2. Vercel에서 프로젝트 만들기

1. Vercel에 로그인합니다.
2. `Add New... > Project`를 선택합니다.
3. GitHub 저장소 `rhhyun/research-briefing-platform`를 import합니다.
4. Framework Preset은 `Next.js`로 둡니다.
5. Build Command는 기본값 `npm run build`를 사용합니다.
6. Output Directory는 비워 둡니다.

## 3. Vercel Environment Variables

Vercel 프로젝트의 `Settings > Environment Variables`에 아래 값을 추가합니다.

필수:

```text
REPORT_STORAGE_BACKEND=google-drive
GOOGLE_DRIVE_CLIENT_ID=Google OAuth client id
GOOGLE_DRIVE_CLIENT_SECRET=Google OAuth client secret
GOOGLE_DRIVE_REFRESH_TOKEN=Google OAuth refresh token
GOOGLE_DRIVE_FOLDER_NAME=Research Briefing Platform
GOOGLE_DRIVE_DATABASE_FILENAME=research-briefing-database.json
NCBI_EMAIL=NCBI 요청용 이메일
CRON_SECRET=긴 랜덤 문자열
ZOTERO_API_KEY=Zotero write 권한 API key
ZOTERO_LIBRARY_TYPE=user
ZOTERO_LIBRARY_ID=Zotero userID 숫자
ZOTERO_ROOT_COLLECTION_NAME=Research Briefings
ZOTERO_AUTO_CREATE_COLLECTIONS=true
ALLOW_PUBLIC_RUN=false
APP_BASIC_AUTH_USER=접속 아이디
APP_BASIC_AUTH_PASSWORD=긴 접속 비밀번호
```

선택:

```text
OPENAI_API_KEY=OpenAI API key
OPENAI_MODEL=gpt-5-nano
NCBI_API_KEY=NCBI API key
```

개인 Google Drive OAuth 방식을 쓰는 현재 구조에서는 `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`을 Vercel에 넣지 않습니다.

`APP_BASIC_AUTH_USER`와 `APP_BASIC_AUTH_PASSWORD`를 설정하면 외부 URL 접속 시 브라우저 로그인 창이 뜹니다. 이 값이 비어 있으면 대시보드가 공개됩니다.

## 4. Deploy

환경변수를 저장한 뒤 Vercel에서 `Deploy`를 누릅니다.

배포가 끝나면 다음 흐름으로 확인합니다.

1. Vercel이 제공한 URL을 엽니다.
2. Basic Auth 아이디와 비밀번호를 입력합니다.
3. Google Drive에 저장된 최신 리포트가 보이는지 확인합니다.
4. `Sync to Zotero` 버튼을 눌러 Zotero 컬렉션에 저장되는지 확인합니다.

## 4-1. Wiregene 도메인 분리

현재 웹 앱은 하나의 Next.js/Vercel 배포에서 접속 host에 따라 화면을 분리합니다.

```text
search.wiregene.com  -> Research Briefing / 연구과제 / 논문 관리
meta.wiregene.com    -> Meta-analysis only
portal.wiregene.com  -> Portal / account management / site launcher
```

같은 Vercel 프로젝트에 세 도메인을 모두 연결합니다. `WIREGENE_APP_MODE`는
단일 공용 배포에서는 비워 둡니다. 이 값을 `meta` 또는 `portal`로 강제로 넣으면
host 기반 자동 분기가 무시됩니다. 별도 Vercel 프로젝트를 만들 때만 고정 모드로
사용합니다.

Cloudflare DNS를 사용하는 경우 Vercel domain inspect가 요구하는 A 레코드를
Cloudflare에 추가합니다.

```text
A search.wiregene.com  76.76.21.21
A meta.wiregene.com    76.76.21.21
A portal.wiregene.com  76.76.21.21
```

확인 명령:

```powershell
npx vercel inspect https://search.wiregene.com
npx vercel domains inspect meta.wiregene.com
npx vercel domains inspect portal.wiregene.com
```

도메인이 Ready이면 `search`, `meta`, `portal` 각각 Basic Auth realm과 첫 화면이
다르게 표시됩니다. `meta` 도메인은 `/api/meta-analysis/*`만, `portal` 도메인은
`/api/admin/*`만 허용하고, search 도메인은 두 내부 관리 API를 직접 열지 않습니다.

## 5. 자동 실행은 GitHub Actions가 담당

Vercel 배포 후에도 정기 검색은 GitHub Actions가 계속 담당합니다.

현재 workflow 일정:

```text
월요일/목요일 05:00 KST
일요일/수요일 20:00 UTC
```

GitHub Actions에서 성공하면 Google Drive의 `research-briefing-database.json`이 갱신되고, Vercel 대시보드는 그 파일을 읽어 최신 리포트를 보여줍니다.

## 6. 수동 실행 버튼

운영 환경에서는 `ALLOW_PUBLIC_RUN=false`를 유지합니다.

이 설정에서는 외부 대시보드의 수동 리포트 생성 API가 차단됩니다. 실제 정기 실행은 GitHub Actions에서 처리하므로 정상입니다. 외부에서 수동 실행까지 열면 Zotero와 Google Drive 쓰기 권한이 연결된 API가 노출되므로 권장하지 않습니다.

## 7. 배포 후 흔한 문제

`401 Authentication required`:

`APP_BASIC_AUTH_USER`와 `APP_BASIC_AUTH_PASSWORD`가 설정되어 있습니다. Vercel 환경변수에 넣은 값을 입력합니다.

`Google OAuth refresh failed: invalid_grant`:

`GOOGLE_DRIVE_REFRESH_TOKEN`이 만료되었거나 다른 OAuth client 값과 섞였습니다. 로컬에서 `npm run google-drive:oauth`로 refresh token을 다시 발급하고 Vercel과 GitHub Secrets를 같은 값으로 갱신합니다.

`Zotero is not configured`:

Vercel 환경변수에 `ZOTERO_API_KEY`와 `ZOTERO_LIBRARY_ID`가 누락되었습니다. 추가 후 redeploy합니다.

`Zotero rejected the sync request`:

Zotero API key에 write 권한이 없거나 `ZOTERO_LIBRARY_ID`가 다른 계정/그룹을 가리킵니다. `npm run zotero:whoami`로 로컬에서 확인한 값과 맞춥니다.

대시보드에 리포트가 없음:

Vercel의 `REPORT_STORAGE_BACKEND`가 `google-drive`인지 확인하고, `GOOGLE_DRIVE_FOLDER_NAME`과 `GOOGLE_DRIVE_DATABASE_FILENAME`이 GitHub Actions에서 생성한 파일 위치와 같은지 확인합니다.

## 8. Synology grant 저장 파일

시놀로지 Docker 실행에서는 과제 관련 상태를 기본적으로 아래 파일에 저장합니다.

```text
GRANT_STORAGE_BACKEND=
GRANT_CANDIDATE_STORAGE_PATH=.data/grant-candidates.json
GRANT_EXCLUSION_STORAGE_PATH=.data/grant-exclusions.json
GRANT_KEYWORD_PRESET_STORAGE_PATH=.data/grant-keyword-presets.json
GRANT_SEARCH_RFP_PREVIEW_LIMIT=4
```

`GRANT_STORAGE_BACKEND`가 비어 있으면 `REPORT_STORAGE_BACKEND` 값을 따릅니다. 시놀로지처럼 디스크가 있는 Docker 환경에서는 `REPORT_STORAGE_BACKEND=local-json` 또는 비어 있는 `GRANT_STORAGE_BACKEND`를 사용해 `.data`에 저장합니다. `scripts/synology-web-start.sh`는 시작 시 `.data`와 `.logs`를 만들고 Docker 컨테이너에 위 환경변수를 전달합니다.

Vercel처럼 `/var/task`에 쓸 수 없는 서버리스 환경에서는 grant 저장도 Google Drive를 써야 합니다. Vercel Environment Variables에 아래처럼 설정합니다.

```text
REPORT_STORAGE_BACKEND=google-drive
GRANT_STORAGE_BACKEND=google-drive
GOOGLE_DRIVE_CLIENT_ID=...
GOOGLE_DRIVE_CLIENT_SECRET=...
GOOGLE_DRIVE_REFRESH_TOKEN=...
GOOGLE_DRIVE_FOLDER_NAME=Research Briefing Platform
```

이 경우 Google Drive 폴더에 `grant-candidates.json`, `grant-exclusions.json`, `grant-keyword-presets.json` 파일이 만들어집니다.

`GRANT_SEARCH_RFP_PREVIEW_LIMIT`는 검색 결과에서 PDF/HWPX/공고문 자동요약을 붙일 상위 과제 수입니다. 기본값 4를 권장합니다. 값을 너무 크게 올리면 외부 공고 사이트 다운로드와 Vercel 함수 시간이 늘어납니다.

저장 API 회귀 검증은 Node.js 20 이상이 있는 환경에서 다음 명령으로 실행합니다. 시놀로지 호스트 Node.js가 18이면 이 검증 명령은 로컬 개발 PC에서 먼저 실행하고, NAS에서는 `scripts/synology-web-start.sh`로 Docker 웹 컨테이너를 재시작해 반영합니다.

```sh
npm run verify:grants
```
