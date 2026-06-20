# Wiregene Meta 사용 가이드

문서 버전: Ver 2.08
최종 업데이트: 2026-06-20  
적용 사이트: `https://meta.wiregene.com`  
소스 저장소: `rhhyun/wiregene-meta-analysis`

이 문서는 메타분석 경험이 많지 않은 연구자도 Wiregene Meta에서 새 연구 주제를 만들고, 검색 전략을 정리하고, full-text PDF/Word를 AI로 검토하고, 최종 엑셀 데이터셋을 검증할 수 있도록 만든 운영 가이드입니다.

앞으로 프로그램 버전이 올라가거나 저장 구조, 화면 이름, 버튼 동작, AI 분석 방식, Google Drive 연결 방식이 바뀌면 이 `guide.md`도 반드시 함께 업데이트해야 합니다. 작업 인수인계용 `backup.md`에는 실제 작업 내역을, `guide.md`에는 연구자가 따라야 할 사용법과 저장 위치를 적습니다.

## 1. 가장 중요한 원칙

Wiregene Meta는 설명용 페이지가 아니라 메타분석 실무를 줄이기 위한 작업 플랫폼입니다. 연구자가 반복해서 해야 하는 일은 크게 네 가지입니다.

1. 연구 질문과 PRISMA protocol을 정리합니다.
2. PubMed, Embase, Scopus, Web of Science, Cochrane 등에서 검색식을 설계하고 검색 결과를 기록합니다.
3. full-text PDF/Word를 업로드하여 포함/제외 후보를 AI가 먼저 판정하게 합니다.
4. 연구자가 AI 결과, reviewer 판정, 추출 데이터, 근거 문장을 검증하고 최종 엑셀 데이터셋으로 확정합니다.

중요한 데이터는 화면에 보이는 것만으로 끝나면 안 됩니다. 반드시 저장되어야 하고, 나중에 다시 열어 확인할 수 있어야 합니다.

## 2. 화면별 역할

### Overview

연구 주제의 전체 상태를 보는 곳입니다. 연구 목적, 주요 질문, 진행률, 다음 작업을 확인합니다.

### PRISMA Protocol

PICO, eligibility criteria, exposure, outcome, subgroup, risk of bias, publication bias 계획을 정리합니다.

초기에는 ChatGPT/Gemini 등에서 만든 초안을 붙여넣고 수정할 수 있어야 합니다. 확정 전에는 자유롭게 고치고, 확정 후에도 변경 이력이 남도록 저장하는 것이 원칙입니다.

### Search Design

검색식을 데이터베이스별로 설계하고 기록합니다.

PubMed만이 아니라 Embase, Scopus, Web of Science, Cochrane 검색식을 모두 기록해야 합니다. 외부 사이트에서 검색한 결과 수, 검색일, 검색식, 제한 조건도 이곳에 남깁니다.

### Screening

엑셀 workbook 기준으로 full-text 검토 대상 논문을 관리합니다.

이번 음악가 PRMD pain 예시는 다음 세 sheet의 full-text만 우선 업로드/분석합니다.

- `Core_Comparative_Obs`
- `Core_InstrumentSpecific`
- `Manual_Fulltext_Check`

나머지 sheet는 audit/support 목적이며, 필요할 때만 참고합니다.

### Full-text Article AI Eligibility Assistant

PDF, Word, TXT, MD full-text를 업로드하고 AI가 포함/제외 후보, 서술 근거 후보, 정량분석 후보, 판정보류를 제안합니다.

한 번에 여러 파일을 업로드할 수 있습니다. 업로드된 원문은 저장된 source file로 관리되므로, 다른 AI 모델을 추가로 돌릴 때 같은 파일을 다시 업로드하지 않는 것이 원칙입니다.

### AI Model Reviewer Comparison

AI reviewer 1, 2, 3이 같은 논문을 독립적으로 판정합니다.

AI 모델 비교는 사람 reviewer를 대체하는 것이 아니라 연구책임자 판단을 돕는 초안입니다. 다만 연구자가 `AI only`로 진행하겠다고 선택하면 reviewer 1/2 검토 단계를 skip하고 PI 최종 판정으로 진행할 수 있습니다.

### Human Verification Worksheet

Reviewer 1, Reviewer 2가 독립적으로 include/exclude를 확인합니다.

두 reviewer가 불일치하면 PI가 최종 판정합니다. reviewer 이름은 분석 전 미리 저장해두는 것이 좋습니다.

### Included-paper Excel Dataset Verification

포함 판정된 논문에서 엑셀 데이터셋에 들어갈 값을 검증합니다.

AI가 자동 입력한 값도 근거 문장과 함께 검증해야 합니다. 수동 입력이 필요한 항목은 `manual-required`로 표시됩니다. 검증이 끝난 행은 저장하고, 이후 XLSX/CSV로 다운로드합니다.

## 3. 버튼 이름과 실제 의미

| 버튼/동작 | 실제 의미 | 저장 여부 |
|---|---|---|
| `Copy CSV`, `board CSV 복사` | 화면의 CSV를 클립보드로 복사합니다. | 저장 아님 |
| `Save board` | 현재 workbook board 숫자와 상태를 프로젝트 파일로 저장합니다. | 저장 |
| `Save shared state` | protocol/search/workbook 등 현재 작업 상태를 공유 상태로 저장합니다. | 저장 |
| `Save DB snapshot` | 현재 프로젝트 상태를 JSON snapshot으로 서버/Google Drive에 저장합니다. | 저장 |
| `Download DB bundle` | 현재 상태를 ZIP으로 내려받습니다. | 내 PC 다운로드 |
| `Download XLSX` 또는 엑셀 다운로드 | included-paper dataset을 엑셀 파일로 내려받습니다. | 내 PC 다운로드 |
| `Google Drive 연결 시작` | Google Web OAuth로 refresh token을 새로 발급하고 검증합니다. | token 표시 후 Vercel에 저장 필요 |

혼동하지 말아야 할 점은 `복사`와 `다운로드`는 서버 저장이 아니라는 것입니다. 연구를 이어서 진행하려면 `Save board`, `Save shared state`, `Save DB snapshot`, full-text history 저장이 필요합니다.

## 4. 무엇이 어디에 저장되는가

Wiregene Meta의 저장소는 한 곳이 아니라 역할별로 나뉩니다. 아래 표가 가장 중요합니다.

| 데이터 종류 | 내용 | Synology/local 저장 | Google Drive 저장 | DB bundle 포함 |
|---|---|---|---|---|
| 소스 코드 | Next.js 앱, API, 문서 | Git checkout | GitHub | 아니오 |
| 작업 이력 | 개발/수정 인수인계 | `backup.md` | GitHub commit | 아니오 |
| 사용자 연구 목록 | 왼쪽 연구 카드 목록 | `.data/meta/user-study-projects.json` | `meta-user-study-projects.json` | 예 |
| 프로젝트 작업 상태 | protocol, search import rows, query overrides, workbook board | `.data/meta/projects/{project}/project-workspace-state.json` | `meta-projects__{project}__project-workspace-state.json` | 예 |
| 프로젝트 저장 파일 | CSV/TSV/JSON/MD/TXT export | `.data/meta/projects/{project}/{file}` | `meta-projects__{project}__{file}` | 예, 크기 제한 내 |
| AI 설정 | AI reviewer slot, model, encrypted saved API keys | `.data/meta/meta-ai-settings.json` | `meta-ai-settings.json` | redacted summary만 |
| full-text 분석 history | AI 판정, model 비교, reviewer 검증, PI 판정, extraction review | `.data/meta/projects/{project}/full-text-history.json` | `meta-projects__{project}__full-text-history.json` | 예 |
| full-text 원문 파일 | PDF/Word/TXT/MD binary 원문 | `.data/meta/projects/{project}/full-text-files/{sha}-{filename}` | Google Drive file id로 저장 | 원문 자체는 제외 |
| extraction dataset | included 논문 엑셀 데이터셋 | full-text history에서 생성/검증 내용 저장 | full-text history에서 생성/검증 내용 저장 | JSON/CSV 포함 |
| Google OAuth token | Drive online 저장용 refresh token | Synology `.env` 또는 Vercel env | Google Drive 파일이 아님 | 절대 포함 안 함 |
| OpenAI/Gemini/DeepSeek API key | AI reviewer 실행용 key | encrypted settings 또는 env | encrypted settings 또는 env | 절대 원문 포함 안 함 |

## 5. 저장 방식의 차이

### Vercel + Google Drive 온라인 저장

온라인에서 여러 PC가 같은 연구를 이어서 보려면 Google Drive 저장이 필요합니다.

Vercel Production 환경변수에 다음 값이 있어야 합니다.

```text
GOOGLE_DRIVE_CLIENT_ID
GOOGLE_DRIVE_CLIENT_SECRET
GOOGLE_DRIVE_REFRESH_TOKEN
GOOGLE_DRIVE_FOLDER_ID 또는 GOOGLE_DRIVE_FOLDER_URL

META_ALLOW_GOOGLE_DRIVE_STORAGE=true
META_PROJECT_STORAGE_BACKEND=google-drive
META_USER_PROJECTS_STORAGE_BACKEND=google-drive
META_AI_SETTINGS_STORAGE_BACKEND=google-drive
META_FULL_TEXT_HISTORY_STORAGE_BACKEND=google-drive
META_FULL_TEXT_SOURCE_STORAGE_BACKEND=google-drive
```

변경 후에는 반드시 Vercel Production redeploy가 필요합니다. Vercel 환경변수는 기존 배포에 자동 반영되지 않습니다.

### Synology/local Docker 저장

Synology/local Docker는 기본적으로 local storage를 사용합니다.

주요 기본값은 다음과 같습니다.

```text
META_PROJECT_STORAGE_BACKEND=local-json
META_PROJECT_STORAGE_ROOT=.data/meta/projects
META_USER_PROJECTS_STORAGE_BACKEND=local-json
META_USER_PROJECTS_FILE=.data/meta/user-study-projects.json
META_AI_SETTINGS_STORAGE_BACKEND=local-json
META_AI_SETTINGS_STORAGE_PATH=.data/meta/meta-ai-settings.json
META_FULL_TEXT_HISTORY_STORAGE_BACKEND=local-json
META_FULL_TEXT_SOURCE_STORAGE_BACKEND=local-file
META_FULL_TEXT_SOURCE_STORAGE_PATH=.data/meta/full-text-files
```

Synology 안내 경로는 보통 다음과 같습니다.

```text
/volume1/docker/meta/data/projects/{project}
```

Synology에서도 Google Drive 저장을 쓰려면 `META_ALLOW_GOOGLE_DRIVE_STORAGE=true`를 명시적으로 켜야 합니다.

### Browser fallback

서버 저장이 실패할 때 브라우저 다운로드나 임시 local/browser fallback 안내가 나타날 수 있습니다.

이것은 연구를 계속하기 위한 임시 안전장치입니다. 장기 보관과 여러 PC 작업을 위해서는 Google Drive 또는 Synology/local Docker 저장이 정상 동작해야 합니다.

## 6. Google Drive 연결 절차

Google Cloud Web OAuth client에는 아래 redirect URI가 정확히 등록되어 있어야 합니다.

```text
https://meta.wiregene.com/api/google-drive/oauth/callback
```

Meta production 앱은 위 callback URI를 Google OAuth `redirect_uri`로 강제로 고정해서 보냅니다. Ver 2.08부터 `meta.wiregene.com` 또는 production meta mode에서는 별도 환경변수 `GOOGLE_DRIVE_OAUTH_REDIRECT_URI`가 있어도 그 값은 무시됩니다. 이 값은 local/dev 또는 다른 호스트에서만 보조 override로 사용할 수 있습니다.

Google 로그인 화면에서 `400 오류: redirect_uri_mismatch`가 나오면 아래 주소를 먼저 열어 앱이 실제 Google에 보내는 redirect URI와 Client ID 일부를 확인합니다.

```text
https://meta.wiregene.com/api/google-drive/oauth/start?diagnose=1
```

Ver 2.05부터는 `Google Drive 연결 시작`을 눌러도 바로 Google 로그인으로 이동하지 않습니다. 먼저 Meta 내부 `Google Drive connection preflight` 화면에서 실제 redirect URI, redirect source, masked Client ID를 보여줍니다. 이후 `Continue to Google login`을 눌렀을 때도 서버가 Google authorization URL을 먼저 검사합니다. Google이 `redirect_uri_mismatch` 또는 `invalid_client`를 반환하면 사용자를 Google 오류 화면으로 보내지 않고 Meta 내부 `Google rejected this OAuth request before login` 화면에서 멈춥니다. 이 화면에 표시되는 redirect URI와 Client ID 일부가 Vercel Production에서 실제 사용 중인 값입니다.

Ver 2.06부터는 AI 평가 설정 화면의 `Google Drive 연결 시작` 버튼 자체가 `/api/google-drive/oauth/start?diagnose=1`로 이동합니다. 따라서 버튼 클릭 직후 Google 오류 화면으로 직행하면 아직 최신 배포가 반영되지 않은 것입니다. 최신 배포에서는 반드시 Meta 내부 OAuth redirect URI check 화면이 먼저 보여야 합니다.

Ver 2.07부터는 링크나 URL 파라미터만으로 Google 로그인으로 이동할 수 없습니다. `GET /api/google-drive/oauth/start`와 `GET /api/google-drive/oauth/start?go=1`은 모두 Meta 내부 진단/확인 화면만 보여줍니다. 실제 Google 이동은 해당 화면에서 redirect URI와 Client ID를 확인한 뒤 체크박스를 선택하고 `POST`로 제출할 때만 가능합니다. 확인용 nonce/cookie가 맞지 않으면 다시 진단 화면으로 돌아갑니다.

Ver 2.08부터는 production Meta OAuth redirect URI가 코드 안에서 잠겨 있습니다. 진단 화면의 redirect source가 `meta-production-locked`로 표시되어야 하며, 이 경우 Vercel의 `GOOGLE_DRIVE_OAUTH_REDIRECT_URI` 값이 잘못되어 있어도 Google로 보내는 `redirect_uri`는 항상 `https://meta.wiregene.com/api/google-drive/oauth/callback`입니다. 이 상태에서도 Google이 `redirect_uri_mismatch`를 표시하면 남는 원인은 Vercel Production의 `GOOGLE_DRIVE_CLIENT_ID`가 Google Cloud에서 수정한 Web OAuth client와 다르거나, 해당 client의 `승인된 리디렉션 URI` 항목에 callback이 정확히 등록되지 않은 경우입니다.

Google Drive 연결은 반드시 `https://meta.wiregene.com`에서 시작합니다. `search.wiregene.com`, `mata.wiregene.com`, production Vercel preview host처럼 Meta로 취급되는 공개 별칭에서 OAuth 시작 주소를 열면 앱이 먼저 `meta.wiregene.com`으로 이동시킵니다. OAuth cookie와 callback host가 다르면 인증이 깨질 수 있기 때문입니다.

Google Cloud에서 반드시 `승인된 리디렉션 URI` 항목에 위 URI를 넣어야 합니다. `승인된 JavaScript 원본`에 `https://meta.wiregene.com`만 넣은 것은 충분하지 않습니다. URI를 정확히 넣었는데도 같은 오류가 계속되면, Vercel Production의 `GOOGLE_DRIVE_CLIENT_ID`가 지금 수정한 Google Cloud OAuth client가 아닌 다른 client를 가리키고 있는 것입니다.

사이트에서는 다음 순서로 진행합니다.

1. `AI 평가 설정`으로 갑니다.
2. `Google Drive 연결 시작`을 누릅니다.
3. Google 계정으로 로그인하고 Drive 권한을 승인합니다.
4. 성공 화면에 `GOOGLE_DRIVE_REFRESH_TOKEN`과 Meta 저장소 env block이 표시됩니다.
5. 표시된 값을 Vercel Project Settings > Environment Variables > Production에 넣습니다.
6. Production redeploy를 실행합니다.
7. `https://meta.wiregene.com/api/meta-analysis/storage-policy`에서 backends가 `google-drive`로 잡혔는지 확인합니다.

중요합니다. 앱은 Vercel 환경변수를 자동으로 영구 수정할 수 없습니다. OAuth callback은 token을 발급하고 검증해 보여주는 역할입니다. Vercel에 붙여넣고 재배포하는 단계는 관리자 작업입니다.

기본 설정에서는 로그인한 Meta 사용자가 Google Drive 연결을 시작할 수 있습니다. 운영자가 별도 제한을 원할 때만 `META_GOOGLE_DRIVE_OAUTH_ADMIN_ONLY=true`를 설정해 Portal admin 사용자만 연결을 시작하게 합니다.

Google Drive AI 설정 저장소의 refresh token이 만료되었거나 틀린 경우에도 AI 평가 설정 화면은 깨지지 않고 빈 설정 또는 Vercel `OPENAI_API_KEY` 환경변수 fallback을 보여주는 것이 원칙입니다. 실제 저장된 AI key를 다시 읽으려면 Google Drive refresh token을 새로 발급하고 Vercel Production을 재배포해야 합니다.

AI 평가 설정 화면에서 Google Drive read 오류가 발생하면 앱은 error message뿐 아니라 `details.message`, `details.code`, nested cause까지 검사해 OAuth 오류를 fallback 대상으로 분류합니다. 따라서 `GOOGLE_OAUTH_INVALID_GRANT`가 저장소 상세 정보 안에만 있어도 AI reviewer slots 화면에는 raw storage read failed 오류가 노출되지 않아야 합니다. 단, 사용자가 설정을 저장할 때 Google Drive token이 여전히 잘못되어 있으면 write 오류는 표시됩니다. 저장은 실제 원격 저장소에 기록되어야 하기 때문입니다.

## 7. full-text 업로드와 AI 분석 저장 흐름

full-text PDF/Word를 업로드하면 저장은 두 층으로 나뉩니다.

1. 원문 파일 자체가 source file 저장소에 저장됩니다.
2. AI 판정 결과, reviewer 검증, extraction row는 full-text history JSON에 저장됩니다.

원문 파일은 크기가 클 수 있으므로 DB export ZIP 안에 직접 넣지 않습니다. 대신 아래 metadata가 저장됩니다.

```text
storage
fileName
mimeType
fileSize
sha256
savedAt
localPath 또는 driveFileId
webViewLink
```

따라서 나중에 다른 AI 모델을 다시 실행할 때는 저장된 source file을 재사용할 수 있습니다. 잘못 올린 기록은 history에서 선택 삭제 또는 일괄 삭제할 수 있으며, 다른 record가 같은 원문을 참조하지 않으면 source file도 함께 삭제됩니다.

## 8. AI reviewer와 사람 reviewer의 관계

AI reviewer 1, 2, 3은 서로 다른 모델을 사용해 같은 full-text를 독립적으로 판정할 수 있습니다.

가능한 사용 예시는 다음과 같습니다.

- AI reviewer 1: OpenAI 모델
- AI reviewer 2: Gemini OpenAI-compatible endpoint
- AI reviewer 3: DeepSeek OpenAI-compatible endpoint

AI 모델 결과는 비교표에 저장됩니다. 기존 분석 record가 있고 새 모델만 추가 실행하면, 같은 논문을 중복 record로 늘리지 않고 기존 record에 model review 결과를 합치는 것이 원칙입니다.

사람 reviewer 검토는 기본적으로 유지됩니다.

- 표준 방식: reviewer 1 + reviewer 2 + PI adjudication
- 선택 방식: `AI only`로 reviewer 1/2 단계를 skip하고 PI가 최종 판정

AI only를 선택해도 PI 최종 판정과 사유는 반드시 남겨야 합니다.

## 9. Included-paper Excel dataset

Included-paper dataset은 full-text history에서 포함 판정된 논문만 대상으로 생성됩니다.

데이터셋에는 다음 유형의 field가 있습니다.

| 상태 | 의미 |
|---|---|
| `evidence-backed` | full-text 근거 문장/표와 연결된 값 |
| `auto-filled` | AI가 채웠지만 명시 근거 검토가 필요한 값 |
| `manual-required` | 사람이 반드시 확인/입력해야 하는 값 |
| `blank` | 아직 값이 없는 항목 |
| `audit` | history id, file name, reviewer status 같은 추적용 항목 |

검증 작업자는 `manual-required`, `blank`, validation issue를 먼저 해결합니다. 검증이 끝나면 verified 상태로 저장합니다.

엑셀 다운로드는 `wiregene-meta-extraction-dataset.xlsx`로 내려받습니다. 이 파일은 분석용 산출물이며, 서버의 원본 저장 상태는 full-text history와 extraction review에 남습니다.

## 10. DB bundle과 DB snapshot

### Download DB bundle

현재 프로젝트 상태를 ZIP으로 다운로드합니다.

포함되는 파일은 다음과 같습니다.

```text
README.md
manifest.json
project-workspace-state.json
user-projects.json
ai-settings-summary.redacted.json
full-text-history.json
extraction-dataset.json
extraction-dataset.csv
project-files/*
```

포함되지 않는 것은 다음과 같습니다.

- PDF/Word full-text binary 원문
- OpenAI/Gemini/DeepSeek API key 원문
- Google OAuth refresh token 원문
- Vercel/Synology 환경변수 원문

full-text 원문은 source-file metadata로만 추적됩니다.

### Save DB snapshot

현재 상태를 `meta-db-snapshot-{project}-{timestamp}.json` 형태로 프로젝트 저장소에 저장합니다.

snapshot은 나중에 상태를 확인하거나 감사 trail로 남기는 용도입니다. 기존 snapshot 파일은 DB bundle 안에 반복 포함되지 않도록 제한됩니다.

## 11. 검색식과 PRISMA 기록

검색식은 데이터베이스별로 분리해 저장합니다.

권장 기록 항목은 다음과 같습니다.

- 검색 날짜
- 검색 DB
- 검색식 원문
- language/year 제한
- 검색 결과 수
- dedup 전후 수
- title/abstract screening 수
- full-text assessed 수
- included 수
- excluded 사유별 수

PRISMA 숫자는 검색 결과를 실제 full-text 확보와 판정 과정에서 수정할 수 있어야 합니다. 따라서 초기 검색 결과와 최종 included data 숫자가 다를 수 있음을 정상으로 봅니다.

## 12. 연구자가 실제로 따라야 할 기본 순서

1. 왼쪽 `신규 주제`에서 연구 주제를 만듭니다.
2. Overview에 연구 목적을 적습니다.
3. PRISMA Protocol에 PICO, eligibility, outcome을 정리합니다.
4. Search Design에 DB별 검색식을 넣고 결과 수를 기록합니다.
5. Screening에서 엑셀 workbook 기준 sheet별 full-text 업로드 대상을 확인합니다.
6. AI 평가 설정에서 AI reviewer 모델과 API key를 확인합니다.
7. full-text PDF/Word를 batch upload합니다.
8. AI model reviewer comparison 결과를 확인합니다.
9. reviewer 1/2 또는 AI only 방식으로 PI final decision을 저장합니다.
10. Included-paper Excel Dataset Verification에서 추출값과 근거를 검증합니다.
11. XLSX를 다운로드하고, 필요하면 Save DB snapshot과 Download DB bundle을 실행합니다.
12. 다른 PC에서 이어서 작업할 때는 같은 사이트에 접속해 저장된 record와 project state를 불러옵니다.

## 13. 운영자가 확인해야 할 상태

저장소 상태는 아래 주소에서 확인합니다.

```text
https://meta.wiregene.com/api/meta-analysis/storage-policy
```

확인할 항목은 다음과 같습니다.

- `version`: 현재 배포 버전
- `runtime`: `serverless` 또는 `local-node`
- `googleDriveAuthConfigured`: Google Drive 인증값 존재 여부
- `googleDriveStorageAllowed`: Google Drive 저장 허용 여부
- `backends.project`
- `backends.userProjects`
- `backends.aiSettings`
- `backends.fullTextHistory`
- `backends.fullTextSource`

Vercel 온라인 저장이 목표라면 대부분의 backend가 `google-drive`여야 합니다.

## 14. 자주 헷갈리는 문제

### CSV 복사 버튼을 누르면 저장되나요?

아닙니다. `Copy CSV`는 클립보드 복사입니다. 저장하려면 `Save board`, `Save DB snapshot`, 또는 프로젝트 파일 저장 버튼을 사용해야 합니다.

### DB bundle을 받았는데 PDF가 없습니다.

정상입니다. DB bundle에는 PDF/Word 원문을 직접 넣지 않습니다. 대신 checksum, local path, Google Drive file id 같은 추적 정보가 들어갑니다.

### AI key나 Google token이 DB bundle에 들어가나요?

아닙니다. API key와 OAuth token 원문은 export하지 않습니다. AI settings는 redacted summary만 포함됩니다.

### Google Drive 연결 후에도 이전 오류가 보입니다.

대부분은 Vercel Production redeploy가 안 된 경우입니다. Vercel 환경변수 변경 후에는 새 Production 배포가 필요합니다.

### Synology에서는 왜 local storage가 기본인가요?

Synology/local Docker는 자체 writable volume이 있기 때문에 local-json/local-file이 안정적입니다. Google Drive를 쓰려면 의도적으로 `META_ALLOW_GOOGLE_DRIVE_STORAGE=true`를 켜야 합니다.

## 15. 문서 업데이트 규칙

아래 변경이 있으면 반드시 이 파일을 수정합니다.

- 화면 이름 변경
- 버튼 의미 변경
- 저장 위치 변경
- 환경변수 추가/삭제
- AI reviewer slot 변경
- Google Drive OAuth 흐름 변경
- DB bundle 구성 변경
- full-text history/extraction dataset schema 변경
- 버전업

업데이트할 때는 다음을 함께 수행합니다.

1. `guide.md` 업데이트
2. `backup.md`에 작업 내용 기록
3. `package.json`, `package-lock.json`, `src/lib/version.ts` 버전 업데이트
4. 타입체크, lint, build 확인
5. GitHub push
6. Synology 운영 시 pull/restart 안내
