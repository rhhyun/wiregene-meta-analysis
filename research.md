# Wiregene Meta — 연구 목적 및 프레임워크

## 2026-06-19 workflow lock

- The program must support the complete meta-analysis path: AI-assisted topic/protocol generation -> search string generation -> database search/RIS import -> PRISMA screening -> full-text acquisition -> AI full-text eligibility/extraction -> two human reviewers plus PI final adjudication -> verified Excel extraction dataset -> R-based meta-analysis/NMA figures and tables -> manuscript discussion.
- The published Hyun lab Acta Biomaterialia NMA paper is the reference model for required outputs: PRISMA flow, descriptive included-study charts, NMA network diagrams, network forest plots, SUCRA/rank plots, pairwise forest plots, study/result tables, risk-of-bias tables, NMA/pairwise summary tables, and final raw extraction workbook.
- R/Rscript support is required for true meta-analysis/NMA graph generation. RStudio GUI is optional; the app should call reproducible R scripts or export analysis-ready data for R.
- Full-text history, source files, reviewer decisions, PI adjudication, and extraction datasets must be scoped by `projectId`; no research topic should share a global full-text or Excel dataset store with another topic.
- Current public Meta deployment URL is `https://search.wiregen.com`; the app must enter Meta mode on that host.

> 최초 작성: 2026-06-18 | 담당: JK Hyun

---

## 1. 연구 배경 (Background)

체계적 고찰(Systematic Review)과 메타분석(Meta-Analysis)은 특정 임상 질문에 대한 현존하는 연구 근거를 종합적으로 평가하는 최고 수준의 근거 합성 방법론이다. 그러나 기존 메타분석 수행 도구들은 다음과 같은 한계를 갖는다.

- **플랫폼 분산**: 문헌 검색(PubMed, Embase 등), 선별(Rayyan, Covidence), 추출(Excel), 통계 분석(RevMan, R) 단계가 각각 다른 도구에서 수행되어 워크플로우가 단절된다.
- **재현성 부족**: 검색 전략, 선별 기준, 추출 양식이 수작업으로 기록되어 버전 관리와 재현이 어렵다.
- **다중 사용자 협업 한계**: 여러 PC·연구자가 동일 연구를 동시에 진행할 수 있는 공유 저장소 구조가 없다.
- **AI 보조 부재**: 프로토콜 초안 작성, 검색식 생성, 전문(full-text) 선별에서 LLM을 체계적으로 활용하는 구조가 없다.

**Wiregene Meta**는 이러한 한계를 해결하기 위해 설계된 **웹 기반 통합 메타분석 플랫폼**이다.

---

## 2. 연구 목적 (Objectives)

### Primary Objective
> 임상 연구자가 하나의 웹 플랫폼에서 메타분석의 전 과정(프로토콜 → 검색 → 선별 → 추출 → 분석 → 원고)을 수행할 수 있는 AI 보조 통합 워크플로우 시스템을 개발한다.

### Secondary Objectives
1. PRISMA 2020 지침에 부합하는 구조화된 메타분석 프로토콜 자동 초안 생성
2. 5개 주요 데이터베이스(PubMed, Embase, Scopus, Web of Science, Cochrane)의 검색식을 AI로 생성하고 RIS 파일로 가져오는 통합 검색 관리
3. 중복 제거·선별 작업의 단계별 추적 및 PRISMA 흐름도 자동화
4. LLM 기반 전문(full-text) 선별·데이터 추출 보조
5. 다중 PC·다중 사용자 환경에서의 실시간 프로젝트 상태 공유 (Google Drive / Synology 스토리지)
6. 원고 수준의 methods 문단 자동 생성

---

## 3. 대상 사용자 (Target Users)

| 사용자 유형 | 주요 니즈 |
|------------|----------|
| 임상 연구자 (PI) | 연구 프로토콜 설계, AI 보조 검색식 생성, 전체 진행 현황 파악 |
| 연구 보조원 (RA) | 문헌 선별, 데이터 추출, 품질 평가 입력 |
| 통계 분석가 | 추출 완료 데이터 CSV 확보, 분석 결과 업로드 |
| 공동 저자 | 원고 sections 열람 및 방법 문단 검토 |

---

## 4. 시스템 아키텍처 개요 (System Architecture)

```
┌─────────────────────────────────────────────────────────┐
│                   meta.wiregene.com                      │
│              (Next.js 16 App Router / React)             │
├─────────────────────────────────────────────────────────┤
│  MetaStudyWorkspace (단일 SPA 워크스페이스)               │
│  ├─ Protocol Stage       ← PRISMA 프로토콜 초안          │
│  ├─ Search Stage         ← DB 선택, 검색식, RIS 업로드   │
│  ├─ Screening Stage      ← 중복제거, PRISMA 선별         │
│  ├─ Full-text Stage      ← AI PDF 분석, 데이터 추출      │
│  ├─ Analysis Stage       ← 통계 결과 업로드, 시각화       │
│  ├─ Manuscript Stage     ← Methods 문단 자동 생성        │
│  └─ References Stage     ← 참고문헌 관리                │
├─────────────────────────────────────────────────────────┤
│  API Layer (Next.js Route Handlers)                      │
│  ├─ /api/meta-analysis/projects         ← 연구 목록 관리 │
│  ├─ /api/meta-analysis/projects/*/files ← CSV/파일 저장  │
│  ├─ /api/meta-analysis/projects/*/state ← 공유 상태 동기 │
│  ├─ /api/meta-analysis/study-plan/analyze ← AI 분석     │
│  └─ /api/meta-analysis/workspace/manifest ← 크로스사이트│
├─────────────────────────────────────────────────────────┤
│  Storage Layer                                           │
│  ├─ Synology NAS (local-json)  ← 운영 기본              │
│  ├─ Google Drive (google-drive) ← Vercel/멀티PC 공유    │
│  └─ Browser localStorage       ← 오프라인 임시 상태      │
└─────────────────────────────────────────────────────────┘
```

---

## 5. 메타분석 워크플로우 (Workflow)

### 5.1 Protocol Stage
- PICO(S) 프레임 정의: Population, Intervention/Exposure, Comparator, Outcome, Study design
- Eligibility 기준(inclusion/exclusion criteria) 구조화
- AI(OpenAI GPT)를 통한 프로토콜 초안 자동 생성
- 공유 저장소에 프로토콜 초안 저장 및 다중 사용자 편집

### 5.2 Search Stage
- 5개 데이터베이스 선택 및 DB별 검색식 생성(AI 보조)
- 각 DB에서 내보낸 RIS 파일 업로드 → 자동 파싱
- 중복 제거(DOI/PMID/Title 기준): unique/duplicate 레코드 집계
- Master CSV 저장 (서버/브라우저 다운로드 자동 전환)

### 5.3 Screening Stage
- 제목·초록 선별: 포함/제외/보류 분류
- PRISMA 2020 흐름도 자동 갱신
- 전문 검토 대상 목록 추출

### 5.4 Full-text Stage
- PDF/Word 전문 업로드 → AI 선별·추출 보조
- OpenAI Structured Outputs 기반 적격성 평가 초안
- Hyunlab 품질 평가(score/grade/improvement 포함)
- 추출 결과 JSON 자동 저장

### 5.5 Analysis Stage
- 통계 분석 결과(Forest plot, Funnel plot) 이미지 업로드
- 이질성(heterogeneity), 출판 편향(publication bias) 기록
- 분석 노트 및 민감도 분석 결과 보관

### 5.6 Manuscript Stage
- PRISMA-ready Methods 문단 자동 생성
- 저널별 제출 형식 매핑 (예정)

---

## 6. 현재 진행 중인 연구 주제

| 주제 | 상태 | 주요 데이터베이스 |
|------|------|-----------------|
| Orchestral musicians PRMD asymmetry | Active | PubMed, Embase, Scopus, WoS, Cochrane |
| Evidence-informed prediction of preventable post-traumatic disability | Active | PubMed |
| (신규 추가 주제) | Planning | TBD |

---

## 7. 기술 스택 및 의존성 (Technical Stack)

| 구성 요소 | 기술 |
|----------|------|
| Frontend Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS |
| AI 연동 | OpenAI API (GPT-5-nano / GPT-5.4-mini / GPT-5.5) |
| 스토리지 | Google Drive API (OAuth 2.0) + Synology NAS |
| 배포 (Public) | Vercel (meta.wiregene.com) |
| 배포 (내부) | Synology Docker (NAS 로컬) |
| 인증 | portal.wiregene.com 중앙 인증 연동 |

---

## 8. 연구 결과물 (Expected Outputs)

1. **Wiregene Meta 플랫폼**: 오픈 소스 기반 웹 메타분석 도구 (GitHub: `rhhyun/wiregene-meta-analysis`)
2. **체계적 고찰 논문**: 각 연구 주제별 PRISMA 준수 체계적 고찰 및 메타분석 원고
3. **방법론 보고서**: AI 보조 메타분석 워크플로우의 정확도·효율성 평가 데이터

---

## 9. 제한점 및 위험 요소 (Limitations & Risks)

| 위험 요소 | 완화 전략 |
|----------|----------|
| Vercel 서버리스 파일시스템 읽기 전용 | Google Drive 스토리지 백엔드 / 브라우저 자동 다운로드 fallback |
| 대용량 CSV body size 제한 (4.5 MB) | Gzip 압축 전송 (CompressionStream API) |
| AI 추출 오류 (hallucination) | 인간 검증 필수 단계 구조화, `aiUsed` 플래그 명시 |
| 다중 사용자 충돌 쓰기 | Google Drive 단일 진실 소스(SSOT) + 낙관적 병합 전략 |
| 기존 논문 중복 저장 | Title 정규화 기반 중복 감지 및 보관/삭제 제어 |

---

## 10. 참고 지침 (Reference Guidelines)

- PRISMA 2020: Page et al. BMJ 2021;372:n71
- Cochrane Handbook for Systematic Reviews of Interventions v6.4
- PROSPERO: 국제 체계적 고찰 사전 등록 데이터베이스
- OpenAI Structured Outputs API Documentation
