# 2026-06-23 Excel dataset verification count guard

User issue:

- After refreshing the Primary quantitative included-paper Excel dataset verification panel and saving one paper as verified, the user expected the count to increase from 4 to 5, but the displayed included-record count fell to 3.

Implemented:

- Clarified that `Save verified Excel data` verifies extraction rows; it does not include a new study. New quantitative inclusion still comes from screening reviewer/PI decisions.
- Renamed the metric from `Quantitative records` to `Included records` and added helper text explaining that saving extraction verification should change `Verified rows`, not inclusion.
- Added stable row-index payload metadata for extraction-row saves.
- Server-side extraction review saves now merge edited rows into existing AI/review rows by row index instead of replacing the row array blindly.
- Existing AI extraction rows are used as the base when a previous review save accidentally collapsed rows, so multi-row articles can recover their structure on the next save.
- Added a UI guard: if a save response returns fewer included records than before the save, the panel raises an error instead of silently refreshing to a smaller count.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.108`
  - UI label: `Ver 2.43 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
git diff --check: passed.
```

# 2026-06-23 Excel dataset coverage/manual-required calibration

User issue:

- The Primary quantitative included-paper Excel dataset verification panel needed a clear distinction between `Evidence-backed`, `AI auto-filled`, and `Manual required`.
- The user asked for a deeper way to reduce manual-required burden without weakening scientific verification.

Implemented:

- Added visible dataset-status definitions:
  - `Evidence-backed`: AI value plus row/field-level source evidence;
  - `AI auto-filled`: value present without cell-level source evidence;
  - `Manual required`: unresolved blocker before row verification;
  - `Blank`: empty but not blocking the current row.
- Reduced false-positive manual flags:
  - verified rows no longer count as unresolved manual-required blockers;
  - `risk_of_bias_tool` and JBI tool version default to the locked JBI prevalence method;
  - `rob_overall_judgement` and `rob_jbi_overall_risk` mirror each other for blocker detection/export;
  - JBI notes or populated Q1-Q9 items can satisfy RoB evidence-location when quote/page fields are absent;
  - publication-bias standard error is required only when funnel eligibility is explicitly yes/eligible;
  - stale AI `missingCriticalFields` no longer remain as manual flags once the edited row contains that field.
- Added the rule to `research.md`, `plan.md`, and `guide.md`.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.107`
  - UI label: `Ver 2.42 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
git diff --check: passed.
```

# 2026-06-23 JBI prevalence RoB rerun workflow

User issue:

- The Musician PRMD primary quantitative papers now need risk-of-bias assessment.
- The RoB tool must be searched/confirmed, then the three configured AI reviewers should rerun included quantitative papers under that method.

Implemented:

- Searched prevalence/cross-sectional RoB options and locked the primary dataset to the JBI Critical Appraisal Checklist for Studies Reporting Prevalence Data.
- Kept AXIS and JBI analytical cross-sectional appraisal as secondary/narrative options for analytical risk-factor-only evidence.
- Added JBI prevalence Q1-Q9 fields to the extraction schema:
  - `rob_jbi_q1_sample_frame` through `rob_jbi_q9_response_rate`;
  - `rob_jbi_yes_count`, `rob_jbi_no_unclear_count`, `rob_jbi_overall_risk`, and `rob_jbi_notes`.
- Added server prompt guidance so the AI reviewers apply JBI prevalence, treat Q6/Q7 as critical pain/PRMD measurement items, and keep RoB 2/ROBINS-I out of the primary prevalence workflow.
- Updated saved-source reanalysis so old records merge the newest project extraction columns before rerun.
- Added screening UI controls:
  - `Prepare JBI RoB rerun` selects source-saved primary quantitative included records;
  - the panel shows primary quantitative included/source-saved/upload-needed counts;
  - a `Quantitative included` filter isolates the correct RoB target records.
- Clarified that legacy/no-source quantitative included records need PDF/Word full-text upload before AI RoB rerun.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.106`
  - UI label: `Ver 2.41 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
git diff --check: passed.
```

# 2026-06-23 Santos 2024 inconsistent-denominator risk-factor calibration guidance

User issue:

- Article 622 (`Santos et al., 2024, Odds ratio of occurrence of pain, postural changes, and disabilities of violinists`) was submitted with PI/ChatGPT final verification.
- Human verification showed it should be finalized as primary quantitative exclusion with limited narrative risk-factor support only.

Implemented:

- Added a server-side calibration rule for small cross-sectional risk-factor studies with internally inconsistent pain denominators.
- Added restrictions:
  - official sample size `38` conflicts with pain figure, k-means, figure explanation, and confusion-matrix outputs using `39` observations;
  - contradictory pain/no-pain category direction blocks `26/38`, `26/39`, `13/38`, or `13/39` from being selected;
  - missing recall period and playing-related case definition block primary prevalence synthesis;
  - missing anatomical-site and laterality-specific n/N blocks region/laterality extraction;
  - VAS/DASH remain narrative only when denominator/SD/extractable summaries are absent;
  - posture/practice ORs are narrative only unless CI/SE/exact p values and stable model definitions are available.
- Added the explicit Santos 2024 calibration example to default AI judgment guidance and always-injected scoring/selection rules.
- Added the calibration rule to `research.md`, `guide.md`, `plan.md`, and the handoff workspace `research.md`.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.105`
  - UI label: `Ver 2.40 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
git diff --check: passed.
```

# 2026-06-23 Musician PRMD protocol/process lock

User issue:

- A ChatGPT-generated improvement note clarified that the Musician PRMD project should not be treated as screening-complete.
- The project needs protocol/process corrections before Excel extraction: title/population alignment, PRISMA count audit, 71/72 mismatch reconciliation, AI-only snapshot preservation, reviewer/PI adjudication, RoB tool correction, and included-only extraction.

Implemented:

- Updated the project title/short title from a narrow orchestral label to `Instrumental Musicians` while keeping the legacy project id for storage compatibility.
- Added visible process locks to screening/analysis guidance: current status is AI full-text triage/extraction draft, not completed screening.
- Added required PRISMA/full-text audit checkpoints: `1652 -> 259 -> 253 -> 82 -> 72/71`.
- Preserved AI-only and human-reviewed pipelines as parallel methods evidence.
- Added new AI full-text traceability metadata for future runs: protocol version, prompt version/hash, researcher guidance hash, extraction schema hash, source checksum, model/profile data, and analysis schema version.
- Clarified that treatment-effect RCTs are excluded from primary prevalence synthesis, while extractable baseline epidemiologic data can be secondary evidence if prespecified.
- Replaced primary RoB planning with prevalence/cross-sectional tools: JBI prevalence, Hoy, AXIS, or JBI analytical cross-sectional; RoB 2/ROBINS-I are optional only for separate intervention questions.
- Updated `research.md`, `plan.md`, `guide.md`, and handoff research notes.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.104`
  - UI label: `Ver 2.39 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
git diff --check: passed.
```

# 2026-06-23 extraction dataset reviewer-agreement fallback

User issue:

- After the primary Excel dataset was limited to PI quantitative includes, newly included quantitative papers were not appearing in Included-paper Excel dataset verification.
- The strict `PI final decision = include_quantitative` filter blocked records that had reviewer 1/2 quantitative agreement but PI final was still pending.

Implemented:

- Kept PI final as the highest authority:
  - `PI final decision = include_quantitative` enters the primary Excel dataset;
  - `PI final decision = include_narrative_support` or `exclude` is excluded from the primary Excel dataset.
- Added a reviewer-agreement fallback only when PI final is pending:
  - dual-reviewer records enter the primary Excel dataset if reviewer 1 and reviewer 2 both selected `include_quantitative` and conflict status is `agreement` or `resolved`;
  - AI-only records still require PI final `include_quantitative`.
- Updated the panel and documentation wording.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.103`
  - UI label: `Ver 2.38 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
```

# 2026-06-22 Yoshimura 2006 overall-pain risk-factor calibration guidance

User issue:

- Article 376 (`Yoshimura et al., 2006, Risk Factors for Piano-related Pain among College Students`) was pending.
- Human PI verification showed it should be finalized as narrative/support: exclude from the primary anatomical-region/laterality prevalence meta-analysis, but retain for narrative risk-factor synthesis and limited supplementary overall piano-related pain if prespecified.

Implemented:

- Added a server-side calibration rule for cross-sectional risk-factor studies that report overall pain but not site/laterality prevalence.
- Added overall-pain and body-map restrictions:
  - overall pain while playing can be supplementary evidence but not a primary site/laterality row;
  - 30/35 pain while playing and 32/35 at least one marked pain site must remain separate outcomes;
  - body maps do not justify inferring site/laterality counts when only the number of marked sites is published;
  - VAS/frequency/severity means and percent of performance affected must not become `pain_n` without an explicit binary threshold;
  - small-sample correlation/regression risk-factor findings should be treated as exploratory narrative evidence.
- Added the explicit Yoshimura 2006 calibration example to default AI judgment guidance and always-injected scoring/selection rules.
- Added text retention keywords for piano/pianist, risk factor, correlation/regression, pain while/after playing, pain site/location, college/university, hands/fingers.
- Added the calibration rule to `research.md`, `guide.md`, and the handoff workspace `research.md`.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.102`
  - UI label: `Ver 2.37 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
```

# 2026-06-22 primary quantitative extraction dataset filter

User issue:

- The Included-paper Excel dataset verification panel was showing records adjudicated as narrative/support or supplementary synthesis.
- User clarified that only quantitative-included papers should enter the Included-paper Excel dataset verification workflow.

Implemented:

- Changed `src/lib/meta-extraction-dataset.ts` so the primary Excel extraction dataset includes only records with `PI final decision = include_quantitative`.
- `include_narrative_support`, narrative/support, supplementary quantitative, secondary synthesis, and excluded records remain in full-text history but are excluded from:
  - Included-paper Excel dataset verification table;
  - Excel dataset preview;
  - CSV copy/export;
  - downloaded XLSX workbook;
  - field coverage metrics.
- Updated the panel title and explanatory copy to `Primary quantitative included-paper Excel dataset verification`.
- Updated `research.md`, `guide.md`, `plan.md`, and the handoff workspace `research.md`.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.101`
  - UI label: `Ver 2.36 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
```

# 2026-06-22 Brusky 2010 graph-reconstructed broad-region AI calibration guidance

User issue:

- Article 132 (`Brusky, 2010, The High Prevalence of Injury Among Female Bassoonists`) was pending.
- Human PI verification showed it should be finalized as narrative/support: exclude from the primary site/laterality prevalence meta-analysis, but retain for limited supplementary quantitative or narrative synthesis of sex-stratified broad-region PRMDs among bassoonists.

Implemented:

- Added a server-side calibration rule that graph-reconstructed n/N values do not justify primary inclusion when the outcome/timeframe/body-site structure is incompatible.
- Added broad-region and timeframe restrictions:
  - `Head or neck`, `Back, chest, or shoulders`, `Arms or wrists`, and `Legs or hips` must not be split into standard anatomical site rows;
  - broad-region graph counts without laterality and fixed recall window are supplementary evidence only;
  - PRMD/injury definitions mixing diagnosed injury, self-reported symptoms, and location-only responses must not be coded as pain-only prevalence;
  - differential location missingness by sex must be flagged;
  - possible overlap with Brusky 2009 must be checked before pooling.
- Added the explicit Brusky 2010 calibration example to default AI judgment guidance and always-injected scoring/selection rules.
- Added text retention keywords for bassoon, injury, broad body-region labels, sex/gender terms, missing location data, Yates/chi-square, and cohort overlap.
- Added the calibration rule to `research.md`, `guide.md`, and the handoff workspace `research.md`.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.100`
  - UI label: `Ver 2.35 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
```

# 2026-06-22 Piatkowska 2016 symptomatic-cohort AI calibration guidance

User issue:

- Article 88 (`Piatkowska et al., 2016, Cervical Pain in Young Professional Musicians - Quality of Life`) was pending.
- Human PI verification showed the paper should be excluded from the primary prevalence meta-analysis and retained only as limited narrative or separately prespecified continuous-outcome evidence.

Implemented:

- Added a server-side calibration rule that symptomatic cohorts or case-only samples preselected for pain cannot be converted into prevalence numerator/denominator data.
- Added continuous-outcome restrictions:
  - VAS, NDI, SF-36, quality-of-life, severity, or disability means are not `pain_n / total_n` prevalence data;
  - final completers who all have pain because of inclusion criteria must not be coded as `45/45 = 100%` prevalence;
  - music college students must be classified as students/trainees even when the title says professional musicians;
  - attrition, outcome-related dropout risk, and unclear stage-specific instrument sample sizes must be flagged.
- Added the explicit Piatkowska 2016 calibration example to default AI judgment guidance and always-injected scoring/selection rules.
- Added text retention keywords for cervical pain, VAS, NDI, SF-36, quality of life, disability, symptomatic cohort, attrition, and student status.
- Added the calibration rule to `research.md`, `guide.md`, and the handoff workspace `research.md`.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.99`
  - UI label: `Ver 2.34 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
```

# 2026-06-22 Nyman 2007 composite-outcome AI calibration guidance

User issue:

- Article 42 (`Nyman et al., 2007, Work Postures and Neck-Shoulder Pain Among Orchestra Musicians`) was pending.
- Human PI verification showed DeepSeek was closest: the article is relevant and has reconstructable quantitative values, but it should be excluded from the primary region/laterality meta-analysis and retained for narrative or secondary composite-outcome synthesis.

Implemented:

- Added a server-side calibration rule that numeric extractability alone is not enough for `include_quantitative`; the outcome must map to the protocol's primary anatomical region and laterality rows.
- Added composite-outcome restrictions:
  - neck-shoulder complaint, neck/shoulder/interscapular pain combined, or any-region upper-body pain without separate anatomical/laterality estimates should not become primary quantitative rows;
  - reconstructable group n/total values may be recorded as secondary evidence;
  - pooled violin/viola or other pooled instrument groups must not be split unless the article reports separate values;
  - exposure groups combining instrument, arm elevation/posture, and playing time must not be interpreted as pure asymmetry effects.
- Added the explicit Nyman 2007 calibration example to default AI judgment guidance and always-injected scoring/selection rules.
- Added text retention keywords for neck/shoulder/interscapular/posture/arm-elevation terms so relevant Table II and Figure 1 context is less likely to be dropped before model review.
- Added the calibration rule to `research.md`, `guide.md`, and the handoff workspace `research.md`.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.98`
  - UI label: `Ver 2.33 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
```

# 2026-06-22 Zuhdi 2020 AI calibration guidance

User issue:

- Article 18 (`Zuhdi et al., 2020, Occupational Health Problems of Classical Guitarists`) was shown as pending/uncertain because the AI treated missing body-site n extraction as an eligibility problem.
- Human PI verification showed it should be included as an instrument-specific observational quantitative extraction candidate: Table 5 has site/laterality-specific 12-month pain counts with denominator n=190.

Implemented:

- Added a server-side calibration rule so the AI distinguishes eligibility from extraction completeness:
  - Instrument-specific observational studies can be quantitative candidates even when they are not core orchestral comparative studies.
  - If a table/appendix has site/laterality n/total values, incomplete extraction is a quality issue, not an eligibility exclusion.
  - Top-prevalence-only site reporting means unreported sites are `NR`, not `0`.
  - Overall numerator-percent inconsistency is flagged but does not invalidate internally consistent site-level rows.
  - Classical guitar remains `unclassified/other` for asymmetry group unless the protocol later defines a guitar class.
- Added the explicit Zuhdi 2020 calibration example to the default AI judgment guide and always-injected scoring/selection rules.
- Added text retention keywords for `classical guitar`, `thenar`, `posterior neck`, `lower back`, `appendix`, and related table terms so relevant table text is less likely to be dropped before model review.
- Added the calibration rule to `research.md`, `guide.md`, and the handoff workspace `research.md`.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.97`
  - UI label: `Ver 2.32 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
```

# 2026-06-22 Screening score criteria and normalization

User issue:

- Screening results showed mixed-scale AI values such as `confidence 1`, model-review `confidence 0.96`, and `score 4/moderate`, so researchers could not know how to interpret Confidence, Score, and Grade or when to select include/exclude.

Implemented:

- Added the official Screening AI score interpretation lock to `research.md`.
- Added the same operational criteria to `guide.md`.
- Added a visible `Confidence / Score / Grade selection criteria` details panel in the Screening result area.
- Added scoring and selection rules to the AI prompt so every full-text run receives the same criteria.
- Added default AI judgment-guide lines that are stored with each result and exported through the existing researcher guidance audit trail.
- Normalized AI confidence and review score scales:
  - Confidence 0-1 outputs are stored as 0-100 (`0.96 -> 96`, `1 -> 100`).
  - Review score / criterion score 1-5 outputs are stored as 0-100 (`4/5 -> 80`).
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.96`
  - UI label: `Ver 2.31 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
Local Meta dev SSR check on http://127.0.0.1:3321: Ver 2.31 visible.
```

# 2026-06-21 Full-text upload default saves new articles

User issue:

- When adding 9 new full-text articles, the upload workflow compared the files against existing records and did not save unmatched/different articles because existing-only mode was the default.
- This was backwards for the real research workflow: adding newly found full-text articles is the normal case, while replacing/updating an existing record is a special case.

Implemented:

- `src/components/MetaFullTextAssistant.tsx`
  - Changed `batchExistingOnlyMode` default from `true` to `false`.
  - The normal upload path now sends `unmatchedPolicy: save_new`, so unmatched full-text files are saved as new article records.
  - Automatic local match candidates no longer force an existing-record merge in the default mode.
  - `Update matched existing only` is now an explicit special-mode checkbox. When checked, matched files merge into existing records and unmatched files are not saved.
  - Default-mode UI text now states that unmatched full-text files are saved as new article records.
  - The old existing-only warning confirmation only appears when the special mode is actually checked.
- `guide.md`
  - Added Ver 2.30 instructions explaining that new article saving is the default and existing-record replacement is the exception.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.95`
  - UI label: `Ver 2.30 | 2026 copyright by JK Hyun`

Verification completed:

```text
npx.cmd tsc --noEmit --pretty false: passed
git diff --check: passed
npm.cmd run lint: passed
npm.cmd run build: passed
next start --hostname 127.0.0.1 --port 3216: HTTP 200
GitHub push to main: commit 9490226 pushed
Vercel production: https://wiregene-meta-analysis-lus7vn76w-rhhyuns-projects.vercel.app Ready
Vercel aliases: https://meta.wiregene.com and https://wiregene-meta-analysis.vercel.app attached
meta.wiregene.com auth check: HTTP 401, Basic realm="Wiregene Meta", charset="UTF-8"
Vercel logs --since 10m: No logs found
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

# 2026-06-21 Selected AI review progress numerator fix

User issue:

- `Run selected AI review (32/32)` was displayed even before or during the selected article AI review run.
- The denominator should be all selected articles, and the numerator should be how many selected articles have completed in the current AI review run.
- The old UI used `AI-ready saved source count / selected article count`, so it stayed `32/32` and did not change as analysis progressed.

Implemented:

- `src/components/MetaFullTextAssistant.tsx`
  - Added selected-run progress state that locks the selected article IDs and saved-source IDs at the moment `Run selected AI review` starts.
  - The progress numerator is derived only from that run's saved-source batch queue, so it increments while the queue runs instead of staying fixed.
  - `Run selected AI review (x/y)` now uses:
    - `y`: all selected Article list records.
    - `x`: finished records in the current selected-source AI review run.
  - A selected-source run starts at `0/y`, increments as each record becomes `saved`, `analyzed_not_saved`, or `failed`, and no longer uses AI-ready source count as the numerator.
  - `Selected articles` summary now also shows `completed x/y`.
- `guide.md`
  - Added Ver 2.29 instructions defining the progress numerator/denominator.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.94`
  - UI label: `Ver 2.29 | 2026 copyright by JK Hyun`

Verification completed:

```text
npx.cmd tsc --noEmit --pretty false: passed
git diff --check: passed
npm.cmd run lint: passed
npm.cmd run build: passed
next start --hostname 127.0.0.1 --port 3215: HTTP 200
GitHub push to main: commit 5e39b0a pushed
Vercel production: https://wiregene-meta-analysis-j0vvaoxnd-rhhyuns-projects.vercel.app Ready
Vercel aliases: https://meta.wiregene.com and https://wiregene-meta-analysis.vercel.app attached
meta.wiregene.com auth check: HTTP 401, Basic realm="Wiregene Meta", charset="UTF-8"
Vercel logs --since 10m: No logs found
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

# 2026-06-21 Compact screening workbench and editable AI guidance

User issue:

- Screening had too much always-visible explanation, and the full-text/source controls were separated from the saved article list and run buttons, causing repeated scrolling.
- Saved article rows were still too dependent on publisher PDF filenames. Researchers need the article serial number plus the actual article title, because filenames differ by publisher and are not reliable identifiers.
- AI reviewers can distort inclusion/exclusion reasoning if the prompt constraints are hidden. Researchers need to see and edit the AI judgment guide before running OpenAI-compatible models, and later audit which guide was used.

Implemented:

- `src/components/MetaFullTextAssistant.tsx`
  - Moved the practical full-text workbench into the `Saved AI review article list` area: file selection, `Analyze full text`, existing-record matching mode, Excel source sheet, saved-source update, and selected-article AI review controls now sit together.
  - Collapsed secondary explanation and advanced areas into `AI reviewer setup / source status`, `Advanced full-text upload fields`, `Full-text missing`, `Sheet progress`, and `Excel row / AI judgment guide`.
  - Article rows now display serial number + article title derived from AI title or Excel/reference-row title, while the source filename is only shown in row details.
  - Title sorting and batch matching now use the display title fallback instead of relying only on raw filename/titleGuess.
  - Added editable run-level AI guidance with browser caching, reset-to-default, upload analysis forwarding, saved-source reanalysis forwarding, and result display.
  - Verification CSV now includes `ai_researcher_guidance`.
- `src/lib/meta-full-text-prompt-guidance.ts`
  - Added the shared default AI judgment guide and normalization helper.
- `src/lib/meta-full-text-analysis.ts`
  - Replaced hardcoded prompt rules with the editable researcher guidance.
  - Stored `researcherGuidance` in each new full-text analysis result, including fallback/failed-reviewer cases.
- `src/lib/meta-full-text-history.ts`
  - Added `displayTitle` to history summaries and normalized stored `researcherGuidance`.
  - Preserved guidance when merging selected AI model reviews into existing records.
- API routes:
  - `/api/meta-analysis/full-text/analyze`
  - `/api/meta-analysis/full-text/history/[id]/reanalyze`
  - Both now accept and forward `researcherGuidance`.
- `guide.md`
  - Added Ver 2.28 instructions for the compact workbench, serial-number/title display, and editable AI judgment guide.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.93`
  - UI label: `Ver 2.28 | 2026 copyright by JK Hyun`

Verification completed:

```text
npx.cmd tsc --noEmit --pretty false: passed
git diff --check: passed
npm.cmd run lint: passed
npm.cmd run build: passed
Local production server check on http://127.0.0.1:3214/: HTTP 200, no stderr output
GitHub code commit: ef69bbe Compact screening workflow and AI guidance
GitHub push: main -> origin/main
Vercel production deployment: Ready
Deployment URL: https://wiregene-meta-analysis-qjynaeih3-rhhyuns-projects.vercel.app
Production alias: https://meta.wiregene.com
meta.wiregene.com response: 401 Basic realm="Wiregene Meta" as expected
Vercel log scan: No logs found for the latest deployment window
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

# 2026-06-21 Full-text missing article numbers

User issue:

- When selected saved articles could not be reanalyzed because the full-text article source file was missing, the UI only said the record was `legacy/no source`.
- The researcher had to scroll between the AI reviewer panel, article list, and upload area to figure out which article number needed PDF/Word upload.
- The Article list itself needed to show whether full-text was stored so the user could avoid manual back-and-forth.

Implemented:

- `src/components/MetaFullTextAssistant.tsx`
  - Added `full-text saved` / `full-text missing` badges directly on every `Article list` row.
  - Added visible full-text saved and missing counts in the Article list header.
  - Added selected full-text-missing article numbers inside `AI model reviewers for selected articles`.
  - Changed the selected AI review button to show ready/selected counts, for example `Run selected AI review (5/8)`.
  - If the selected records have no saved source at all, the button now produces a clear error with the missing article numbers instead of staying silent behind a disabled state.
  - Confirmation and completion warnings now include skipped full-text-missing article numbers.
  - Renamed the filter chip from `Legacy/no source` to `Full-text missing` for researcher-facing clarity.
- `guide.md`
  - Added Ver 2.27 instructions explaining full-text saved/missing badges and skipped-number warnings.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.92`
  - UI label: `Ver 2.27 | 2026 copyright by JK Hyun`

Verification completed before deployment:

```text
npx.cmd tsc --noEmit --pretty false: passed
git diff --check: passed
npm.cmd run lint: passed
npm.cmd run build: passed
GitHub code commit: 46f079e Show full-text source gaps in article list
GitHub push: main -> origin/main
Vercel production deployment: Ready
Deployment URL: https://wiregene-meta-analysis-myp7jm2w3-rhhyuns-projects.vercel.app
Production alias: https://meta.wiregene.com
meta.wiregene.com response: 401 Basic realm="Wiregene Meta" as expected
Vercel log scan: No logs found for the latest deployment window
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

# 2026-06-21 Selected article AI review runner

User issue:

- `AI model reviewers for this run` was too far from the full-text upload, saved article list, and AI review result area.
- Researchers had to scroll up and down repeatedly to choose AI reviewers and then run saved full-text reviews.
- The user asked that articles selected in `Article list (63/63 shown)` should all be usable as AI review targets.

Implemented:

- `src/components/MetaFullTextAssistant.tsx`
  - Added a compact `AI model reviewers for selected articles` panel directly above `Saved AI review article list`.
  - The compact panel lets the researcher refresh AI slots, select AI reviewer 1/2/3, select all ready reviewers, and run selected article AI review without scrolling back to the upper settings panel.
  - Article list checkboxes now act as selected article actions, not deletion-only selection.
  - `Select shown` was renamed to `Select shown for AI review`.
  - Added `Run AI review on selected` beside the article selection controls.
  - Selected records with saved full-text source are sequentially reanalyzed through the existing saved-source reanalysis endpoint.
  - Results are written back into the same saved article record; no duplicate paper record is created.
  - Selected `legacy/no source` records are counted and skipped with a clear warning because the original full-text binary is not stored yet.
  - The existing batch queue now also displays selected saved-source AI reruns, including per-record progress and failures.
- `guide.md`
  - Added Ver 2.26 instructions for running AI review directly from selected Article list records.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.91`
  - UI label: `Ver 2.26 | 2026 copyright by JK Hyun`

Verification completed:

- `npx.cmd tsc --noEmit --pretty false`: passed
- `git diff --check`: passed
- `npm.cmd run lint`: passed
- `npm.cmd run build`: passed
- GitHub push: `main -> origin/main`
- Vercel production deployment: Ready
- Deployment URL: `https://wiregene-meta-analysis-69ltdqgz3-rhhyuns-projects.vercel.app`
- Production alias check: `https://meta.wiregene.com/` returned `401 Basic realm="Wiregene Meta"` as expected
- Vercel log scan after deployment: only the expected `HEAD /` auth-check log, no runtime error logs

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

# 2026-06-21 Saved full-text article list sorting

User issue:

- In Screening, the saved full-text list needed to be listed by the existing article number.
- The user also asked for sorting by article title and first author.
- The change must not disturb saved full-text source files, AI reviewer drafts, reviewer verification, or delete-selection behavior.

Implemented:

- `src/lib/meta-full-text-history.ts`
  - Added `firstAuthor` to the full-text history summary returned by the history overview API.
  - First author is inferred from the Excel screening row/referenceRecord first, with a conservative filename fallback only when the row has no author-like value.
- `src/components/MetaFullTextAssistant.tsx`
  - Added saved-list sort state and controls: `번호순`, `제목순`, `1저자순`.
  - Default order is article-number ascending, based on the leading number in the full-text filename.
  - Re-clicking the active sort button toggles ascending/descending order.
  - The visible article rows and `Select shown`/batch delete target list now use the same sorted list.
  - Each article row shows the inferred `1저자` as compact context, while full source details remain hidden until selection.
- `guide.md`
  - Added Ver 2.25 guidance for saved full-text list sorting.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.90`
  - UI label: `Ver 2.25 | 2026 copyright by JK Hyun`

Verification completed:

- `npx.cmd tsc --noEmit --pretty false`: passed
- `git diff --check`: passed
- `npm.cmd run lint`: passed
- `npm.cmd run build`: passed
- GitHub push: `main -> origin/main`
- Vercel production deployment for sorting code: Ready
- Deployment URL: `https://wiregene-meta-analysis-bkz8hsld9-rhhyuns-projects.vercel.app`
- Production alias check: `https://meta.wiregene.com/` returned `401 Basic realm="Wiregene Meta"` as expected
- Vercel log scan after deployment: only the expected `HEAD / 401` auth check log, no runtime error logs

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

# 2026-06-21 Gemini reviewer value-model switch

User issue:

- AI reviewer 2 using `gemini-3.5-flash` repeatedly failed during full-text screening with `429 status code (no body)` and `Request timed out`.
- The user asked to choose the best cost-effective Gemini model for the current purpose.
- The current purpose is high-volume independent full-text screening/extraction draft generation, not final PI adjudication.

Decision:

- Set the Gemini reviewer recommendation and default to `gemini-3.1-flash-lite`.
- Keep the Google OpenAI-compatible Base URL unchanged: `https://generativelanguage.googleapis.com/v1beta/openai`.
- Rationale from official Gemini docs/pricing checked on 2026-06-21:
  - `gemini-3.5-flash` is positioned as a more capable model with much higher paid token pricing.
  - `gemini-3.1-flash-lite` is documented as the most cost-efficient Gemini 3.1 model for high-volume use.
- The two other reviewer slots can still use GPT/DeepSeek or another provider; PI adjudication remains the final decision layer.

Implemented:

- `src/lib/meta-ai-settings.ts`
  - default AI reviewer 3 Gemini model changed from `gemini-3.5-flash` to `gemini-3.1-flash-lite`.
  - stored legacy Gemini reviewer values `gemini-3.5` and `gemini-3.5-flash` are normalized to `gemini-3.1-flash-lite` for OpenAI-compatible Gemini slots.
- `src/lib/meta-full-text-analysis.ts`
  - runtime request normalization now converts legacy Gemini 3.5 model ids to `gemini-3.1-flash-lite`.
  - Gemini 429/quota/timeout errors now include a model-specific hint instead of only a generic failure.
- `src/components/MetaAiSettingsPanel.tsx`
  - default Gemini reviewer value and inline hint changed to `gemini-3.1-flash-lite`.
- `src/components/MetaFullTextAssistant.tsx`
  - AI reviewer slot display shows legacy Gemini values as `legacy -> gemini-3.1-flash-lite`.
- `guide.md`
  - documented the recommended Gemini model, the unchanged Base URL, and legacy model normalization.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.89`
  - UI label: `Ver 2.24 | 2026 copyright by JK Hyun`

Verification completed:

```text
npx.cmd tsc --noEmit --pretty false: passed
git diff --check: passed
npm.cmd run lint: passed
npm.cmd run build: passed
GitHub commit: 24f9609 Use Gemini Flash Lite 3.1 reviewer model
GitHub push: main -> origin/main
Vercel production deployment: Ready
Deployment URL: https://wiregene-meta-analysis-5ha235e2m-rhhyuns-projects.vercel.app
Production alias: https://meta.wiregene.com
meta.wiregene.com response: 401 Basic realm="Wiregene Meta" as expected
Vercel log scan: no logs found in the post-deploy scan window
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

# 2026-06-21 Screening full-text page declutter

User issue:

- The Screening page had become too dense.
- Full-text source files were shown in `Project file storage` and then effectively appeared again in the saved AI review list.
- The saved article list exposed file names, storage labels, AI review counts, dates, and title text all at once.
- The user specifically asked that papers be shown by their existing front number and title, with details hidden until selection.

Implemented:

- Updated `src/components/MetaStudyWorkspace.tsx`.
- `Project file storage` now keeps the stored source/audit file table collapsed by default.
- The panel still shows storage mode, folder, DB bundle download, and DB snapshot controls.
- A new `Show stored file list` button opens the full source/audit table only when audit or direct download is needed.
- The panel now explains that normal full-text work should continue through the saved AI review article list.
- Updated `src/components/MetaFullTextAssistant.tsx`.
- Renamed the saved history section to `Saved AI review article list`.
- Saved article rows now show the extracted front article number plus the confirmed title first.
- Raw source filenames are no longer the primary row title.
- Source filename, source storage, sheet, confidence, AI review count, reviewer mode, and saved date are hidden until the row is selected.
- The selected-record detail panel now starts with `Article {number} · {title}` and moves the raw source filename to a smaller detail line.
- Updated `guide.md` with the Ver 2.22 behavior.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.87`
  - UI label: `Ver 2.22 | 2026 copyright by JK Hyun`

Verification completed:

```text
npx.cmd tsc --noEmit --pretty false: passed
git diff --check: passed
npm.cmd run lint: passed
npm.cmd run build: passed
GitHub push: d70f9fb Declutter screening full-text workflow
Vercel production deployment: Ready
Deployment URL: https://wiregene-meta-analysis-rdkqwi7yc-rhhyuns-projects.vercel.app
Production alias: https://meta.wiregene.com
Vercel error log scan: no logs found in the post-deploy scan window
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

# 2026-06-20 Long-running full-text batch queue hardened

User issue:

- The user correctly pointed out that cumulative full-text upload followed by AI analysis can take several hours.
- A long-running batch must not depend on one very long request because browser, Vercel, model provider, Google Drive, or network timeouts can interrupt it.
- A failed file must not stop the remaining queue.

Implemented:

- Updated `src/components/MetaFullTextAssistant.tsx`.
- Added a timeout/retry wrapper for long full-text operations.
- Batch analysis remains file-by-file rather than one long server request.
- Retryable conditions:
  - network fetch failure,
  - request timeout,
  - HTTP 408 / 409 / 425 / 429,
  - HTTP 5xx.
- Non-retryable API validation errors still fail the current file clearly.
- Large-file upload is safer:
  - upload session creation retries,
  - each Google Drive chunk upload retries independently,
  - final Google Drive-based analysis retries.
- Saved-source reanalysis also uses timeout/retry.
- Queue UI shows the current attempt count while a file is analyzing.
- The browser requests screen wake lock during batch processing when supported, reducing interruption from sleep/idle behavior.
- Updated `src/app/api/meta-analysis/full-text/analyze/route.ts`.
- Server now checks `source_sha256` before creating a new history record. If a retry or reupload already saved the same PDF/Word source, the server merges into the existing record instead of creating a duplicate.
- Updated `guide.md`.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.85`
  - UI label: `Ver 2.20 | 2026 copyright by JK Hyun`

Operational principle:

- Current implementation is a robust browser-orchestrated sequential queue.
- It avoids Vercel function timeout by keeping each file as a separate request.
- For a future fully background queue that survives browser close/reboot, the next architecture step should be a durable server workflow/queue engine. This was not introduced in this patch to avoid destabilizing the already-working production flow.

Verification completed:

```text
npx.cmd tsc --noEmit --pretty false: passed
git diff --check: passed
npm.cmd run lint: passed
npm.cmd run build: passed
GitHub push: dd8402c Harden long-running full-text batch queue
Vercel production deployment: Ready
Deployment URL: https://wiregene-meta-analysis-l3borv92i-rhhyuns-projects.vercel.app
Production alias: https://meta.wiregene.com
Vercel error log scan: no error logs found in the post-deploy scan window
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-20 Project file storage display-name repair

User issue:

- In `Project file storage`, the file list showed raw internal storage names such
  as `full-text-files__{hash}-{title}.pdf`.
- The `Path` column also showed long Google Drive storage keys.
- This made it impossible to quickly identify which PDF/article a file referred
  to from the UI.

Implemented:

- Updated `src/components/MetaStudyWorkspace.tsx`.
- Added a display-name layer for project storage files:
  - `full-text-files__...pdf` now shows a readable article/file title first.
  - leading checksum/hash prefixes are removed from the visible primary name.
  - simple stored-title slugs are converted back to readable words.
  - `full-text-history.json` displays as `Full-text AI history`.
  - the original storage key remains visible only as secondary `Storage key`
    text.
- Renamed the table column from `Path` to `Storage`.
- Storage cells now show `Google Drive`, `Synology/local`, or `Storage` first,
  with the internal path lowered to small monospace detail.
- Download links still use the original internal file name, so existing download
  behavior is preserved.
- Updated `guide.md` with the Ver 2.21 display rule.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.86`
  - UI label: `Ver 2.21 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
git diff --check: passed.
npm.cmd run build: passed.
GitHub push: main 9565ea3 Improve project file storage display names.
Vercel production auto-deploy: Ready.
Deployment: https://wiregene-meta-analysis-11qmzttyy-rhhyuns-projects.vercel.app
Alias: https://meta.wiregene.com
```

Note:

- Local `curl.exe` from this PC could not connect to the Vercel deployment or
  `meta.wiregene.com`, but `npx.cmd --yes vercel@latest inspect` confirmed the
  production deployment is `Ready` and aliases are attached.

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

# 2026-06-20 add official Google Drive health verification

User issue:

- User made clear that Google Drive must be fixed formally, not hidden behind fallback behavior.
- The user believed Google Drive had been connected, but needed a definitive answer: connected OAuth approval alone is not enough unless Vercel Production has the matching refresh token and redeployed environment.
- The connected Vercel MCP account only exposed project `diabetic-foot-screening-wiregene-demo`; it did not expose the actual `meta.wiregene.com` Vercel project, so this session could not directly inspect or mutate the live Production env vars.
- Direct unauthenticated curl to `https://meta.wiregene.com/api/meta-analysis/storage-policy` and `/api/google-drive/oauth/start?diagnose=1` returned Basic Auth `401`, so live health must be checked from inside the authenticated app session.

Implemented:

- `src/lib/google-drive-health.ts`
  - Added a formal Google Drive health check.
  - Checks complete credential configuration.
  - Checks OAuth access-token refresh.
  - Checks Meta storage backend policy; on Vercel/serverless all shared Meta stores must resolve to `google-drive`.
  - Writes a small Google Drive probe JSON file, reads it back, lists it by name, and deletes it.
  - Returns a redacted client id, runtime, check list, and required actions without exposing secrets.
- `src/app/api/meta-analysis/storage-policy/route.ts`
  - Added `POST /api/meta-analysis/storage-policy?googleDriveHealth=1`.
  - The probe is POST-only because it performs write/read/delete.
  - `GET ?googleDriveHealth=1` returns 405 and does not mutate Drive.
- `src/components/MetaAiSettingsPanel.tsx`
  - Added `Google Drive verify` button in the AI settings Google Drive panel.
  - Shows `Official Drive health: PASSED/FAILED`, each check result, and required actions.
  - Google Drive is not considered solved unless all checks pass.
- `guide.md`
  - Updated to Ver 2.13 and documented the formal Google Drive resolution criterion.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.78`
  - UI label: `Ver 2.13 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
git diff --check: passed
npm.cmd run build: passed
next start --port 3233: started from production build
POST with Host: meta.wiregene.com to /api/meta-analysis/storage-policy?googleDriveHealth=1: returned JSON health report and 503 on missing local credentials
GET with Host: meta.wiregene.com to /api/meta-analysis/storage-policy?googleDriveHealth=1: returned 405 and did not run write probe
GET with Host: meta.wiregene.com to /api/meta-analysis/storage-policy: returned normal storage policy JSON
```

# 2026-06-20 protect Screening history from unsafe storage fallback

User issue:

- User showed the Screening page after storage changes. The page displayed `Synology/local folder` with an app path under `/var/task/.data/...`, warned about `GOOGLE_OAUTH_INVALID_GRANT`, and the previously saved Full-text article AI eligibility assistant records disappeared from the UI.
- Reviewer verification save buttons were disabled because no saved full-text history record could be selected.
- Root cause: when Google Drive project storage failed on Vercel/serverless, the project storage summary fell back to an empty local `/var/task` view, which looked like a real Synology/local store. Separately, full-text history load failures could still render an empty-state message, making existing saved analyses look deleted.

Implemented:

- `src/lib/meta-project-storage.ts`
  - Added an explicit `unavailable` project-storage summary state.
  - On Vercel/serverless, Google Drive project storage read failures now return `Google Drive unavailable` instead of pretending that empty local `/var/task` storage is the active project folder.
  - Serverless reads no longer silently fall back from Google Drive to local project/user-project files.
- `src/lib/meta-storage-policy.ts`
  - Replaced “no action needed” fallback wording with data-preservation wording: existing shared research data was not deleted or replaced.
- `src/components/MetaStudyWorkspace.tsx`
  - Storage mode now shows `Google Drive unavailable`, `Storage unavailable`, or `Serverless local fallback blocked` when appropriate.
  - Empty project-file lists no longer say “No project files have been saved yet” during storage-unavailable states.
  - Storage panel text now explains that Synology/local Docker uses persistent per-project folders and Google Drive is the online shared-storage option.
- `src/components/MetaFullTextAssistant.tsx`
  - Successful full-text history overview loads are cached in browser localStorage as a protective display copy.
  - Initial load and manual refresh use that last browser snapshot when shared storage is temporarily unavailable.
  - If no snapshot exists, the UI now says saved analyses are temporarily unavailable and not deleted, instead of showing “No saved full-text analyses yet.”
- `guide.md`
  - Updated to Ver 2.12 with the serverless Google Drive failure policy and full-text history display-protection behavior.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.77`
  - UI label: `Ver 2.12 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
git diff --check: passed
npm.cmd run build: passed
next start --port 3232: started from production build
curl -I http://localhost:3232: HTTP 200
curl -H "Host: meta.wiregene.com" http://127.0.0.1:3232: Meta page rendered with Ver 2.12
next dev --port 3232: not used for final verification because the sandbox denied creating .next/dev; production build/start was used instead
```

# 2026-06-20 clarify AI settings Google Drive and Synology storage status

User issue:

- User showed the AI evaluation settings screen after Google Drive had been connected.
- The card still displayed a generic `Google Drive 연결 시작` button, so it was unclear whether Google Drive was connected, unavailable, or simply optional.
- User also wanted the screen to explain that normal Meta work is saved to Synology by default.

Implemented:

- `src/lib/meta-ai-settings.ts`
  - AI settings summary now includes `storageHealth`, `storageWarning`, `googleDriveAuthMode`, `synologyDownloadPrimary`, and `synologyDownloadPath`.
  - Google Drive storage is distinguished as `google-drive-connected`, `google-drive-not-configured`, or `google-drive-unavailable`.
  - Synology/local storage is distinguished as `synology-local` when `META_PROJECT_STORAGE_ROOT=download`.
- `src/components/MetaAiSettingsPanel.tsx`
  - Storage status card now shows a human-readable storage state instead of only `google-drive:meta-ai-settings.json`.
  - Added a `기본 저장소` card explaining that Synology/local Docker stores project data in `/volume1/docker/meta/download/{project}`.
  - Added a separate `Google Drive online storage` status card with clear states:
    - `연결됨`
    - `설정은 있으나 재연결 필요`
    - `미설정`
    - `현재 기본 작업은 Synology/local 저장소 사용`
  - Google Drive button label now changes by state: reconnect, reconnect required, start connection, or configure connection.
- `guide.md`
  - Updated to Ver 2.11 and documented the new AI settings storage-status display.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.76`
  - UI label: `Ver 2.11 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
git diff --check: passed
npm.cmd run build: passed
```

# 2026-06-20 make Synology download the primary durable Meta store

User issue:

- Google Drive OAuth continued to create repeated `redirect_uri_mismatch` / invalid token loops.
- User proposed using Synology `/volume1/docker/meta/download` with per-project subfolders for full-text files, AI analysis content, and saved results instead of blocking work on Google Drive.
- Requirement remains that Google Drive can be optional online backup, but the Synology deployment must not depend on it for normal Meta work.

Implemented:

- Synology Docker now mounts `./download` to `/app/download` while keeping the old `./data` mount for backward compatibility.
- Synology `.env.example` and `scripts/synology-start-meta.sh` now enforce local storage defaults:
  - `META_PROJECT_STORAGE_ROOT=download`
  - `META_USER_PROJECTS_FILE=download/_system/user-study-projects.json`
  - `META_AI_SETTINGS_STORAGE_PATH=download/_system/meta-ai-settings.json`
  - `META_FULL_TEXT_HISTORY_STORAGE_PATH=download/_system/meta-full-text-history.json`
  - `META_FULL_TEXT_SOURCE_STORAGE_PATH=download/_system/full-text-files`
  - `REPORT_STORAGE_LOCAL_PATH=download/_system/research-briefing-storage.json`
- Start script creates `/volume1/docker/meta/download/_system` and copies legacy `/volume1/docker/meta/data` files/folders into the new download structure only when the new target is missing.
- Project storage hints now point Synology users to `/volume1/docker/meta/download/{project}` when `META_PROJECT_STORAGE_ROOT=download`.
- AI settings local-write help now points to `/volume1/docker/meta/download/_system`.
- `guide.md` and Synology README document the new storage policy and folder layout.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.75`
  - UI label: `Ver 2.10 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
git diff --check: passed
npm.cmd run build: passed
bash syntax check for scripts/synology-start-meta.sh: not run on this Windows host because bash is not installed
```

# 2026-06-20 block unsafe Google OAuth client loop and add repair flow

User issue:

- User showed that Ver 2.08 correctly locked the redirect URI to `https://meta.wiregene.com/api/google-drive/oauth/callback` and displayed `meta-production-locked`, but clicking `Continue to Google login` still reached Google's `400 redirect_uri_mismatch` page.
- This proved the remaining failure was the running Vercel `GOOGLE_DRIVE_CLIENT_ID`, not the redirect URI.
- The app still allowed users to continue with an unverified client id, which kept creating the same external Google error loop.

Implemented:

- `src/lib/google-drive-web-oauth.ts`
  - Added `GOOGLE_DRIVE_OAUTH_EXPECTED_CLIENT_ID` guard.
  - Production Meta default OAuth is allowed only when current `GOOGLE_DRIVE_CLIENT_ID` matches expected client id.
  - Added masked client status helpers.
  - Added short-lived encrypted HttpOnly temporary OAuth client cookie support.
  - OAuth state now records temporary client id when a repair client is used, and callback rejects missing/mismatched temporary client state.
  - Authorization URL and token exchange can now use either configured env client or temporary repair client.
- `src/lib/google-drive-oauth.ts`
  - Refresh-token verification can use the same temporary client id/secret that issued the token.
- `src/app/api/google-drive/oauth/start/route.ts`
  - Diagnostic/preflight page now shows current client id, expected client id, client status, and blocks Google redirect when production client status is not verified.
  - The old checkbox path no longer sends users to Google when expected client id is missing or mismatched.
  - Added `Repair with the correct Google Web OAuth client` form. User can paste the correct Google Cloud Web OAuth Client ID/Secret; the app stores it only as a short-lived encrypted HttpOnly cookie for the OAuth callback.
- `src/app/api/google-drive/oauth/callback/route.ts`
  - Callback exchanges and verifies token with temporary repair client when used.
  - Success page includes a complete Vercel Production env block: `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_OAUTH_EXPECTED_CLIENT_ID`, `GOOGLE_DRIVE_REFRESH_TOKEN`, and Meta Google Drive backend envs.
  - Failure page links to diagnostics instead of looping through `Start again`.
- `guide.md`
  - Updated OAuth instructions for Ver 2.09.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.74`
  - UI label: `Ver 2.09 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
git diff --check: passed
npm.cmd run build: passed
```

# 2026-06-20 lock Meta production Google OAuth redirect URI

User issue:

- The user still reached Google's Korean `400 redirect_uri_mismatch` screen after starting Google Drive OAuth.
- The previous safety flow stopped direct GET redirects and required POST confirmation, but production could still inherit a stale/wrong `GOOGLE_DRIVE_OAUTH_REDIRECT_URI` environment variable before falling back to the built-in Meta callback.
- The user asked to stop making them adjust repeated commands manually and put the stable value inside the program when it is not meant to change like AI model settings.

Implemented:

- `src/lib/google-drive-web-oauth.ts`
  - `meta.wiregene.com`, `mata.wiregene.com`, and Vercel production `WIREGENE_APP_MODE=meta` now always resolve Google Drive OAuth redirect URI to:
    - `https://meta.wiregene.com/api/google-drive/oauth/callback`
  - Production Meta returns redirect source `meta-production-locked`.
  - `GOOGLE_DRIVE_OAUTH_REDIRECT_URI` is now honored only after the production Meta lock check, so stale Vercel env values cannot change the production callback.
- `src/app/api/google-drive/oauth/start/route.ts`
  - Diagnostic/preflight page now explicitly says production Meta ignores `GOOGLE_DRIVE_OAUTH_REDIRECT_URI` and always sends the fixed callback to Google.
  - Public Meta aliases such as `search.wiregene.com`, `search.wiregen.com`, `mata.wiregene.com`, and production `.vercel.app` hosts now redirect OAuth start requests to canonical `https://meta.wiregene.com/...` before creating nonce/cookies.
- `src/app/api/google-drive/oauth/callback/route.ts`
  - Successful OAuth env block no longer tells the user to set `GOOGLE_DRIVE_OAUTH_REDIRECT_URI`, because production Meta now locks the callback in code.
- `guide.md`
  - Updated Google Drive OAuth instructions for Ver 2.08.
  - Clarified that if `meta-production-locked` is visible and Google still returns `redirect_uri_mismatch`, the remaining cause is the wrong `GOOGLE_DRIVE_CLIENT_ID` in Vercel Production or a missing exact Authorized redirect URI on that specific Google Cloud Web OAuth client.
  - Clarified that Google Drive OAuth must start from canonical `https://meta.wiregene.com` so the host that sets the nonce cookie is the host receiving Google's callback.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.73`
  - UI label: `Ver 2.08 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
git diff --check: passed
npm.cmd run build: passed
```

# 2026-06-20 replace OAuth start link flow with POST confirmation gate

User issue:

- User remained stuck on the Google `redirect_uri_mismatch` page.
- A specialist sub-agent reviewed the OAuth structure and found that server-side preflight based on Google HTML/Location text is not reliable.
- The sub-agent also found that simple links such as `/api/google-drive/oauth/start?go=1` still allowed users to leave the app and hit the Google error loop.

Implemented:

- Replaced `/api/google-drive/oauth/start` route structure:
  - `GET /api/google-drive/oauth/start` never redirects to Google.
  - `GET /api/google-drive/oauth/start?go=1` also never redirects to Google.
  - `GET` only renders the Meta diagnostic/confirmation page.
  - Google redirect is only created from `POST /api/google-drive/oauth/start`.
- Added required confirmation gate:
  - page shows redirect URI, redirect source, and masked Client ID.
  - user must tick a checkbox confirming the exact redirect URI is registered in Google Cloud Authorized redirect URIs for the displayed Client ID.
  - hidden nonce plus HttpOnly cookie must match before redirecting.
- Kept Google authorization preflight as a secondary warning only, not as the primary safety mechanism.
- Removed direct `<a href="?go=1">` style Google continuation links.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.72`
  - UI label: `Ver 2.07 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
rg oauth/start?go=1 in src: 0 matches
npm.cmd run lint: passed
npm.cmd run build: passed
```

# 2026-06-20 force AI settings Google Drive button to diagnostic screen

User issue:

- The user remained stuck on Google's `redirect_uri_mismatch` page and could not proceed.
- Even though `/api/google-drive/oauth/start` was changed to show preflight first, the UI button still pointed to `/api/google-drive/oauth/start`, so an older or cached deployment could still appear to go straight to Google.

Implemented:

- Changed the AI settings panel button from:
  - `/api/google-drive/oauth/start`
  - to `/api/google-drive/oauth/start?diagnose=1`
- This forces the first click to the Meta internal OAuth redirect URI check page.
- If clicking the button still goes directly to Google's error page, the deployed app is not yet running this version.
- Updated `guide.md`.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.71`
  - UI label: `Ver 2.06 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
npm.cmd run build: passed
```

# 2026-06-20 stop direct Google OAuth redirect mismatch screen

User issue:

- Clicking Google Drive OAuth still showed Google's Korean `400 redirect_uri_mismatch` page.
- The app should not keep sending users into an external Google error page with no actionable app context.

Investigation:

- The connected Vercel app only exposed project `diabetic-foot-screening-wiregene-demo` with domains `dmfoot.wiregene.com` and related Vercel domains.
- The `meta.wiregene.com` production project/env was not visible through the connected Vercel app, so the exact production `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_OAUTH_REDIRECT_URI` could not be audited directly from MCP.
- Therefore the app itself must expose the actual runtime OAuth values before redirecting to Google.

Implemented:

- Changed `/api/google-drive/oauth/start` flow:
  - default `GET /start` now shows a Meta internal `Google Drive connection preflight` page instead of immediately redirecting to Google.
  - the page displays exact redirect URI, redirect source, and masked Google Client ID.
  - Google login happens only via `/api/google-drive/oauth/start?go=1`.
- Added server-side Google authorization preflight before redirecting:
  - if Google already returns `redirect_uri_mismatch` or `invalid_client`, Meta shows an internal diagnostic page and does not send the user to the Google error page.
  - diagnostic page includes exact runtime redirect URI and masked client id.
- Kept `/api/google-drive/oauth/start?diagnose=1` for direct diagnostic checks.
- Updated `guide.md`.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.70`
  - UI label: `Ver 2.05 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
npm.cmd run build: passed
```

# 2026-06-20 suppress Meta AI settings read failed OAuth details leak

User issue:

- `AI model reviewer slots` still showed a raw error:
  - `meta AI settings storage read failed`
  - `backend: google-drive`
  - `GOOGLE_OAUTH_INVALID_GRANT`
- The previous fallback did not catch this because the OAuth diagnostic lived inside the storage error `details`, not only in `error.message`.

Implemented:

- Expanded `isRecoverableGoogleDriveStorageError` to inspect:
  - `error.message`
  - `error.details`
  - nested `error.cause`
  - `GOOGLE_OAUTH_*` diagnostic codes
- Updated Google Drive storage error code detection to read the expanded diagnostic text.
- Changed `updateMetaAiSettings` to use the same read fallback as summary/config reads:
  - `readStoredMetaAiSettingsOrEmpty()`
  - stale Google Drive AI settings reads no longer block rendering or basic update preparation.
- Write failures still surface because saving requires a working remote backend.
- Updated `guide.md`.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.69`
  - UI label: `Ver 2.04 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npx.cmd tsx classifier reproduction: passed
npm.cmd run lint: passed
npm.cmd run build: passed
```

# 2026-06-20 fix Google Drive OAuth redirect_uri_mismatch hardening

User issue:

- Google login now opens but stops with `400 error: redirect_uri_mismatch`.
- The user should not have to guess which redirect URI the app sent to Google.

Implemented:

- Hardened production Google Drive Web OAuth redirect URI handling:
  - default Meta production redirect URI is fixed to `https://meta.wiregene.com/api/google-drive/oauth/callback`.
  - `GOOGLE_DRIVE_OAUTH_REDIRECT_URI` remains an explicit override when needed.
  - local/non-production requests can still use the request origin for local testing.
- Added OAuth diagnostic mode:
  - `https://meta.wiregene.com/api/google-drive/oauth/start?diagnose=1`
  - shows the exact redirect URI and masked Google client id used by the app.
- Added `GOOGLE_DRIVE_OAUTH_REDIRECT_URI=<callback>` to the successful OAuth callback Vercel env block so future deployments stay pinned to the same callback.
- Updated `guide.md` with the exact `redirect_uri_mismatch` recovery rule:
  - add the callback under Google Cloud `Authorized redirect URIs`, not only JavaScript origins.
  - if the exact URI is already registered, check that Vercel `GOOGLE_DRIVE_CLIENT_ID` belongs to the same Web OAuth client.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.68`
  - UI label: `Ver 2.03 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
npm.cmd run build: passed
```

# 2026-06-20 fix Google Drive OAuth permission block and AI settings read fallback

User issue:

- Clicking `Google Drive 연결 시작` showed `Administrator permission is required`.
- The AI evaluation settings page showed a red `meta AI settings storage read failed` error with `GOOGLE_OAUTH_INVALID_GRANT`.
- This broke a previously working settings screen and blocked the user from proceeding.

Implemented:

- Changed Google Drive OAuth start/callback route access:
  - default now allows any authenticated Meta user.
  - Portal admin-only restriction is available only if `META_GOOGLE_DRIVE_OAUTH_ADMIN_ONLY=true`.
- Changed Meta AI settings reads:
  - recoverable Google Drive/OAuth read failures no longer break the AI settings screen.
  - read fallback returns empty settings or Vercel `OPENAI_API_KEY` environment fallback.
  - write errors still surface, because persistent save cannot succeed until Google Drive credentials are fixed.
- Sanitized the Google Drive OAuth callback success/error HTML text to avoid malformed/mojibake page strings.
- Updated `guide.md` with the new permission and fallback behavior.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.67`
  - UI label: `Ver 2.02 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
npm.cmd run build: passed
```

# 2026-06-20 add researcher-facing guide.md storage and workflow guide

User issue:

- Researchers need a clear guide explaining what is saved where.
- The guide must be detailed enough for researchers who are not familiar with meta-analysis.
- `guide.md` must be updated whenever version, storage behavior, screen names, or workflow content changes.

Implemented:

- Added root `guide.md`.
- The guide explains:
  - Meta workflow by screen.
  - Meaning of copy/save/download/snapshot buttons.
  - Exact storage map for study list, project workspace state, saved project files, AI settings, full-text history, full-text source files, extraction dataset, DB bundle, OAuth token, and API keys.
  - Vercel + Google Drive online storage requirements.
  - Synology/local Docker storage defaults.
  - Google Drive Web OAuth connection workflow.
  - full-text upload and source-file reuse policy.
  - AI reviewer vs human reviewer workflow.
  - Included-paper Excel dataset verification.
  - DB bundle and DB snapshot policy.
  - `storage-policy` endpoint checks.
  - Required guide update policy.
- Copied the full guide into the handoff workspace guide.md as well.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.66`
  - UI label: `Ver 2.01 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
npm.cmd run build: passed
```

# 2026-06-20 implement Meta Google Drive Web OAuth connection flow

User issue:

- User should not manually assemble or execute OAuth parameter URLs.
- Existing `meta.wiregene.com` Web OAuth client should be usable through the app.
- The app must provide a direct Google Drive connection action and callback route.

Implemented:

- Added `src/lib/google-drive-web-oauth.ts`.
  - Builds Google OAuth authorization URLs for Web OAuth.
  - Uses Drive-only scope: `https://www.googleapis.com/auth/drive.file`.
  - Uses signed, short-lived OAuth `state` plus an HttpOnly nonce cookie.
  - Exchanges authorization `code` at `https://oauth2.googleapis.com/token`.
  - Verifies the returned refresh token by obtaining an access token.
- Added production callback routes:
  - `GET /api/google-drive/oauth/start`
  - `GET /api/google-drive/oauth/callback`
- Updated `src/proxy.ts` so Meta mode permits `/api/google-drive/oauth/*`.
- Added a Google Drive connection section and button to `MetaAiSettingsPanel`.
  - Button label: `Google Drive 연결 시작`.
  - Required Google Cloud redirect URI displayed in the UI:
    - `https://meta.wiregene.com/api/google-drive/oauth/callback`
- Callback success page shows the verified `GOOGLE_DRIVE_REFRESH_TOKEN` and Meta Google Drive storage env values for Vercel Production.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.65`
  - UI label: `Ver 2.00 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
npm.cmd run build: passed
next build route list includes:
  /api/google-drive/oauth/start
  /api/google-drive/oauth/callback
```

Remaining user-side action after deployment:

- In Google Cloud Web OAuth client, register the exact redirect URI:
  - `https://meta.wiregene.com/api/google-drive/oauth/callback`
- In Vercel Production, ensure `GOOGLE_DRIVE_CLIENT_ID` and `GOOGLE_DRIVE_CLIENT_SECRET` are the same Web OAuth client values.
- After using the new in-app button, copy the callback success page env block into Vercel Production and redeploy.

# 2026-06-20 remove raw Google OAuth credential instructions from user-facing Meta errors

User issue:

- The fallback warning still included a long raw Google OAuth `invalid_grant` message and credential-regeneration instructions.
- That message is not actionable for a researcher and looks like a broken product.
- User-facing Meta screens must never expose raw OAuth credential diagnostics as workflow guidance.

Implemented:

- Changed `googleDriveFallbackWarning` in `src/lib/meta-storage-policy.ts`:
  - no raw OAuth error text is appended.
  - user-facing message now states that Meta is using local fallback and no action is needed for the current research workflow.
  - a short diagnostic code is allowed, e.g. `GOOGLE_OAUTH_INVALID_GRANT`.
- Changed `storageFallbackNotice`:
  - no longer tells the researcher to run deployment commands.
  - now states that the screen is continuing in local/browser fallback mode.
- Changed low-level `src/lib/google-drive-oauth.ts`:
  - no longer throws long refresh-token/credential-regeneration instructions.
  - throws concise diagnostic-code messages only.
- Updated full-text analyze OAuth help text:
  - points to Synology/local upload path or `/api/meta-analysis/storage-policy`.
- Updated operational-error matching to use diagnostic codes.
- Verified the previous raw message strings are no longer present in `src`.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.64`
  - UI label: `Ver 1.99 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
npm.cmd run build: passed
rg raw OAuth message strings in src: 0 matches
```

# 2026-06-20 centralized Meta storage policy, no patchwork

User issue:

- Patchwork fixes are unacceptable; the Meta platform must be structurally reliable enough for competitive productization.
- Google OAuth/storage failures must not reappear as repeated raw errors across Meta screens.
- Storage behavior must be diagnosable after deployment.

Implemented:

- Added a centralized Meta storage policy module:
  - `src/lib/meta-storage-policy.ts`
  - single source of truth for serverless/local runtime detection.
  - single source of truth for `META_ALLOW_GOOGLE_DRIVE_STORAGE`.
  - single backend resolver for Meta JSON stores.
  - single backend resolver for full-text source files.
  - single Google Drive/OAuth storage error classifier.
  - single UI fallback notice generator.
  - redacted runtime policy summary.
- Refactored storage users to consume the central policy:
  - `meta-project-storage.ts`
  - `meta-ai-settings.ts`
  - `meta-full-text-history.ts`
  - `meta-full-text-source-files.ts`
  - `MetaStudyWorkspace.tsx`
- Added runtime diagnostic API:
  - `GET /api/meta-analysis/storage-policy`
  - returns app version, runtime mode, Google Drive storage permission, auth configuration presence, and resolved Meta storage backends.
- Removed duplicated local `metaGoogleDriveStorageAllowed`, `isServerlessRuntime`, and Google OAuth regex logic from individual storage modules.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.63`
  - UI label: `Ver 1.98 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
npm.cmd run build: passed
```

# 2026-06-20 Google OAuth failure UI/API fallback for Meta workspace

User issue:

- The Meta page still displayed Google OAuth `invalid_grant` errors after the previous storage hardening.
- The screenshot showed `Loading...` for storage mode, proving part of the new UI had deployed, but the storage API still surfaced Google OAuth failures.
- The app needs to remain usable even if stale Google OAuth credentials exist or the server is temporarily running an older runtime configuration.

Implemented:

- Added API-level Google Drive fallback in `src/lib/meta-project-storage.ts`:
  - project file storage list falls back to local storage summary when Google Drive read fails with OAuth/config errors.
  - project text file read falls back to local project files when Google Drive read fails.
  - project text file write retries local storage on local Docker when Google Drive write fails.
  - user study project list read falls back to local storage when Google Drive read fails.
  - user study project list write retries local storage on local Docker when Google Drive write fails.
- Added warning propagation on project storage summaries instead of throwing a blocking red error.
- Added client-level fallback in `MetaStudyWorkspace`:
  - study list load/sync OAuth failures become a local/browser fallback notice instead of a red sidebar error.
  - Project file storage OAuth failures render a local/browser fallback summary instead of blocking the panel.
  - protocol/search/workbook shared-state OAuth failures become fallback notices instead of red errors.
  - project file save buttons download the CSV/JSON/TXT/MD to the browser when Google/server storage is unavailable.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.62`
  - UI label: `Ver 1.97 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
npm.cmd run build: passed
```

# 2026-06-20 hard-stop Meta Google Drive storage on local Docker

User issue:

- After the previous fix, the UI changed to `Loading...`, but Google OAuth `invalid_grant` errors still appeared.
- That proved explicit `google-drive` runtime values could still force Meta storage APIs to call Google Drive.
- The app needs to remain usable on Synology/local Docker even when stale Google Drive OAuth credentials remain in `.env`.

Implemented:

- Added a hard local-Docker policy across Meta storage libraries:
  - On serverless/Vercel, explicit Google Drive storage still works.
  - On Synology/local Docker, explicit `google-drive` storage is ignored unless `META_ALLOW_GOOGLE_DRIVE_STORAGE=true`.
- Applied the policy to:
  - project file storage
  - user study project list storage
  - Meta AI settings storage
  - full-text history storage
  - full-text PDF/Word source file storage
- Updated Synology runtime start script:
  - seeds and corrects `META_ALLOW_GOOGLE_DRIVE_STORAGE=false`.
  - keeps Meta storage on local JSON/local files by default.
- Updated `synology/docker/meta/.env.example` with `META_ALLOW_GOOGLE_DRIVE_STORAGE=false`.
- If Google Drive is intentionally needed for Meta storage on local Docker, the operator must explicitly set:
  - `META_ALLOW_GOOGLE_DRIVE_STORAGE=true`
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.61`
  - UI label: `Ver 1.96 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
npm.cmd run build: passed
```

# 2026-06-20 fix Meta local storage routing OAuth error storm

User issue:

- A previously usable Meta page became filled with repeated Google OAuth `invalid_grant` errors.
- The page showed `Synology/local folder`, but project file storage, study list sync, and workbook shared state were still trying to use Google Drive.
- The error made the Screening page hard to use even though the intended deployment was Synology/local Docker.

Root cause:

- Meta project storage and user-project storage could inherit `REPORT_STORAGE_BACKEND=google-drive`.
- Full-text history storage could also inherit non-Meta storage backend variables.
- On Synology this caused Meta-specific local storage flows to call Google Drive when old/invalid Google OAuth values existed in the runtime `.env`.
- The UI also displayed `Synology/local folder` while storage was still loading or had failed, which made the diagnosis misleading.

Implemented:

- Stopped Meta project file storage from inheriting `REPORT_STORAGE_BACKEND`.
- Stopped Meta user-project storage from inheriting `REPORT_STORAGE_BACKEND`; it now follows explicit `META_USER_PROJECTS_STORAGE_BACKEND`, explicit `META_PROJECT_STORAGE_BACKEND`, serverless Google fallback, then local.
- Stopped Meta full-text history storage from inheriting `REPORT_STORAGE_BACKEND` / `GRANT_STORAGE_BACKEND`; it now follows explicit `META_FULL_TEXT_HISTORY_STORAGE_BACKEND`, explicit `META_PROJECT_STORAGE_BACKEND`, serverless Google fallback, then local.
- Updated Synology start script to correct runtime `.env` values to local Meta storage:
  - `REPORT_STORAGE_BACKEND=local-json`
  - `META_PROJECT_STORAGE_BACKEND=local-json`
  - `META_USER_PROJECTS_STORAGE_BACKEND=local-json`
  - `META_AI_SETTINGS_STORAGE_BACKEND=local-json`
  - `META_FULL_TEXT_HISTORY_STORAGE_BACKEND=local-json`
  - `META_FULL_TEXT_SOURCE_STORAGE_BACKEND=local-file`
- Added source storage defaults to `synology/docker/meta/.env.example`.
- Fixed Project file storage UI so storage mode shows `Loading...` when storage has not loaded instead of incorrectly implying Synology/local.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.60`
  - UI label: `Ver 1.95 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
npm.cmd run build: passed
```

# 2026-06-20 batch deletion for saved full-text history records

User issue:

- Deleting wrongly uploaded or duplicate saved full-text AI analysis records one by one is too slow.
- The saved article list needs checkboxes so two or more records can be selected and deleted together.
- Batch deletion must still protect shared stored PDF/Word source files.

Implemented:

- Added batch history deletion support:
  - `DELETE /api/meta-analysis/full-text/history`
  - accepts `ids` in the JSON body or query string.
  - returns the refreshed history overview, deleted record summaries, and source-file cleanup warnings.
- Added `deleteMetaFullTextHistoryRecords` in `src/lib/meta-full-text-history.ts`.
  - removes all selected records with one history-store write.
  - deletes an unshared stored full-text source file only when no remaining record references it.
  - deduplicates source cleanup when selected records reference the same stored source.
- Updated `MetaFullTextAssistant` saved article list:
  - each saved record row now has a deletion checkbox.
  - `Select shown` selects all records currently visible under the active filter.
  - `Clear selection` resets the pending deletion selection.
  - `Delete selected` deletes all selected records after confirmation and refreshes saved counts.
  - if the currently open record is deleted, the active analysis and verification form are cleared.
- Single-record delete remains available from the selected-record detail panel.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.59`
  - UI label: `Ver 1.94 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
npm.cmd run build: passed
```

# 2026-06-20 Meta DB export and durable storage policy

User issue:

- Every DB generated in the Meta workflow must be downloadable.
- Data volume will grow, so the design must avoid slow exports, timeout errors, and payload-size failures.
- Durable storage must support Synology/local Docker and Google Drive, with a clear policy for DB snapshots and large full-text files.

Implemented:

- Added a centralized Meta DB export route:
  - `GET /api/meta-analysis/projects/[projectId]/db-export?format=zip`
  - `GET /api/meta-analysis/projects/[projectId]/db-export?format=json`
  - `POST /api/meta-analysis/projects/[projectId]/db-export`
- Added `src/lib/meta-db-export.ts`:
  - builds a project-scoped DB snapshot.
  - builds a ZIP bundle for browser download.
  - saves a JSON DB snapshot to project storage through the same Synology/Google Drive project storage adapter.
- Added `Download DB bundle` and `Save DB snapshot` buttons to `ProjectStoragePanel`.
- The DB bundle includes:
  - `manifest.json`
  - `project-workspace-state.json`
  - `user-projects.json`
  - `ai-settings-summary.redacted.json`
  - `full-text-history.json`
  - `extraction-dataset.json`
  - `extraction-dataset.csv`
  - saved project text files under `project-files/`
- Added explicit storage/export policy in the UI:
  - DB JSON/ZIP exports include research state, project files, full-text AI history, reviewer verification, extraction dataset, source-file metadata, and redacted AI settings.
  - full-text PDF/Word binaries are not embedded in DB JSON/ZIP.
  - full-text source binaries stay in Synology/local storage or Google Drive and are tracked by storage type, fileName, size, sha256, localPath or driveFileId.
  - existing `meta-db-snapshot-*` files are skipped during export to prevent recursive snapshot growth.
- Added export limits for speed and reliability:
  - single project text file: 25 MB
  - total included project text files: 80 MB
  - files beyond limits are listed in the manifest with a skipped reason instead of breaking the export.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.58`
  - UI label: `Ver 1.93 | 2026 copyright by JK Hyun`

Storage policy:

- Synology/local Docker should use local project storage for speed and DB snapshots:
  - `META_PROJECT_STORAGE_BACKEND=local-json`
  - `META_PROJECT_STORAGE_ROOT=.data/meta/projects`
  - `META_FULL_TEXT_SOURCE_STORAGE_BACKEND=local-file`
- Vercel/serverless or cross-PC sharing should use Google Drive for DB/project storage and full-text source storage when large uploads are required.
- API keys are not exported. AI settings are included only as redacted summaries.

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
npm.cmd run build: passed
```

# 2026-06-20 saved full-text history deletion

User issue:

- The older AI-model run record around item 33 overlapped with newly uploaded analyses.
- The user could not proceed because there was no delete button for a mistakenly uploaded or duplicate full-text analysis record.
- Saved full-text analyses need a DB/storage deletion path, not just visual filtering.

Implemented:

- Added backend deletion support:
  - `DELETE /api/meta-analysis/full-text/history/[id]`
  - deletes the saved full-text history record from the project-scoped history store.
  - returns the refreshed saved-record overview, deleted record summary, and source-file cleanup status.
- Added `deleteMetaFullTextHistoryRecord` in `src/lib/meta-full-text-history.ts`.
  - removes the history record.
  - updates saved/verified counters through the same overview flow.
  - checks whether the stored source file is still referenced by another record before attempting source cleanup.
- Added source-file cleanup helpers:
  - local source files are deleted only if the path is inside configured full-text storage roots.
  - Google Drive source files can be deleted by id when they are not shared by another saved record.
  - source cleanup failure is returned as a warning and does not roll back the already-deleted history record.
- Added UI delete control in `MetaFullTextAssistant`:
  - select a saved full-text analysis record.
  - click `Delete saved record`.
  - confirm the deletion.
  - the saved list, counts, selected analysis, and verification state update immediately.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.57`
  - UI label: `Ver 1.92 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
npm.cmd run build: passed
```

Operational note:

- This is intended for duplicate/mistaken full-text AI analysis records. The UI requires confirmation because deletion removes AI model comparisons, reviewer verification, extracted dataset draft, and any unshared stored source file for that saved record.

# 2026-06-20 DeepSeek reviewer model-id normalization

User issue:

- After adding DeepSeek balance, AI reviewer 3 still failed in the full-text AI model comparison table.
- The provider response showed this was no longer a payment problem:
  - accepted model ids: `deepseek-v4-pro` or `deepseek-v4-flash`
  - submitted model id: `DeepSeekV4Flash`

Implemented:

- Added server-side model-name normalization in `src/lib/meta-ai-settings.ts`:
  - `DeepSeekV4Flash`, `DeepSeek V4 Flash`, `deepseek_v4_flash`, and similar variants normalize to `deepseek-v4-flash`.
  - `DeepSeekV4Pro`, `DeepSeek V4 Pro`, `deepseek_v4_pro`, and similar variants normalize to `deepseek-v4-pro`.
  - Already-saved settings are normalized when AI reviewer configs are resolved, so old saved `DeepSeekV4Flash` entries should run with `deepseek-v4-flash` after redeploy.
- Added a DeepSeek-specific hint in `MetaAiSettingsPanel`:
  - OpenAI-compatible slots whose Base URL or model name mentions DeepSeek now show the exact accepted V4 model ids.
- Improved full-text AI reviewer request warnings:
  - DeepSeek 400 errors that mention supported model names now explicitly tell the user to use `deepseek-v4-flash` or `deepseek-v4-pro`.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.56`
  - UI label: `Ver 1.91 | 2026 copyright by JK Hyun`

Operational note:

- DeepSeek Base URL and API key had reached the provider successfully; the blocking issue in the screenshot was the model id spelling/casing.
- Recommended slot 3 setting:
  - Provider: `OPENAI_COMPATIBLE`
  - Base URL: the DeepSeek OpenAI-compatible endpoint already being used
  - Model: `deepseek-v4-flash` or `deepseek-v4-pro`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
npm.cmd run build: passed
```

# 2026-06-20 duplicate full-text merge prompt and OpenAI-like reviewer routing

User issue:

- When a new AI model is used on an already uploaded paper, the app should ask whether to merge with the existing paper record instead of creating a duplicate.
- If merged, the saved full-text list must not show the paper twice; previous AI decisions/model reviews should remain visible together with the new model result.
- AI reviewer 3 using `gpt-5.5` did not work.

Implemented:

- Added duplicate detection in the full-text upload UI by normalized uploaded file name versus saved history record file name.
- If duplicate candidates are found before a new upload analysis:
  - the app asks whether to merge into the existing saved article record,
  - OK sends `duplicatePolicy=merge` and the target history id,
  - Cancel stops the run so a duplicate saved article is not created.
- Added backend merge support to `/api/meta-analysis/full-text/analyze`:
  - `duplicatePolicy=merge` finds the target record by id, source SHA-256, file name, or title,
  - new AI model reviews are merged into the existing record,
  - previous analysis is kept in `analysisArchive`,
  - the response returns the existing record summary, so the UI updates the same row instead of adding another paper.
- Exported a shared history summary helper so analyze responses include model-review counts consistently.
- Fixed OpenAI-like reviewer routing:
  - `OPENAI_COMPATIBLE` slots without Base URL but with OpenAI-like model ids such as `gpt-*`, `o-*`, `chatgpt-*`, or `ft:*` now route through the OpenAI Responses API.
  - AI settings no longer warns that Base URL is required for OpenAI-like models.
  - If an OpenAI-like model still returns 404, the warning now explains that the exact model id/key access should be checked.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.55`
  - UI label: `Ver 1.90 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
npm.cmd run build: passed
```
# 2026-06-19 legacy source upload auto-runs selected AI reviewers

User issue:

- Another PC had progressed to `Ver 1.88`.
- Existing Musician PRMD pain records include older `gpt-5-nano` full-text analyses.
- These records now need comparison by up to three AI model reviewers.
- If an old history record does not have the original PDF/Word full-text source saved, the app should ask for the article upload and then automatically analyze it with the saved/selected AI reviewer models without creating a duplicate record.

Implemented:

- Kept the existing same-record backend flow:
  - `POST /api/meta-analysis/full-text/history/[id]/source` attaches the uploaded source to the selected legacy record.
  - `POST /api/meta-analysis/full-text/history/[id]/reanalyze` runs the selected AI reviewer models and replaces/merges the analysis on the same history record.
- Removed the confusing save-only UI path for legacy/no-source records:
  - All legacy source upload buttons now call `saveSourceToSelectedHistory({ rerunAfterSave: true })`.
  - The buttons require at least one runnable AI reviewer selection.
  - Button labels now state that the source is saved and AI reviewers run immediately.
- Added AI comparison progress to the saved full-text area:
  - Overall saved-record progress shows how many records have the selected target number of AI model reviews.
  - Each saved article row shows `AI reviews x/y`.
  - The selected record detail shows stored model names when model-review comparisons exist.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.54`
  - UI label: `Ver 1.89 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed
npm.cmd run lint: passed
npm.cmd run build: passed
```
# 2026-06-19 saved-record rerun duplicate guard and Gemini 404 fix

User issue:

- Uploading one of the existing 72 full-text PDFs through the normal upload path could create a new saved history record instead of updating the old `gpt-5-nano` legacy record.
- AI reviewer 2 using Google Gemini failed with `404 status code (no body)`, and the comparison count showed total reviewers without separating successful and failed model drafts.

Implemented:

- Normal upload button now says `Analyze as NEW saved record` or `Analyze queue as NEW records (...)`.
- If legacy/no source records exist and no saved record is selected, normal upload now asks for confirmation before creating new saved article record(s).
- If any saved record is selected, normal upload also asks for confirmation because that path still creates new saved article record(s); the saved-record update button is the non-duplicating path.
- Saved-source action labels now say the selected saved record will be updated, and helper text states that the saved article count does not increase.
- Saved-source rerun completion notice states that the same saved article record was updated and no duplicate was created.
- AI model comparison now displays succeeded / failed / total counts.
- At that time, Google Gemini OpenAI-compatible legacy shorthand `gemini-3.5` was mapped to `gemini-3.5-flash`; this was superseded on 2026-06-21 by `gemini-3.1-flash-lite` because of repeated 429/timeouts and cost concerns.
- Gemini 404 warnings now explain that the model id/Base URL should be checked instead of showing only a raw status code.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.53`
  - UI label: `Ver 1.88 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
```

# 2026-06-19 explicit legacy source storage explanation

Clarification:

- If saved records show `legacy/no source`, the original full-text article files are not stored.
- Those records contain the previous analysis result and metadata only.
- To apply new AI models to those records, the matching PDF/Word full-text article must be uploaded once and attached to the selected saved record.

Implemented:

- Added Korean explanation in the AI reviewer panel: the `legacy/no source` count means PDF/Word originals are not stored.
- Added Korean explanation above the saved full-text list when legacy records exist.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.52`
  - UI label: `Ver 1.87 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
```

# 2026-06-19 saved-source rerun button state fix

User issue:

- The `Run selected AI reviewers on saved full text` button remained grey with no explanation.
- In practice the button was enabled only when a saved record had `sourceFileSaved=true`, but most existing `gpt-5-nano` records were `legacy/no source`.
- The user should not have to infer the enablement rules.

Implemented:

- Replaced the single static disabled rerun button with a state-aware action:
  - No saved record selected: `Select a saved record first`.
  - No ready AI reviewer selected: `Select ready AI reviewers first`.
  - Legacy/no source record selected but no file chosen: `Choose one matching file for this legacy record`.
  - Legacy/no source record selected and exactly one file chosen: `Save source, then run selected AI reviewers`.
  - Source already saved: `Run selected AI reviewers on saved full text`.
- The same state-aware action is used in the AI reviewer panel and selected-record detail card.
- Added visible `Current button action: ...` text below the legacy rerun workflow note.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.51`
  - UI label: `Ver 1.86 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
```

# 2026-06-19 legacy rerun UI visibility and Google Drive binary upload fix

User issue:

- The Screening page still did not visibly show the process for rerunning the 72 old `gpt-5-nano` legacy analyses with new AI models.
- Selecting and uploading one existing PDF without first selecting a saved legacy record still went down the normal `Analyze full text` path.
- That normal path failed at `save_source_file` with `Google Drive binary upload failed: 400 Malformed multipart body`, even for a small 64 KB PDF.

Implemented:

- Fixed Google Drive binary multipart upload formatting by inserting the required blank line between the binary part headers and the PDF bytes.
- Added a visible `Legacy/no source` saved-record filter so old GPT-5-nano records can be found directly.
- Added a visible legacy rerun workflow notice in the AI model reviewer panel.
- Added `Save source to this record` inside the selected saved-record detail card, in addition to the upload-box source-save button.
- Added a warning when a file is selected but no saved record is selected: `Analyze full text` creates a new analysis; old GPT-5-nano records must be selected first and upgraded with the matching source.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.50`
  - UI label: `Ver 1.85 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
```

# 2026-06-19 legacy full-text source attach button

User issue:

- The saved full-text list already had 72 legacy records analyzed with `gpt-5-nano`.
- Those records displayed `legacy/no source`, so the new multi-model AI rerun button stayed disabled.
- The UI only told the user to upload the source once, but did not provide an explicit button/API to save that uploaded source back onto the selected legacy record.

Implemented:

- Added `POST /api/meta-analysis/full-text/history/[id]/source`.
- The route saves a newly uploaded source file to an existing saved full-text record without creating a duplicate analysis record.
- The route supports direct multipart upload and the existing large-file Google Drive chunk path.
- Added `updateMetaFullTextSourceFile` so legacy history records can be upgraded with a reusable source file.
- In `MetaFullTextAssistant`, selecting a legacy saved record and choosing one matching full-text file now shows:
  - `Save uploaded source to this legacy record` in the AI reviewer panel.
  - `Save this file to the selected legacy record` in the upload box.
- After source save, the saved record remains selected, the file input queue is cleared, and `Run selected AI reviewers on saved full text` becomes available for the selected AI models.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.49`
  - UI label: `Ver 1.84 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed; `/api/meta-analysis/full-text/history/[id]/source` is included in the route output.
```

# 2026-06-19 project-scoped full-text and extraction dataset storage

Context:

- First synced the actual app repository with `origin/main` before implementing, because another PC had already pushed multi-model AI reviewer, saved-source reanalysis, AI-only PI adjudication, and Excel workbook export work.
- Local pre-merge edits were stashed instead of being reapplied directly because those local code edits included Korean mojibake/default-model changes that should not overwrite the newer remote work.

Implemented without overlapping the other PC work:

- Full-text analysis history now accepts an optional `projectId` scope.
- Project-scoped history is stored separately from the legacy global `.data/meta/meta-full-text-history.json`.
- The built-in `orchestral-prmd-asymmetry` project can still read the legacy global history as a fallback, so existing saved analyses do not disappear after the scoped storage change.
- Saved full-text source files now store under the project workspace for local storage and use project-prefixed names for Google Drive storage.
- Full-text history list/load/save, reviewer settings, reviewer/PI verification, AI-only skip/restore, and saved-source reanalysis API calls now pass the active project id.
- Extraction dataset overview, manual extraction verification save, CSV draft save, and `.xlsx` workbook download now use the active project id and active project extraction columns.
- The server no longer forces AI full-text extraction columns to the original orchestral project schema when the client sends a valid project-specific schema.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.48`
  - UI label: `Ver 1.83 | 2026 copyright by JK Hyun`
- Public URL correction:
  - The active public Meta link is `https://search.wiregene.com`, not `https://meta.wiregene.com`.
  - `search.wiregene.com`, the user-typed alias `search.wiregen.com`, and the typed alias `mata.wiregene.com` are now treated as Meta mode hosts.
  - Launcher links, portal site metadata, environment examples, and workspace manifest were updated to the corrected public URL.

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed without Turbopack trace warnings after narrowing project-scoped path helpers and local history file reads.
```

# 2026-06-18 AI reviewer rerun controls and Excel dataset workbook export

Current actual implementation repository:

```text
C:\Users\rhhyu\Documents\GitHub\wiregene-meta-analysis
```

User issue:

- Screening showed AI reviewer 1/2/3, but reviewer 3 could remain disabled when the researcher entered an OpenAI model without a Base URL.
- Saved full-text records from the previous `gpt-5-nano` run could not be clearly rerun with two or more new AI models.
- The selected-model rerun updated model comparison drafts but could leave the old primary AI decision/extraction row visible.
- Included-paper Excel dataset verification emphasized manual-required fields and CSV copy, while researchers need to see which Excel fields are AI-filled, evidence-backed, blank, or truly manual, then generate an actual Excel file.

Implemented:

- AI reviewer readiness:
  - OpenAI-like model names such as `gpt-*`, `o*`, `chatgpt-*`, and `ft:*` can run without a Base URL.
  - OpenAI-like reviewer slots inherit the primary OpenAI key when a slot-specific key is not set.
  - A reviewer slot that is off by default can still be selected for a specific run if it has a usable key/provider.
- Screening UI:
  - Added a visible `Run selected AI reviewers on saved full text` button directly inside the `AI model reviewers for this run` panel.
  - The button uses the already-saved source file and does not require reupload.
  - The panel shows whether the selected saved record has a reusable source or is legacy/no-source.
- Reanalysis behavior:
  - Selected saved-source reanalysis now promotes the new selected-run result to the current primary AI decision/extraction when the selected run produces usable AI output.
  - Existing and new model-review drafts are merged for comparison.
  - The UI notice warns the researcher to recheck reviewer/PI adjudication if the primary AI decision changed.
- Excel dataset:
  - Added per-record `fieldCoverage` and `coverageCounts`.
  - Field coverage status values: `audit`, `evidence-backed`, `auto-filled`, `manual-required`, `blank`.
  - Added aggregate stats for evidence-backed fields, AI auto-filled fields, blank editable fields, and editable field cells.
  - Added `Excel field coverage map` table.
  - Added status badges beside each Excel field editor.
  - Added real `.xlsx` workbook download via `GET /api/meta-analysis/extraction-dataset?format=xlsx`.
  - The workbook includes `Dataset` and `Field_Coverage` sheets and is generated with existing `jszip`.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.45`
  - UI label: `Ver 1.80 | 2026 copyright by JK Hyun`

Verification:

```text
npm.cmd run lint: passed.
npx.cmd tsc --noEmit --pretty false: passed after clearing stale .next/dev generated route cache.
npm.cmd run build: passed.
AI reviewer slot test: OpenAI-like reviewer 3 with model gpt-5.5 inherits the environment OpenAI key and no Base URL is required; slot remains off by default but selectable for a specific run.
XLSX generator test: createMetaExtractionDatasetXlsx returned a valid PK zip/xlsx signature.
Browser check in local Meta mode on http://127.0.0.1:3221: Ver 1.80 visible; Screening shows Run selected AI reviewers on saved full text; Included-paper Excel dataset verification shows Download Excel workbook (.xlsx), Excel field coverage map, and field coverage metrics; browser console errors=[].
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

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

## 2026-06-18 v1.77 Save CSV browser download fallback (Vercel 서버리스 대응)

User issue:

- `meta.wiregene.com` (Vercel 배포)에서 RIS 업로드 후 "Save master CSV" 클릭 시 즉시 에러 발생.

Root cause:

- Vercel 서버리스 환경은 파일시스템이 읽기 전용이라 `saveMetaProjectTextFile`이 항상 "read-only serverless filesystem" 에러를 던짐.
- body size가 아닌 파일시스템 제한이 진짜 원인.

Fix:

- `downloadFileToBrowser()` 헬퍼 추가: Blob URL로 브라우저 파일 다운로드 트리거.
- `isServerlessStorageError()` 헬퍼 추가: "serverless", "read-only", "Synology", "writable" 키워드 감지.
- `ProjectFileSaveButton`: 서버 저장 실패가 서버리스 환경 에러인 경우 자동으로 브라우저 다운로드로 fallback.
  - 버튼 상태: `"downloaded"` 추가, "Downloaded ↓" 표시.
  - 노란색 안내 메시지 3초 표시: "서버 저장 불가 (Vercel 환경) — 파일이 브라우저로 다운로드됐습니다."
  - Google Drive / Synology 환경에서는 기존과 동일하게 서버 저장.

Verification:

```text
npx tsc --noEmit: pass.
git push: 34b2982..f8305c5 main -> main.
```

Commits:
- `34b2982` Fix: gzip compression to bypass 4.5MB request body limit
- `f8305c5` Fix: browser download fallback when server save fails on Vercel serverless

Synology deploy/run command:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

---

## 2026-06-18 v1.76 Gzip compression for large payloads (body size 초과 대응)

User issue:

- RIS 파일 5개 업로드(13,047개 레코드) 후 "Save master CSV" 시 "Project file could not be saved" 에러.

Root cause analysis:

- master CSV가 ~10MB 이상이 되어 서버 요청 body 크기 제한 초과.

Fix:

- **Client (MetaStudyWorkspace.tsx)**:
  - `compressPayload()` 함수 추가: 브라우저 `CompressionStream` API로 gzip 압축, 미지원 시 uncompressed fallback.
  - `saveProjectTextFile`, `saveProjectWorkspaceState`, `saveUserProjects` 세 함수에 압축 적용.
- **Server (meta-project-storage.ts)**:
  - `parseRequestJson()` 함수 추가: `Content-Encoding: gzip` 헤더 감지 시 Node.js `zlib.gunzipSync`로 압축 해제.
- **API Routes**: `/files`, `/state`, `/projects` 세 라우트에 `parseRequestJson` 적용.

Verification:

```text
npx tsc --noEmit: pass.
npm run build: TypeScript pass. 빌드 워커 크래시는 기존 Windows 환경 문제 (원본 코드도 동일 오류).
git push: 77dcecb..34b2982 main -> main.
```

Synology deploy/run command:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

---

## 2026-06-17 v1.75 Study list duplicate cleanup and archive/delete controls


User issue:

- The left Meta Studies panel showed duplicate topics with the same title.
- The user needs a way to delete or archive studies so they no longer appear in the active study list.

Changes made in the canonical actual app repository:

```text
C:\Users\HyunJK\Documents\GitHub\meta.wiregene.com
```

- App visible version `Ver 1.74` -> `Ver 1.75`.
- Package version `0.1.39` -> `0.1.40`.
- `MetaStudyProject` now supports optional visibility fields:
  - `visibility=active|archived|deleted`
  - `archivedAt`, `deletedAt`, `updatedAt`, `duplicateOf`
- Client study-list merge now deduplicates by exact same project id and by normalized full title.
- Hidden records (`archived` or `deleted`) win over same-title active duplicates so a duplicate does not reappear from the built-in list, browser localStorage, or shared registry.
- New AI-created topics with the same title update the existing study instead of creating another duplicate card.
- Left project rail now shows only active studies in the default `진행 중인 연구` list.
- Each active study card now has `보관` and `삭제` controls.
- Archived studies are moved to a collapsed `보관함` section with `복원` and `삭제` controls.
- `/api/meta-analysis/projects` now accepts the visibility fields and the server storage layer also deduplicates same-title projects before writing Google Drive/local JSON.
- `SERVICE.md` documents the new shared-registry duplicate cleanup and archive/delete behavior.

Verification:

```text
npx tsc --noEmit: pass.
npm run lint: pass.
npm run build: pass.
Browser verification at http://127.0.0.1:3317: Ver 1.75 visible, active study count shown, 보관/삭제 buttons visible in the left study rail, console errors=[].
```

Important carryover:

- Continue using only `C:\Users\HyunJK\Documents\GitHub\meta.wiregene.com` for actual app code.
- Do not use Playground or `C:\Users\HyunJK\Documents\GitHub\wiregene-meta-analysis` for new app work.
- Existing local dirty user files were not touched:
  - `src/components/MetaAiSettingsPanel.tsx`
  - `src/lib/config.ts`
  - `src/lib/meta-ai-settings.ts`
  - untracked OAuth credential/token helper files

Synology deploy/run command:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-17 v1.72 Shared project workspace-state storage

User clarification:

- Having the same study list is not enough. Each study's internal work state must also be stored in one external/shared project storage layer.
- Other PCs must be able to open, edit, save, and download the same project state/files.
- `search.wiregene.com` and `omni.wiregene.com` should be able to discover meta-analysis projects and connect search/research-topic/working-state data.
- Meta-analysis projects often connect to real-data or hybrid papers, so stable project-level and record-level join keys are required.

Changes made:

- UI version `Ver 1.71` -> `Ver 1.72`.
- Package version `0.1.36` -> `0.1.37`.
- Added project workspace state API:
  - `GET/PATCH/PUT /api/meta-analysis/projects/{projectId}/state`
  - shared state file: `project-workspace-state.json`
- Added project text file download API:
  - `GET /api/meta-analysis/projects/{projectId}/files/{fileName}`
- Added cross-site manifest API:
  - `GET /api/meta-analysis/workspace/manifest`
- Added project file/state Google Drive backend:
  - `META_PROJECT_STORAGE_BACKEND=local-json|google-drive`
  - `META_PROJECT_DRIVE_PREFIX=meta-projects`
- Kept study-list registry storage separate:
  - `META_USER_PROJECTS_STORAGE_BACKEND=local-json|google-drive`
- `ProtocolStage` now loads/saves `protocolDraft` through shared project state.
- `SearchStage` now loads/saves `selectedDatabases`, `queryOverrides`, and `searchImportRows` through shared project state.
- `WorkbookFullTextBoard` now has `Save shared state` for `workbookBoard`.
- Project storage panel now shows local vs Google Drive backend and gives download links.

Recommended multi-PC / Vercel / cross-site env:

```text
META_USER_PROJECTS_STORAGE_BACKEND=google-drive
META_USER_PROJECTS_DRIVE_FILENAME=meta-user-study-projects.json
META_PROJECT_STORAGE_BACKEND=google-drive
META_PROJECT_DRIVE_PREFIX=meta-projects
GOOGLE_DRIVE_CLIENT_ID=<oauth-client-id>
GOOGLE_DRIVE_CLIENT_SECRET=<oauth-client-secret>
GOOGLE_DRIVE_REFRESH_TOKEN=<oauth-refresh-token>
GOOGLE_DRIVE_FOLDER_ID=<target-folder-id>
```

Verification:

```text
npx tsc --noEmit: pass.
npm run lint: pass.
npm run build: pass.
Browser verification at http://127.0.0.1:3227: Ver 1.72 displayed in Meta workspace.
API verification: manifest OK, state PATCH/GET OK, omni consumer listed, file download route returned 200 OK.
```

Synology deploy/run command:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-17 v1.73 Synology portal-auth startup fix

Problem:

- Synology created `/volume1/docker/meta/.env` from `.env.example`.
- Because local Basic Auth values were empty, `scripts/synology-start-meta.sh` stopped before Docker startup.
- The user asked whether keeping a local `APP_BASIC_AUTH_PASSWORD` in `.env` is necessary and whether portal/subsite credentials can be reused.

Fix:

- UI version `Ver 1.72` -> `Ver 1.73`.
- Package version `0.1.37` -> `0.1.38`.
- Synology start script now accepts either:
  - local Basic Auth: `APP_BASIC_AUTH_USER` + `APP_BASIC_AUTH_PASSWORD` or `APP_BASIC_AUTH_USERS`
  - portal central auth: `PORTAL_AUTH_CHECK_SECRET` or `WIREGENE_AUTH_CHECK_SECRET`
- Added `PORTAL_AUTH_CHECK_SECRET` and `PORTAL_AUTH_CHECK_URL` to Synology `.env.example`.
- Added `WIREGENE_AUTH_CHECK_SECRET` to root `.env.example`.
- Updated service docs with the portal-auth-only option.

Recommended secure option:

```text
APP_BASIC_AUTH_USER=
APP_BASIC_AUTH_PASSWORD=
APP_BASIC_AUTH_USERS=
PORTAL_AUTH_CHECK_SECRET=<same shared secret configured on portal.wiregene.com>
PORTAL_AUTH_CHECK_URL=https://portal.wiregene.com/api/auth/check
```

Synology deploy/run command:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-17 v1.74 Synology auth startup unblock

Problem:

- The Synology start script still stopped deployment when `/volume1/docker/meta/.env` did not contain local Basic Auth or `PORTAL_AUTH_CHECK_SECRET`.
- This forced manual `.env` editing before the container could even start.

Fix:

- UI version `Ver 1.73` -> `Ver 1.74`.
- Package version `0.1.38` -> `0.1.39`.
- `scripts/synology-start-meta.sh` now tries to auto-fill `PORTAL_AUTH_CHECK_SECRET` from common existing runtime files:
  - `/volume1/docker/portal/.env`
  - `/volume1/docker/wiregene-portal/.env`
  - `/volume1/docker/research-briefing/.env`
  - `/volume1/docker/search/.env`
  - `/volume1/docker/hyunlab/.env`
  - `/volume1/docker/wiregene/.env`
- If no auth value is found, the script logs a warning and still starts the Docker service instead of failing.
- Authentication should still be configured before exposing the service publicly.

Synology deploy/run command:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

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

## 2026-06-18 Multi-AI model reviewer workflow for full-text screening

Actual working repository:

```text
C:\Users\rhhyu\Documents\GitHub\wiregene-meta-analysis
```

User goal:

- Use two or three AI models as independent full-text reviewers before human/PI adjudication.
- Compare model-level eligibility and extraction results, then let the principal investigator make the final include/exclude decision.
- Preserve results so another PC can continue the same meta-analysis workflow.

Implemented:

- `src/lib/meta-ai-settings.ts`, `src/app/api/meta-analysis/ai-settings/route.ts`
  - AI settings now support three reviewer slots.
  - Slot 1 remains OpenAI/Responses-compatible with existing `OPENAI_API_KEY` fallback.
  - Slots 2 and 3 support OpenAI-compatible Chat providers with custom `baseUrl`, model name, key, enabled flag, and label.
  - Existing `enabled: false` settings are preserved during migration.
  - OpenAI-compatible slots without a valid base URL are not run.
- `src/components/MetaAiSettingsPanel.tsx`
  - Added editable AI model reviewer slots in the AI settings screen.
  - Shows provider, model, base URL, saved key source, replacement key input, clear-key option, and base-URL warning.
- `src/lib/meta-full-text-analysis.ts`
  - Full-text analysis now runs all enabled AI reviewer slots sequentially.
  - The first valid structured result remains the primary draft used by the existing screen.
  - Each model reviewer output is saved in `analysis.modelReviews` with model/provider, decision, confidence, summary, reasons, reviewer checks, review score/grade, extraction rows, cell evidence, missing fields, validation issues, schema version, file SHA-256, truncation flag, and warnings.
  - Fallback mode now preserves the same `modelReviews` structure.
- `src/components/MetaFullTextAssistant.tsx`
  - Added visible `AI model reviewer comparison` table to saved/current analysis results.
  - Verification CSV now includes `ai_model_reviews_json`.
  - Added PI final adjudication fields: PI name, final decision, and rationale.
- `src/lib/meta-full-text-history.ts`, `src/app/api/meta-analysis/full-text/history/[id]/route.ts`
  - Saved verification records now include PI final adjudication fields and adjudication timestamp.
  - Verification is considered complete only after reviewer decisions and PI final adjudication are saved.
- `src/app/api/meta-analysis/full-text/analyze/route.ts`
  - Saved-record summaries returned immediately after analysis now include reviewer decisions and PI final fields.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.41`
  - UI label: `Ver 1.76 | 2026 copyright by JK Hyun`

Important product note:

- This implementation stores full per-model reviewer drafts and PI final fields.
- A future improvement should add a dedicated disagreement matrix that highlights cell-by-cell extraction differences and immutable event logs for every reviewer/PI edit.

Verification:

```text
npm.cmd run lint: passed.
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run build: passed.
Browser verification in forced Meta mode on `http://127.0.0.1:3212`: `Ver 1.76` visible; AI settings renders three reviewer slots; browser console errors=[].
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-18 Full-text source persistence and saved-record reanalysis

User clarified:

- Full-text articles are uploaded once in a batch.
- Once uploaded, saved papers must not disappear when AI model settings change.
- The app must not require the researcher to upload the same full-text file again just to rerun analysis with a new AI model.

Implemented:

- Added `src/lib/meta-full-text-source-files.ts`.
  - Saves uploaded full-text source files separately from analysis history.
  - Local/Synology default path: `.data/meta/full-text-files`.
  - Vercel/serverless with Google Drive credentials uses Google Drive source storage.
  - Existing Google Drive large-file uploads keep their `driveFileId` instead of duplicating the file.
- Added `writeBinaryFileToGoogleDrive` in `src/lib/google-drive-storage.ts` so small multipart PDF/Word/TXT uploads can also be persisted to Google Drive when needed.
- `src/app/api/meta-analysis/full-text/analyze/route.ts`
  - Saves source file before analysis/history save.
  - History summaries now return `sourceFileSaved` and `sourceStorage`.
- `src/lib/meta-full-text-history.ts`
  - History records now include `sourceFile`.
  - Legacy records read safely with `sourceFile: null`.
  - Reanalysis updates the same record and archives the previous analysis in `analysisArchive` instead of creating a duplicate paper count.
- Added `POST /api/meta-analysis/full-text/history/[id]/reanalyze`.
  - Reads the saved source file.
  - Verifies the saved source SHA-256 checksum before reanalysis.
  - Runs analysis again with the current AI settings/model slots.
  - Keeps the same saved paper record and preserves previous analysis versions.
- Backend specialist review found one must-fix before commit: reanalysis had to confirm that stored bytes still match the originally saved source checksum. Fixed by adding read-time checksum verification and by checking existing local/Google Drive source files before reuse.
- `src/components/MetaFullTextAssistant.tsx`
  - Saved article list shows whether the source file is saved.
  - Current saved record card has `Re-analyze saved source with current AI`.
  - Legacy records without a persisted source are clearly marked and require a one-time reupload only for those older records.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.42`
  - UI label: `Ver 1.77 | 2026 copyright by JK Hyun`

Verification:

```text
npm.cmd run lint: passed.
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run build: passed.
Production build includes /api/meta-analysis/full-text/history/[id]/reanalyze.
Browser check on local Meta mode: Ver 1.77 visible; Screening saved article list shows legacy/no source for old records; Re-analyze saved source with current AI button appears and is disabled for records without a persisted source; console errors=[].
Temporary API flow test with isolated local history/source paths: analyze saved one source file; savedRecord.sourceFileSaved=true; reanalyze kept the same history id; analysisArchive count became 1; history record count stayed 1; tampered stored source file was blocked with checksum mismatch before analysis.
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

## 2026-06-18 AI-only verification skip for reviewer 1/2 workflow

User requirement:

- AI model comparison is only an additional screening aid.
- The default two-human-reviewer process must remain intact.
- If the researcher explicitly decides to use AI-model-only screening, the app must provide a button to skip reviewer 1/2 verification for that record.

Implemented:

- Added verification mode to full-text history:
  - `dual_reviewer` remains the default and keeps the existing reviewer 1/2 + PI workflow.
  - `ai_only` records store `reviewerReviewSkippedAt` and `reviewerReviewSkipReason`.
- Human verification worksheet now has:
  - `Skip reviewer 1/2: AI-only`
  - `Restore reviewer 1/2 workflow`
- In AI-only mode:
  - reviewer 1/2 decision controls and conflict workflow are disabled for that record.
  - PI final adjudication remains visible and required for the record to count as verification complete.
  - reviewer 1/2 decisions are not faked as human decisions.
- Saved analysis lists and current record card show whether a record is `AI-only verification` or `2-reviewer verification`.
- Extraction dataset logic now includes AI-only records only when PI final decision is include quantitative or include narrative/support.
- Verification CSV and extraction dataset audit columns include verification mode and reviewer-skip timestamp/reason.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.44`
  - UI label: `Ver 1.79 | 2026 copyright by JK Hyun`

Verification:

```text
npm.cmd run lint: passed.
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run build: passed.
Temporary AI-only API workflow test: upload saved one source file; PATCH verificationMode=ai_only kept reviewer 1/2 decisions pending, set reviewerReviewSkippedAt, counted the record as verification complete only with PI final decision/name, and included it in extraction dataset with verification_mode=ai_only.
Browser check in local Meta mode: Ver 1.79 visible; Human verification worksheet shows Skip reviewer 1/2: AI-only; default banner keeps two-reviewer workflow as default; console errors=[].
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-18 Screening AI reviewer slot selection and saved-source comparison rerun

User issue:

- AI settings can store three AI reviewer engines, but Screening only showed the previous `gpt-5-nano` result.
- There was no clear menu in Screening to select reviewer 2/3 and run them against an already-uploaded full-text source.

Implemented in the app repo:

- Screening full-text assistant now loads AI reviewer slots from `/api/meta-analysis/ai-settings`.
- Added `AI model reviewers for this run` panel directly in Screening.
  - Shows each slot label, model, provider, Base URL, key source, and readiness.
  - Researchers can select one or more ready reviewer slots.
  - OpenAI reviewers do not require Base URL; OpenAI-compatible reviewers require Base URL.
- New upload analysis sends selected `reviewerIds` to `/api/meta-analysis/full-text/analyze`.
- Saved full-text records now have a `Run selected AI on saved full text` button.
  - Uses the already-saved PDF/Word/TXT source file.
  - Does not require reupload.
  - Runs only the selected AI reviewer slots.
  - Merges selected model review results into the existing comparison table instead of deleting prior reviewer results.
- Reanalysis API `POST /api/meta-analysis/full-text/history/[id]/reanalyze` now accepts JSON body:

```json
{ "reviewerIds": ["ai_reviewer_2", "ai_reviewer_3"] }
```

- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.43`
  - UI label: `Ver 1.78 | 2026 copyright by JK Hyun`

Verification:

```text
npm.cmd run lint: passed.
npx.cmd tsc --noEmit --pretty false: passed.
npm.cmd run build: passed.
Temporary selected-reviewer API test: upload saved one source file; POST /reanalyze with reviewerIds ["ai_reviewer_2","ai_reviewer_3"] kept the same history id, kept history record count at 1, archived the previous analysis, and returned the selected reviewer ids in diagnostics.
Browser check in local Meta mode: Ver 1.78 visible; Screening shows AI model reviewers for this run; Refresh AI slots visible; selected reviewer summary visible; upload panel shows AI reviewer run; saved-record card shows Run selected AI on saved full text; legacy/no source records keep that button disabled; console errors=[].
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-18 Antigravity previous-PC handoff warning

User note:

- Some Meta work was also performed on the previous PC in Antigravity.
- The exact Antigravity diff is not visible from this PC unless it was committed/pushed or copied into this workspace.

Required rule before the next coding session:

- Do not assume this PC has all latest work.
- First check the actual app repository and GitHub for Antigravity-origin changes.
- Run:

```powershell
git -C C:\Users\rhhyu\Documents\GitHub\wiregene-meta-analysis fetch --all --prune
git -C C:\Users\rhhyu\Documents\GitHub\wiregene-meta-analysis status --short
git -C C:\Users\rhhyu\Documents\GitHub\wiregene-meta-analysis branch -a
git -C C:\Users\rhhyu\Documents\GitHub\wiregene-meta-analysis log --all --decorate --oneline -20
```

- If Antigravity work exists only on the previous PC and was not pushed, ask the user to push/copy that work before changing overlapping files.
- If Antigravity commits are already on GitHub, pull/merge them first and preserve them.
- Never overwrite or revert Antigravity changes unless the user explicitly asks.
- After reconciling, update both backup files again with the exact Antigravity commits/files that were incorporated.

## 2026-06-20 Gemini OpenAI-compatible reviewer schema hardening

User issue:

- In Screening, three model comparison ran with two successes and one failure.
- `gpt-5.4-mini` and `deepseek-v4-flash` returned structured reviewer drafts.
- `gemini-3.5-flash` returned a response, but the app marked it as fallback/failed.
- Vercel runtime evidence showed:

```text
Meta full-text OpenAI analysis schema validation failed.
fieldErrors: { extraction: ["Invalid input"] }
```

Root cause:

- Google Drive storage and the reanalysis request were working.
- The failure was model compatibility: Gemini's OpenAI-compatible JSON shape for `extraction` did not exactly match the strict internal schema.
- The app validated before normalizing model-specific shapes, so useful Gemini output could be discarded.

Implemented:

- Added an AI reviewer compatibility normalization layer before schema validation.
- `extraction` is now normalized into standard `rows`, `fieldEvidence`, `missingCriticalFields`, and `validationIssues` before Zod validation.
- The normalizer accepts common model variants:
  - `extraction` as object, array-like rows, indexed row object, or text issue.
  - `rows`, `row`, `data`, `extractedData`, or `extractionRows`.
  - `fieldEvidence`, `cellEvidence`, `field_evidence`, or `evidenceByField`.
  - string/object/list forms for missing fields, validation issues, reasons, next actions, evidence, reviewer checks, criteria, scores, and decisions.
- Schema failure logging now records reviewer id, label, provider type, model name, field errors, and form errors.
- User-facing warning now includes the schema area that still failed after compatibility normalization.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.79`
  - UI label: `Ver 2.14 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
git diff --check: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
GitHub push: main 7416f99 Fix extraction included records Korean text.
Vercel production auto-deploy: Ready.
Deployment: https://wiregene-meta-analysis-bt6euvlml-rhhyuns-projects.vercel.app
Alias: https://meta.wiregene.com
Vercel error logs after deploy: no recent errors found.
```

Remaining deployment verification:

```text
GitHub push: main 8622974 Harden OpenAI-compatible reviewer schema normalization.
Vercel production auto-deploy: Ready.
Deployment: https://wiregene-meta-analysis-j7n9tlqui-rhhyuns-projects.vercel.app
Alias: https://meta.wiregene.com
Vercel error logs after deploy: no recent errors found.
Public curl to /api/meta-analysis/storage-policy returned "Authentication required", which is expected because production is auth protected.
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-20 Full-text file selection made cumulative

User issue:

- In the `full-text 파일` upload control, selecting several files worked at first.
- But if the researcher clicked `파일 선택` again and selected more files, the previously selected files disappeared.
- This made the new batch workflow awkward because researchers often collect 60+ full-text files from multiple folders or select them in several passes.

Implemented:

- Updated `src/components/MetaFullTextAssistant.tsx`.
- File selection now accumulates across multiple file-picker actions.
- New files are merged with existing selected files.
- Duplicate selected files are removed using `file name + file size + lastModified`.
- The browser file input value is cleared after each selection so the same file can be selected again if needed.
- Added an explicit `Clear selected files` button.
- Added a visible accumulated-selection message:
  - total selected file count,
  - reminder that pressing `파일 선택` again adds files instead of replacing them.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.84`
  - UI label: `Ver 2.19 | 2026 copyright by JK Hyun`

Verification completed:

```text
npx.cmd tsc --noEmit --pretty false: passed
git diff --check: passed
npm.cmd run lint: passed
npm.cmd run build: passed
GitHub push: 4b66777 Make full-text file selection cumulative
Vercel production deployment: Ready
Deployment URL: https://wiregene-meta-analysis-3hj783fg3-rhhyuns-projects.vercel.app
Production alias: https://meta.wiregene.com
Vercel error log scan: no error logs found in the post-deploy scan window
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-20 Batch full-text auto-match and AI reviewer rerun

User issue:

- About 60 full-text files that already had a previous single-AI-model analysis still needed to be reuploaded.
- The workflow forced the researcher to select one article, upload one file, wait 2-3 minutes for AI analysis, then repeat.
- This is not acceptable for current studies and would be impossible for future studies with hundreds of full-text articles.

Implemented:

- Added batch existing-record auto-match workflow in `src/components/MetaFullTextAssistant.tsx`.
- Multiple PDF/Word/TXT/MD files can now be selected once.
- The app previews how many files are locally matched to existing saved article records.
- Matching now uses:
  - exact normalized file name,
  - saved file name containment,
  - saved title containment,
  - token overlap between uploaded file name, saved file name, and saved title,
  - year consistency,
  - ambiguity protection so near-ties are not automatically merged.
- Added `기존 저장 논문 자동 매칭 모드`.
  - Enabled by default.
  - Matched files update the existing record and run the selected AI reviewers.
  - Unmatched files are not saved as new records, preventing accidental duplicate article records.
  - Researchers can disable the mode only when intentionally adding new full-text records.
- Added per-file match details in the batch queue:
  - matched target record,
  - source saved / legacy-no-source state,
  - existing AI review count,
  - match score and reason.
- Updated `/api/meta-analysis/full-text/analyze` to accept `unmatchedPolicy: skip_new`.
  - If merge matching fails, the API returns analyzed-not-saved rather than creating a duplicate record.
- Updated server-side duplicate matching in `src/lib/meta-full-text-history.ts`.
  - After full-text extraction/AI title detection, the server tries exact title and fuzzy title matching.
  - This improves matching for generic file names such as EBSCO/FullText downloads.
- Updated `guide.md` with the Ver 2.18 batch workflow.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.83`
  - UI label: `Ver 2.18 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
git diff --check: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
GitHub push: main 21a2794 Add batch full-text auto-match rerun.
Vercel production auto-deploy: Ready.
Deployment: https://wiregene-meta-analysis-lcrjhamyo-rhhyuns-projects.vercel.app
Alias: https://meta.wiregene.com
Vercel error logs after deploy: no recent errors found.
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-20 AI reviewer progress denominator stabilized

User issue:

- During Screening, three AI models had been running correctly, but Gemini failed on the final article.
- After that single model failure, previously completed saved articles suddenly changed from `AI reviews 3/3` to `AI reviews 3/2`.
- This looked like saved reviewer history had been damaged, even though the underlying saved reviews were still present.

Root cause:

- The saved article list used the currently runnable/selected AI reviewer count as the denominator.
- If one configured model became temporarily unavailable, the denominator could shrink from 3 to 2 for every saved record.

Implemented:

- Updated `src/components/MetaFullTextAssistant.tsx` so the AI reviewer target denominator is stable.
- The denominator now uses the maximum of:
  - the default three-model review plan,
  - enabled AI reviewer slots,
  - selected runnable reviewers,
  - currently runnable reviewers,
  - stored model-review counts already saved in history.
- Result:
  - Existing completed records remain `AI reviews 3/3`.
  - A paper where one model truly failed remains visibly incomplete as `AI reviews 2/3`.
  - A transient model/provider failure can no longer make other records display impossible values such as `3/2`.
- Updated `guide.md` with the Ver 2.17 display rule.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.82`
  - UI label: `Ver 2.17 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
git diff --check: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
GitHub push: main aeab400 Stabilize AI reviewer progress target.
Vercel production auto-deploy: Ready.
Deployment: https://wiregene-meta-analysis-5y8uoi5xw-rhhyuns-projects.vercel.app
Alias: https://meta.wiregene.com
Vercel error logs after deploy: no recent errors found.
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-20 Full-text upload block moved before saved analyses

User issue:

- In Screening, the `full-text 파일` and `Excel source sheet` inputs appeared after `Saved full-text analyses`.
- This forced researchers to scroll between upload/source selection and the saved-record AI model update controls.
- Desired workflow is to keep AI reviewer selection, full-text upload/source sheet selection, and saved-record update controls close enough to continue working in one screen.

Implemented:

- Reordered `src/components/MetaFullTextAssistant.tsx` JSX only.
- New visible order:
  1. `AI model reviewers for this run`
  2. `full-text 파일` and `Excel source sheet`
  3. `Saved full-text analyses`
- Logic and state handling were not changed.
- Updated `guide.md` with the Ver 2.16 workflow order.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.81`
  - UI label: `Ver 2.16 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
git diff --check: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
GitHub push: main 629e84b Move full-text upload before saved analyses.
Vercel production auto-deploy: Ready.
Deployment: https://wiregene-meta-analysis-1hrqsmr7y-rhhyuns-projects.vercel.app
Alias: https://meta.wiregene.com
Vercel error logs after deploy: no recent errors found.
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```

## 2026-06-20 Extraction dataset included-records Korean UI repair

User issue:

- The `Included full-text records` panel in Extraction showed mojibake text instead of Korean:
  - Broken description under the panel title.
  - Broken empty-state text when no included full-text records exist.
  - Broken saved notice prefix.
  - Broken `쨌` separator in record metadata.

Implemented:

- Repaired the Korean UI text in `src/components/MetaExtractionDatasetPanel.tsx`.
- Updated the included-records helper text to:
  - `검증된 include 논문만 Excel row 후보로 표시합니다.`
- Updated the empty state to:
  - `아직 include로 검증된 full-text 기록이 없습니다.`
- Updated dataset save notice prefix to `저장완료`.
- Replaced the broken record metadata separator with ` / `.
- Confirmed no remaining mojibake markers in `MetaExtractionDatasetPanel.tsx`.
- Version bumped:
  - `package.json` / `package-lock.json`: `0.1.80`
  - UI label: `Ver 2.15 | 2026 copyright by JK Hyun`

Verification:

```text
npx.cmd tsc --noEmit --pretty false: passed.
git diff --check: passed.
npm.cmd run lint: passed.
npm.cmd run build: passed.
```

Regular Synology deploy/run command after GitHub push:

```sh
git -C /volume1/docker/wiregene-meta-analysis pull --ff-only origin main && /bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh
```
