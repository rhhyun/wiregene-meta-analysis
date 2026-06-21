# Wiregene Meta 사용 가이드

문서 버전: Ver 2.30
최종 업데이트: 2026-06-21
적용 사이트: `https://meta.wiregene.com`  
소스 저장소: `rhhyun/wiregene-meta-analysis`

## 2026-06-21 Ver 2.30 업데이트: full-text 업로드 기본값은 새 article 저장

Ver 2.30부터 full-text PDF/Word를 업로드할 때 기본 동작은 `새 article record 저장`입니다. 연구자가 새 논문 9개, 30개, 100개를 추가로 확보해 업로드하는 상황이 일반적인 workflow이므로, 매칭되지 않은 파일은 자동으로 새 논문 record로 저장됩니다.

`Update matched existing only`는 특별한 경우에만 켭니다. 이 옵션을 켜면 업로드 파일이 기존 saved article과 매칭될 때만 같은 record에 병합하고, 매칭 실패 파일은 새 논문으로 저장하지 않습니다. 즉 이 옵션은 기존 legacy/no-source record를 원문 PDF/Word로 보강하거나, 이미 저장된 논문의 AI reviewer 결과를 의도적으로 갱신할 때 사용하는 예외 모드입니다.

자동 match 후보가 보이더라도 기본 모드에서는 기존 record를 대체하지 않습니다. checksum이 완전히 같은 재업로드는 중복 방지를 위해 서버에서 같은 record로 병합될 수 있지만, 일반적인 새 full-text 업로드는 새 article로 저장됩니다. 기존 record를 대체하려면 연구자가 `Update matched existing only`를 켠 뒤 확인창에서 병합을 승인해야 합니다.

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

Ver 2.16부터 화면 순서는 `AI model reviewers for this run` → `full-text 파일 / Excel source sheet` → `Saved full-text analyses`입니다. 먼저 실행할 AI reviewer를 고르고, 바로 아래에서 원문 파일과 Excel source sheet를 지정한 뒤, 같은 화면 아래쪽의 저장된 분석 목록에서 기존 기록을 선택해 `Run selected AI on saved full text` 또는 source update를 이어서 진행합니다.

Ver 2.17부터 저장된 논문 목록의 `AI reviews x/y` 표시는 저장 이력과 설정된 reviewer slot 수를 함께 기준으로 계산합니다. 한 모델이 일시적으로 실패하거나 잠시 실행 불가로 판단되어도 다른 논문들의 분모가 `3`에서 `2`로 내려가지 않습니다. 따라서 3개 모델을 기준으로 진행한 논문은 계속 `3/3`으로 남고, 실제로 한 모델이 실패한 논문만 `2/3`처럼 검토가 덜 끝난 상태로 표시됩니다.

Ver 2.18부터 기존 1개 AI 모델만 분석된 legacy record를 대량 업데이트할 수 있습니다. Ver 2.30 이후에는 새 full-text 업로드가 기본 workflow이므로, 매칭되지 않은 파일은 새 article record로 저장됩니다. 기존 논문 record만 보강하려면 `Update matched existing only`를 명시적으로 켠 뒤 실행합니다. 이 예외 모드에서는 앱이 파일명/저장 제목/추출 제목을 이용해 기존 논문과 매칭하고 같은 record에 source file과 선택한 AI reviewer 결과를 순차 저장하며, 매칭 실패 파일은 새 논문으로 저장하지 않습니다.

Ver 2.19부터 `full-text 파일`의 파일 선택은 누적 방식입니다. 한 번에 일부 파일을 선택한 뒤 다시 `파일 선택`을 눌러 다른 PDF/Word 파일을 추가해도 기존 선택은 사라지지 않고 새 파일만 추가됩니다. 같은 파일은 파일명, 용량, 수정시각 기준으로 중복 제거됩니다. 선택을 처음부터 다시 시작하려면 `Clear selected files`를 누릅니다.

Ver 2.20부터 대량 full-text AI 분석 큐는 장시간 작업을 전제로 더 단단하게 동작합니다. 전체 batch를 하나의 긴 서버 요청으로 보내지 않고 파일별 짧은 요청으로 나누어 처리하며, 각 파일의 upload session, chunk upload, AI 분석, saved-source reanalysis 요청에는 timeout과 자동 재시도가 적용됩니다. 네트워크 일시 장애, 429 rate limit, 5xx 서버 오류가 발생하면 해당 단계만 재시도하고, 그래도 실패하면 그 파일만 `failed`로 남긴 뒤 다음 파일로 진행합니다. 같은 PDF가 재시도 중 이미 저장된 경우에는 서버가 source-file checksum을 확인해 기존 record로 병합하므로 중복 record 생성을 줄입니다. 브라우저가 지원하면 분석 중 screen wake lock을 요청해 절전으로 인한 중단 가능성도 낮춥니다.

Ver 2.21부터 Project file storage 목록은 내부 저장용 파일명 대신 사람이 알아볼 수 있는 표시명을 먼저 보여줍니다. `full-text-files__해시-논문제목.pdf` 같은 Google Drive/Synology 저장 키는 제목 중심의 이름으로 정리되어 보이고, 원래 저장 키는 보조 정보로만 남습니다. Path 컬럼도 Storage 컬럼으로 바뀌어 `Google Drive` 또는 `Synology/local` 위치를 먼저 표시합니다. Download 링크는 내부 저장 키를 그대로 사용하므로 기존 파일 다운로드 동작은 유지됩니다.

Ver 2.22부터 Screening 화면의 저장소 파일 목록은 기본적으로 접혀 있습니다. full-text source PDF/Word는 일반적으로 아래 `Saved AI review article list`에서 다시 선택해 확인하므로, `Project file storage`에는 저장 위치와 DB bundle/snapshot 기능만 먼저 보이고, 실제 source/audit 파일표와 다운로드 링크는 `Show stored file list`를 눌렀을 때만 열립니다. 저장된 AI review 논문 목록은 파일명을 제목처럼 크게 보여주지 않고, 원문 파일 앞 번호와 확인된 논문 제목만 먼저 표시합니다. 파일명, source 저장소, sheet, confidence, reviewer 상태, AI review 수는 해당 논문 행을 클릭했을 때 행 안과 아래 상세 패널에만 표시됩니다.

Ver 2.24부터 Gemini reviewer의 권장 모델은 `gemini-3.1-flash-lite`입니다. `gemini-3.5-flash`는 고성능 모델이지만 full-text 논문 수십-수백 건을 순차 screening하는 용도에서는 429 quota 오류와 timeout, 비용 부담이 커질 수 있습니다. Google 공식 가격표에서 `gemini-3.1-flash-lite`는 most cost-efficient Gemini 3.1 모델로 안내되므로, Wiregene Meta에서는 Gemini reviewer 2/3의 기본 비용형 모델로 사용합니다.

Google Gemini를 OpenAI-compatible slot으로 쓸 때 Base URL은 그대로 `https://generativelanguage.googleapis.com/v1beta/openai`를 사용하고, 모델명만 `gemini-3.1-flash-lite`로 입력합니다. 이전에 저장된 `gemini-3.5` 또는 `gemini-3.5-flash` 값은 Google Gemini Base URL에서 실행될 때 자동으로 `gemini-3.1-flash-lite`로 보정됩니다. 이미 저장된 full-text 원문과 이전 AI review history는 삭제하지 않으며, 새 모델을 선택해 다시 실행하면 같은 논문 record에 모델별 draft가 추가됩니다.

Ver 2.25부터 `Saved AI review article list`는 기본적으로 full-text 파일명 앞 번호를 기준으로 오름차순 정렬됩니다. 목록 위의 정렬 버튼에서 `번호순`, `제목순`, `1저자순`을 선택할 수 있고, 같은 버튼을 다시 누르면 오름차순과 내림차순이 전환됩니다. `1저자`는 엑셀 screening row/referenceRecord에서 우선 추출하며, 값이 없을 때만 파일명 앞부분에서 보조 추정합니다. 정렬은 화면 표시와 선택/일괄 삭제 대상에만 적용되고, 저장된 AI 분석 결과, reviewer 검증, source file 저장 상태는 변경하지 않습니다.

Ver 2.26부터 `Saved AI review article list` 바로 위에 `AI model reviewers for selected articles` 패널이 표시됩니다. 여기에서 AI reviewer 1/2/3을 선택하고, Article list에서 체크한 논문들을 그대로 AI review 대상으로 실행할 수 있습니다. `Select shown for AI review`를 누르면 현재 필터/정렬로 보이는 논문을 한 번에 선택하고, `Run AI review on selected`를 누르면 full-text source가 저장된 record를 순차적으로 다시 분석합니다. 이 과정은 같은 saved article record에 AI model draft를 갱신하며 새 중복 논문을 만들지 않습니다. `legacy/no source` record는 원문 PDF/Word가 저장되어 있지 않으므로 자동으로 건너뛰고, 먼저 full-text batch upload로 기존 record와 매칭해 source를 저장해야 합니다. 선택된 논문 AI review는 기존 batch queue에 진행률과 실패 항목을 표시합니다.

Ver 2.27부터 `Article list`에는 각 논문 행마다 `full-text saved` 또는 `full-text missing` 배지가 항상 표시됩니다. 행을 열지 않아도 어떤 논문이 바로 AI review 가능한지 알 수 있습니다. 목록 헤더에는 현재 보이는 논문 중 full-text 저장 완료 수와 미저장 수가 함께 표시됩니다. 선택한 논문 중 full-text가 없는 항목이 있으면 `AI model reviewers for selected articles` 패널 안에 논문 번호가 바로 표시되며, `Run AI review on selected`를 눌렀을 때도 건너뛴 논문 번호가 오류/경고 문구에 남습니다. 따라서 위아래로 이동하면서 어느 PDF/Word를 다시 업로드해야 하는지 찾지 않아도 됩니다.

### AI Model Reviewer Comparison

Ver 2.29부터 `Run selected AI review (x/y)`의 숫자는 선택 논문 AI review run의 실제 진행률입니다. `y`는 Article list에서 선택한 전체 논문 수이고, `x`는 현재 선택 run에서 완료된 논문 수입니다. 버튼을 누르는 순간 선택된 논문 ID와 full-text source가 저장된 논문 ID를 고정한 뒤 그 run의 batch queue만 세므로, 분석이 끝나는 논문마다 `1/y`, `2/y`처럼 증가합니다. full-text source가 없는 논문은 분모에는 남아 연구자가 빠진 논문을 인지할 수 있고, 분석 queue에서는 source가 저장된 논문만 순차 실행됩니다. run 전에는 현재 선택 run이 아직 시작되지 않았으므로 `0/y`에서 시작합니다. 기존처럼 AI-ready saved source 수를 분자로 쓰지 않습니다.

Ver 2.28부터 Screening의 반복 작업은 `Saved AI review article list` 안의 compact workbench에서 진행합니다. full-text PDF/Word 선택, `Analyze full text`, 기존 record 자동 매칭, Excel source sheet 선택, 선택 논문 AI review 실행 버튼이 같은 화면 안에 모여 있습니다. 위쪽의 `AI reviewer setup / source status`와 `Advanced full-text upload fields`, `Full-text missing`, `Sheet progress`는 평소에는 접힌 상태로 두고 필요할 때만 열어 확인합니다. 따라서 연구자는 full-text 목록을 보면서 바로 업로드, AI reviewer 선택, 선택 논문 재분석, source 저장을 이어서 진행하면 됩니다.

Ver 2.28부터 저장된 논문 목록의 기본 제목은 publisher PDF 파일명이 아닙니다. 각 행은 연구자가 붙인 일련번호를 먼저 보여주고, 그 뒤에는 AI가 추정한 논문 제목 또는 Excel/reference row에서 확인한 논문 제목 첫 줄을 표시합니다. 원래 PDF/Word 파일명과 source 저장소는 행을 클릭했을 때만 상세 정보로 보입니다. 정렬도 번호순, 제목순, 1저자순을 지원하되 실제 record와 저장된 source file은 변경하지 않습니다.

Ver 2.28부터 AI 모델에 전달되는 판정 가이드는 연구자가 직접 확인하고 수정할 수 있습니다. `Excel row / AI judgment guide`를 열면 현재 실행에 사용될 지침이 그대로 보이며, 수정한 내용은 업로드 분석과 저장된 full-text 재분석 모두에 전달됩니다. 분석 결과 화면의 `AI judgment guide used for this result`에는 해당 결과에 실제 저장된 실행 가이드가 접힌 상태로 남습니다. 검증 CSV에도 `ai_researcher_guidance`가 포함되므로, 나중에 모델 간 판정 차이가 왜 생겼는지 감사 추적할 수 있습니다. 기본 지침으로 되돌리려면 `Reset guide`를 누릅니다.

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
| 사용자 연구 목록 | 왼쪽 연구 카드 목록 | `download/_system/user-study-projects.json` | `meta-user-study-projects.json` | 예 |
| 프로젝트 작업 상태 | protocol, search import rows, query overrides, workbook board | `download/{project}/project-workspace-state.json` | `meta-projects__{project}__project-workspace-state.json` | 예 |
| 프로젝트 저장 파일 | CSV/TSV/JSON/MD/TXT export | `download/{project}/{file}` | `meta-projects__{project}__{file}` | 예, 크기 제한 내 |
| AI 설정 | AI reviewer slot, model, encrypted saved API keys | `download/_system/meta-ai-settings.json` | `meta-ai-settings.json` | redacted summary만 |
| full-text 분석 history | AI 판정, model 비교, reviewer 검증, PI 판정, extraction review | `download/{project}/full-text-history.json` | `meta-projects__{project}__full-text-history.json` | 예 |
| full-text 원문 파일 | PDF/Word/TXT/MD binary 원문 | `download/{project}/full-text-files/{sha}-{filename}` | Google Drive file id로 저장 | 원문 자체는 제외 |
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
META_PROJECT_STORAGE_ROOT=download
META_USER_PROJECTS_STORAGE_BACKEND=local-json
META_USER_PROJECTS_FILE=download/_system/user-study-projects.json
META_AI_SETTINGS_STORAGE_BACKEND=local-json
META_AI_SETTINGS_STORAGE_PATH=download/_system/meta-ai-settings.json
META_FULL_TEXT_HISTORY_STORAGE_BACKEND=local-json
META_FULL_TEXT_HISTORY_STORAGE_PATH=download/_system/meta-full-text-history.json
META_FULL_TEXT_SOURCE_STORAGE_BACKEND=local-file
META_FULL_TEXT_SOURCE_STORAGE_PATH=download/_system/full-text-files
```

Synology 안내 경로는 보통 다음과 같습니다.

```text
/volume1/docker/meta/download/{project}
```

Ver 2.10부터 Synology의 표준 영구 저장 폴더는 `/volume1/docker/meta/download`입니다. Docker container 안에서는 이 폴더가 `/app/download`로 연결됩니다. 기본 구조는 다음과 같습니다.

```text
/volume1/docker/meta/download/
  _system/
    user-study-projects.json
    meta-ai-settings.json
    research-briefing-storage.json
    meta-full-text-history.json
    full-text-files/
  {project}/
    project-workspace-state.json
    full-text-history.json
    full-text-files/
    *.csv, *.json, *.md, *.txt, *.tsv
```

`_system`은 연구 전체에 공통인 설정과 목록을 저장합니다. `{project}` 폴더는 각 연구별 작업 상태, full-text 원문, AI 분석 history, 검증 결과, CSV/JSON 산출물을 저장합니다.

기존 `/volume1/docker/meta/data`에 저장된 자료가 있으면 Synology 시작 스크립트가 새 위치에 파일이 없을 때만 `/volume1/docker/meta/download`로 복사합니다. 기존 파일은 삭제하지 않습니다.

Synology에서도 Google Drive 저장을 쓰려면 `META_ALLOW_GOOGLE_DRIVE_STORAGE=true`를 명시적으로 켜야 합니다. 다만 Google Drive OAuth가 실패해도 Synology 작업은 `/volume1/docker/meta/download` local storage로 계속 진행하는 것이 기본 정책입니다.

Ver 2.11부터 `AI 평가 설정` 화면은 Synology 기본 저장소와 Google Drive 연결 상태를 분리해서 표시합니다. `기본 저장소` 박스는 Synology/local Docker에서 실제 연구 데이터가 `/volume1/docker/meta/download/{project}`에 저장된다는 뜻입니다. `Google Drive online storage` 박스는 Google Drive가 온라인 공유/백업용으로 연결되어 있는지 보여줍니다. 상태가 `연결됨`이면 인증 정보가 구성되어 AI 설정 저장소를 읽을 수 있는 상태이고, `설정은 있으나 재연결 필요`이면 refresh token 또는 권한 문제로 다시 연결해야 합니다. 버튼 문구도 상태에 따라 `Google Drive 다시 연결`, `Google Drive 재연결`, `Google Drive 연결 시작`, `Google Drive 연결 설정`으로 바뀝니다.

### Browser fallback

서버 저장이 실패할 때 브라우저 다운로드나 임시 local/browser fallback 안내가 나타날 수 있습니다.

이것은 연구를 계속하기 위한 임시 안전장치입니다. 장기 보관과 여러 PC 작업을 위해서는 Google Drive 또는 Synology/local Docker 저장이 정상 동작해야 합니다.

Ver 2.12부터는 Vercel/serverless에서 Google Drive 저장소가 실패할 때 빈 `/var/task` 로컬 저장소를 실제 연구 저장소처럼 보여주지 않습니다. 저장소 요약에는 `Google Drive unavailable` 또는 `Storage unavailable`로 표시되며, `No saved full-text analyses yet` 또는 `No project files have been saved yet` 같은 문구로 기존 자료가 삭제된 것처럼 보이지 않게 합니다. full-text history 목록을 성공적으로 불러온 적이 있으면 브라우저에 마지막 overview 복사본을 남겨 두었다가, shared storage 장애 시 “마지막 브라우저 snapshot”으로 보여줍니다. 이 복사본은 복구용 화면 보호 장치일 뿐이고, 서버/Google Drive/Synology의 실제 원본 데이터를 대체하지 않습니다.

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

Ver 2.09부터는 Meta가 검증하지 못한 Vercel `GOOGLE_DRIVE_CLIENT_ID`로 Google 로그인에 계속 보내지 않습니다. Production Meta에서는 `GOOGLE_DRIVE_OAUTH_EXPECTED_CLIENT_ID`가 설정되어 있고 그 값이 현재 `GOOGLE_DRIVE_CLIENT_ID`와 일치할 때만 기본 `Continue to Google login`이 활성화됩니다. 값이 없거나 다르면 Google 오류 화면으로 보내지 않고 Meta 내부 진단 화면에서 멈춥니다.

Vercel 환경변수를 먼저 고치기 어려운 경우에는 같은 진단 화면의 `Repair with the correct Google Web OAuth client` 양식에 Google Cloud의 올바른 Web OAuth Client ID와 Client Secret을 붙여넣어 바로 OAuth를 실행할 수 있습니다. 이 임시 client 값은 URL이나 state에 넣지 않고 15분짜리 암호화 HttpOnly cookie로만 callback까지 전달합니다. 성공하면 화면에 Vercel Production에 넣을 `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_OAUTH_EXPECTED_CLIENT_ID`, `GOOGLE_DRIVE_REFRESH_TOKEN`, 저장소 backend env block이 한 번에 표시됩니다. 이 값을 저장하고 redeploy하면 이후에는 같은 redirect mismatch 루프가 재발하지 않아야 합니다.

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

Ver 2.13부터 `AI 평가 설정` 화면에는 `Google Drive verify` 버튼이 있습니다. Google Drive 문제는 이 검증이 모두 통과해야 해결된 것으로 봅니다. 검증은 실제로 다음 단계를 수행합니다.

1. `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN` 구성이 완전한지 확인합니다.
2. OAuth refresh token으로 새 access token을 발급합니다.
3. Vercel/serverless에서 Meta shared storage backend가 모두 `google-drive`인지 확인합니다.
4. Google Drive에 작은 probe JSON 파일을 쓰고, 다시 읽고, 목록에서 찾고, 삭제합니다.

하나라도 `FAILED`이면 연결이 완료된 것이 아닙니다. Google 로그인 승인을 했더라도, 새 refresh token을 Vercel Production 환경변수에 저장하고 Production redeploy를 하지 않으면 기존 배포는 계속 예전 token으로 동작합니다. 이 경우 `Google Drive verify` 결과의 `Required actions`를 그대로 수행한 뒤 다시 검증해야 합니다.

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

### AI reviewer 3개 비교 중 한 모델만 fallback/failed로 보이는 경우

먼저 Google Drive 저장 오류인지, 모델 응답 schema 오류인지 구분해야 합니다.

- Google Drive 오류라면 저장소 상태, full-text source 저장, history 저장 단계에서 오류가 납니다.
- 특정 AI reviewer만 실패하고 다른 reviewer는 성공한다면 대부분 해당 모델의 OpenAI-compatible JSON 응답 구조가 내부 schema와 다르게 온 경우입니다.
- Ver 2.14부터는 OpenAI-compatible 모델의 응답을 바로 버리지 않고 `extraction.rows`, `fieldEvidence`, `missingCriticalFields`, `validationIssues`, 판정 사유, reviewer check, quality score를 표준 구조로 먼저 정규화한 뒤 검증합니다.
- 그래도 실패하면 Screening의 AI model reviewer comparison 표에 실패 모델과 schema 영역이 남습니다. 이 기록은 history에 보존되며, 같은 저장 full-text에서 해당 모델만 다시 실행할 수 있습니다.
- 연구자는 같은 논문에서 `gpt`, `gemini`, `deepseek` 등의 모델 결과를 비교하고, 최종 PI adjudication에서 include/exclude를 결정합니다.

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
