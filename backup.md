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
