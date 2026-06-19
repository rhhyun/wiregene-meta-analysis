# Wiregene Meta — 개발 작업 계획 (plan.md)

## 2026-06-19 continuity checkpoint

- Current working repo confirmed: `C:\Users\HyunJK\Documents\GitHub\meta.wiregene.com`.
- Pulled remote work from the other PC first; latest remote already included multi-model AI full-text reviewer rerun, saved-source reanalysis, AI-only PI adjudication, and Excel workbook export.
- Continued with non-overlapping implementation: project-scoped full-text history/source-file storage and project-scoped extraction dataset/Excel workbook generation.
- Added an explicit legacy source attach path so old `gpt-5-nano` records marked `legacy/no source` can be upgraded by selecting the saved record, choosing the matching full-text file, and saving that source before rerunning selected AI models.
- Added a `Legacy/no source` filter and fixed Google Drive binary source upload so small PDFs do not fail with `Malformed multipart body`.
- Changed the saved-source rerun button into a state-aware action that explains what is missing and can save source + rerun in one click for legacy records.
- Active version after this checkpoint: `Ver 1.86`, package `0.1.51`.
- Public deployment URL corrected to `https://search.wiregene.com`; `search.wiregen.com` is also accepted as a typed alias and treated as Meta mode.
- Next priority: PRISMA/Search/Screening outputs should persist to the same project-scoped workspace so a generated topic can move from search strategy -> RIS upload -> screening -> full-text -> extraction -> R analysis without global cross-project mixing.

> 최초 작성: 2026-06-18 | 담당: JK Hyun
> 현재 버전: **v1.77** | 패키지: `0.1.40`

---

## 현재 상태 요약

| 항목 | 상태 |
|------|------|
| Public URL | https://meta.wiregene.com (Vercel) |
| Synology URL | NAS 내부 포트 (Docker) |
| 스토리지 | Synology local-json + Google Drive (양쪽 설정 완료) |
| 인증 | portal.wiregene.com 중앙 인증 |
| AI 설정 | GPT-5-nano (저장된 키 우선, env fallback) |
| 주요 미해결 이슈 | 아래 Phase 2 참조 |

---

## Phase 1 — 기반 인프라 ✅ 완료

> 버전 v1.60 ~ v1.75 구간 완료된 작업

### 1.1 플랫폼 분리 및 배포
- [x] `research-briefing-platform`에서 `wiregene-meta-analysis`로 독립 저장소 분리
- [x] Vercel 배포 (`meta.wiregene.com`) 구성
- [x] Synology Docker 배포 및 시작 스크립트 (`synology-start-meta.sh`)
- [x] portal.wiregene.com 중앙 인증 연동 (`PORTAL_AUTH_CHECK_SECRET`)
- [x] Synology 시작 스크립트 자동 auth 탐색 (실패해도 경고만 내고 계속 시작)

### 1.2 공유 스토리지
- [x] Google Drive 스토리지 백엔드 구현 (`google-drive-storage.ts`)
- [x] 연구 목록 공유 저장소 (`META_USER_PROJECTS_STORAGE_BACKEND`)
- [x] 프로젝트 파일 공유 저장소 (`META_PROJECT_STORAGE_BACKEND`)
- [x] 프로젝트 워크스페이스 상태 공유 API (`GET/PATCH/PUT /state`)
- [x] 크로스사이트 manifest API (`/api/meta-analysis/workspace/manifest`)

### 1.3 AI 연동
- [x] OpenAI API 키 암호화 저장 (`MetaAiSettingsPanel`)
- [x] 신규 주제 AI 분석 → 자동 프로젝트 생성 → Protocol 단계 자동 이동
- [x] 전문(full-text) AI 선별·추출 (Structured Outputs)
- [x] Hyunlab 품질 평가 (score/grade/improvement)

### 1.4 연구 목록 관리
- [x] 중복 연구 제거 (title 정규화 기반)
- [x] 보관(archive) / 삭제(delete) / 복원(restore) 기능
- [x] 신규 주제와 기존 주제 데이터 완전 분리

### 1.5 검색 단계
- [x] 5개 DB 선택 UI (PubMed, Embase, Scopus, WoS, Cochrane)
- [x] DB별 검색식 생성 (AI 보조)
- [x] RIS 파일 업로드 → 자동 파싱 및 중복 감지
- [x] Master CSV 저장 (Synology/Google Drive)
- [x] **Vercel 환경 브라우저 자동 다운로드 fallback** (v1.77)

### 1.6 대용량 데이터 처리
- [x] Gzip 압축 전송 (`compressPayload` / `parseRequestJson`) (v1.76)

---

## Phase 2 — 진행 중 / 예정 작업 🚧

### 2.1 검색 단계 완성 (우선순위: HIGH)

#### 2.1.1 Save master CSV → Synology/Google Drive 정상 저장 확인
- [ ] Synology 환경에서 Save master CSV → 로컬 파일시스템 저장 end-to-end 테스트
- [ ] Google Drive 환경에서 Save master CSV → Drive 저장 end-to-end 테스트
- [ ] 저장된 CSV를 "Project file storage" 패널에서 다운로드 확인

#### 2.1.2 Mechanical Cleanup 자동화
- [ ] 중복 레코드 자동 제거 알고리즘 고도화 (DOI 우선 → PMID → Title 유사도)
- [ ] 중복 제거 결과 상세 보고서 (제거된 레코드 목록, DB별 통계)
- [ ] 수동 포함/제외 override 기능

#### 2.1.3 PRISMA 흐름 자동 업데이트
- [ ] 검색 단계 완료 시 PRISMA Stage 1 숫자 자동 반영
  - Records identified: `n`
  - Duplicates removed: `n`
  - Records after deduplication: `n`

### 2.2 선별 단계 (Screening) (우선순위: HIGH)

#### 2.2.1 제목/초록 선별 UI
- [ ] 각 레코드에 Include / Exclude / Uncertain 버튼
- [ ] 제외 사유 드롭다운 (eligibility 기준별)
- [ ] 키워드 하이라이팅
- [ ] AI 보조 사전 선별 (선별 기준 기반 자동 분류 초안)

#### 2.2.2 선별 결과 저장 및 공유
- [ ] 선별 결과를 project workspace state에 저장
- [ ] 다중 사용자 선별 결과 병합 (Cohen's kappa 계산)
- [ ] 선별 완료 CSV 내보내기

#### 2.2.3 전문 검토 대상 목록
- [ ] Title/abstract 선별 통과 레코드 자동 추출
- [ ] 전문 검색 링크 (PubMed, DOI) 자동 생성

### 2.3 전문 선별 및 추출 단계 (Full-text) (우선순위: MEDIUM)

#### 2.3.1 전문 업로드 개선
- [ ] 다중 PDF 일괄 업로드
- [ ] Word (.docx) 파일 처리 개선
- [ ] 업로드 진행률 표시

#### 2.3.2 AI 추출 품질 향상
- [ ] 추출 필드 커스터마이징 (프로젝트별 extraction form)
- [ ] AI 추출 결과 인간 검증 UI (field-by-field 확인)
- [ ] 추출 결과 버전 관리

#### 2.3.3 품질 평가 (Risk of Bias)
- [ ] RoB 2.0 도구 UI 구현
- [ ] ROBINS-I 도구 UI 구현
- [ ] AI 보조 RoB 평가 초안 생성

### 2.4 분석 단계 (Analysis) (우선순위: MEDIUM)

#### 2.4.1 데이터 입력
- [ ] 추출 완료 데이터 요약 테이블 UI
- [ ] Effect size 계산기 (SMD, OR, RR, MD)
- [ ] Subgroup 정의

#### 2.4.2 결과 업로드
- [ ] Forest plot 이미지 업로드 및 주석
- [ ] Funnel plot 업로드
- [ ] 이질성(I², τ²) 결과 입력 필드
- [ ] 민감도 분석 결과 기록

### 2.5 원고 단계 (Manuscript) (우선순위: LOW)

- [ ] PRISMA Methods 문단 자동 완성 (선별·추출 결과 연동)
- [ ] Results 문단 초안 (AI 생성)
- [ ] 저널별 투고 요건 체크리스트

### 2.6 인프라 / 안정성 (우선순위: HIGH)

#### 2.6.1 오류 처리 강화
- [ ] 모든 API 라우트 에러 응답 표준화
- [ ] 네트워크 오류 시 자동 재시도 (exponential backoff)
- [ ] 스토리지 접근 실패 시 사용자 친화적 에러 메시지

#### 2.6.2 버전 업데이트
- [ ] `package.json` 버전 `0.1.40` → `0.1.41` (다음 기능 배포 시)
- [ ] `src/lib/version.ts` `Ver 1.77` → `Ver 1.78` (다음 기능 배포 시)

#### 2.6.3 Windows 빌드 환경
- [ ] `npm run build` 빌드 워커 크래시 (`0xC0000409`) 해결 조사
  - 현재: TypeScript 컴파일은 통과, 빌드 워커만 크래시
  - 원인: Windows 메모리/스택 제한 또는 Node.js 버전 문제로 추정
  - 임시 대안: `npx tsc --noEmit`으로 코드 검증 후 Synology/Vercel에서 빌드

---

## Phase 3 — 중장기 계획 📋

### 3.1 멀티 사이트 연동
- [ ] `search.wiregene.com` ↔ `meta.wiregene.com` 검색 결과 직접 연동
- [ ] `omni.wiregene.com` 크로스사이트 manifest 연동
- [ ] 프로젝트 join key 표준화 (stable `projectId` 체계)

### 3.2 협업 기능
- [ ] 사용자별 권한 관리 (PI / RA / Reviewer)
- [ ] 실시간 동시 편집 (WebSocket 또는 Polling)
- [ ] 변경 이력(Audit Log) 기록

### 3.3 통계 분석 내장
- [ ] 브라우저 내 메타분석 계산 (R WebAssembly 또는 Python WASM)
- [ ] Forest plot 자동 생성
- [ ] GRADE 근거 수준 평가 보조

### 3.4 PROSPERO 연동
- [ ] PROSPERO 사전 등록 초안 자동 생성
- [ ] 등록번호 관리 및 상태 추적

---

## 배포 명령 (Deploy Commands)

### Synology (주 운영 서버)
```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

### Vercel
- GitHub `main` 브랜치 push 시 자동 배포
- 환경변수 설정: Vercel Dashboard > meta.wiregene.com > Environment Variables

### 로컬 개발
```sh
cd C:\Users\HyunJK\Documents\GitHub\meta.wiregene.com
npm run dev
```

---

## 작업 완료 체크리스트 (세션 종료 전 필수)

```text
□ npx tsc --noEmit 통과 확인
□ git add / commit / push 완료
□ backup.md 업데이트 (버전, 변경사항, commit hash)
□ plan.md 업데이트 (완료 항목 [x] 처리, 새 이슈 추가)
□ research.md 업데이트 (필요 시)
□ Synology 배포 명령 실행 확인 or 명령 기록
```

---

## 환경변수 레퍼런스

```text
# 스토리지 백엔드
META_USER_PROJECTS_STORAGE_BACKEND=google-drive   # or local-json
META_PROJECT_STORAGE_BACKEND=google-drive          # or local-json

# Google Drive
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=

# AI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-nano
META_AI_SETTINGS_SECRET=

# 인증
PORTAL_AUTH_CHECK_SECRET=
PORTAL_AUTH_CHECK_URL=https://portal.wiregene.com/api/auth/check

# 앱 모드
WIREGENE_APP_MODE=meta
```
