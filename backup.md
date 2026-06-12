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
