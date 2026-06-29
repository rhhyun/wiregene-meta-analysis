# Wiregene Meta — 연구 목적 및 프레임워크

## 2026-06-29 Google Drive OAuth unavailable protection lock

Google Drive OAuth failure handling is part of the research-data safety protocol:

- `GOOGLE_OAUTH_INVALID_GRANT` means the refresh token is invalid, expired, revoked, or mismatched with the deployed OAuth client. Code cannot repair that token; the operator must reconnect Google Drive and redeploy/update environment variables when required.
- Screening must not crash or show an empty shared dataset as if records were deleted when Google Drive cannot be read.
- Full-text history read failures from recoverable Google Drive/OAuth errors must return `storage.unavailable=true` with reconnect and diagnostic links.
- Browser/local cache may be shown only as a clearly marked last snapshot. It is not authoritative shared storage and must not be written back while Google Drive is unavailable.
- While storage is unavailable, history write actions must be disabled: new analysis save, source attach, saved-source rerun, reviewer settings save, verification save, and delete.
- Included-paper Excel dataset verification may render a guarded unavailable state, but export/save actions must remain blocked until shared storage is reconnected.

## 2026-06-23 analysis-ready Excel schema lock

The Primary quantitative included-paper Excel dataset must follow a two-level analysis structure:

- `Study_Level`: one row per paper for article-level characteristics, RoB, publication-bias eligibility, funding, conflict of interest, recruitment, and reviewer verification.
- `Result_Level`: one row per outcome/result/comparison for pain n/N, mean/SD, OR/SMD, subgroup comparison, instrument comparison, asymmetry comparison, and effect-size inputs.
- `Risk_PubBias`: one row per paper because RoB and publication-bias eligibility are paper-level judgements and must not be duplicated as if they were independent result rows.
- `Parameter_Codebook`: numeric definitions for categorical variables. These definitions must travel with the workbook so R/meta-analysis scripts can decode categories reproducibly.
- `Dataset`: legacy flat export kept for compatibility only.

Analysis-ready field rules:

- `mean_age` alone is not sufficient for age-based quantitative analysis. Extract `mean_age_sd`, `mean_age_se`, `mean_age_ci_low/high`, or age effect fields such as `mean_age_effect_or/CI/p` when the article reports them. If only mean age is available, keep the value but flag `mean_age_sd_se_ci_or_effect` for manual review.
- `playing_hours` must preserve the original wording and unit, then normalize to `playing_hours_per_week`. Conversion rule: daily x 7, weekly unchanged, monthly x 12/52, yearly / 52. Unclear units stay blank with a conversion note.
- `professional_status` must be coded numerically for analysis: `0=student/trainee`, `1=professional`, `2=mixed`, `9=unclear/not reported`.
- Non-numeric analysis categories must have numeric code fields plus definitions, including instrument, instrument category, asymmetry group, and result parameter codes.
- Default instrument code: violin=0, viola=1, flute=2, oboe=3, cello=4, double bass=5, clarinet=6, bassoon=7, horn/brass=8, piano=9, guitar=10, other=98, mixed/unclear=99.
- Same-paper comparisons should not duplicate study-level rows just to encode a group comparison. Use result-level fields such as `result_id`, `result_group_1_label/code`, `result_group_2_label/code`, `result_parameter_name/code`, `result_outcome_group`, and `result_effect_*`.
- Primary included-paper Excel verification remains restricted to primary quantitative included records. Narrative/support papers and secondary-only evidence do not enter the primary verification dataset.

## 2026-06-23 Excel dataset field-coverage interpretation lock

Primary quantitative included-paper Excel dataset verification uses four field states:

| State | Meaning | Action |
| --- | --- | --- |
| `Evidence-backed` | A value is present and the AI supplied row/field-level source evidence for that exact cell. | Verify the cited page/table/figure/excerpt before final lock. |
| `AI auto-filled` | A value is present, but cell-level source evidence is not attached. | Spot-check important numeric, eligibility, and RoB cells; do not treat as final evidence by label alone. |
| `Manual required` | An unresolved blocker remains for the row: critical descriptive value, at least one outcome n/total pair, RoB overall/evidence location, eligible publication-bias input, missing critical field, or validation issue. | Resolve before marking the row verified. |
| `Blank` | No value is stored and the field is not currently blocking this primary row. | Leave blank when truly not reported/not applicable, or fill `NR`/notes when checked. |

Manual-required reduction rule:

- A row marked verified by the extractor is treated as having no unresolved manual-required blockers.
- `risk_of_bias_tool` can be defaulted to the locked JBI prevalence tool for this primary dataset.
- `rob_overall_judgement` and `rob_jbi_overall_risk` are equivalent for blocker detection; one can populate the other.
- `rob_supporting_quote`, `rob_page_table`, `rob_jbi_notes`, or populated JBI Q1-Q9 fields can satisfy the RoB evidence-location requirement.
- Publication-bias standard error is required only when `publication_bias_eligible_for_funnel` is explicitly yes/eligible. It should not create a manual blocker for every individual paper before the outcome group has enough studies.
- AI-reported `missingCriticalFields` are rechecked against the current edited row so flags disappear after the extractor fills the value.
- Saving `Save verified Excel data` must not change quantitative inclusion. It may update extraction rows, verified status, and field flags only. If included-record count decreases after an extraction save, treat it as a data-integrity error and inspect reviewer/PI decisions or project scope before continuing.
- Extraction-row saves must merge by stable row index and preserve existing AI extraction rows so multi-row articles do not collapse to a single row during verification.

## 2026-06-23 JBI prevalence risk-of-bias method lock

Primary RoB method for the Musician PRMD primary quantitative dataset is now fixed as the JBI Critical Appraisal Checklist for Studies Reporting Prevalence Data.

Why this is the primary tool:

- The primary extraction target is denominator-based pain/PRMD prevalence in instrumental musicians, mostly cross-sectional prevalence surveys.
- JBI's critical appraisal tools are intended to assess the trustworthiness, relevance, and results of published papers; the JBI prevalence checklist provides a 9-item prevalence-specific frame.
- Hoy et al.'s prevalence RoB tool remains a relevant sensitivity/reference option, but the app will operationalize JBI prevalence because it maps cleanly to the Excel extraction and reviewer workflow.
- AXIS and JBI Analytical Cross Sectional are retained only for secondary/narrative analytical or risk-factor-only evidence, not as the primary prevalence dataset tool.
- RoB 2 and ROBINS-I are not default tools for this primary prevalence dataset.

Locked JBI prevalence items:

| Item | App field |
| --- | --- |
| Q1 sample frame appropriate | `rob_jbi_q1_sample_frame` |
| Q2 sampling/recruitment appropriate | `rob_jbi_q2_sampling` |
| Q3 sample size adequate | `rob_jbi_q3_sample_size` |
| Q4 subjects/setting described | `rob_jbi_q4_subjects_setting` |
| Q5 sufficient sample coverage | `rob_jbi_q5_sample_coverage` |
| Q6 valid method for identifying pain/PRMD condition | `rob_jbi_q6_condition_identification` |
| Q7 standard/reliable measurement for all participants | `rob_jbi_q7_standard_measurement` |
| Q8 appropriate statistical analysis | `rob_jbi_q8_statistical_analysis` |
| Q9 adequate response rate or response-rate handling | `rob_jbi_q9_response_rate` |

Overall rule:

- `low`: generally at least 7 yes answers and yes for both Q6 and Q7.
- `moderate`: generally 5-6 yes answers, or one critical measurement concern.
- `high`: generally 0-4 yes answers, unresolved denominator/case-definition problems, or no/unclear for both Q6 and Q7.
- `unclear`: full text is insufficient for stable judgement.

Algorithm lock:

1. Use only primary quantitative included records for RoB rerun: PI final `include_quantitative`, or reviewer 1 and reviewer 2 both `include_quantitative` with `agreement`/`resolved` while PI final is pending.
2. Exclude narrative/support, secondary composite-outcome, continuous-outcome-only, and risk-factor-only papers from the primary included-paper Excel dataset.
3. For source-saved quantitative included records, run the three configured AI reviewer models with the JBI RoB rerun guide.
4. For legacy/no-source quantitative included records, require PDF/Word full-text upload and source matching before RoB rerun.
5. Preserve the inclusion decision unless RoB reveals a source-evidence problem that invalidates primary quantitative use; then flag manual verification rather than silently excluding.

Sources used for this lock:

- JBI Critical Appraisal Tools: https://jbi.global/critical-appraisal-tools
- JBI Checklist for Prevalence Studies: https://jbi.global/sites/default/files/2020-08/Checklist_for_Prevalence_Studies.pdf
- JBI Checklist for Analytical Cross Sectional Studies: https://jbi.global/sites/default/files/2020-08/Checklist_for_Analytical_Cross_Sectional_Studies.pdf
- Hoy et al. prevalence RoB tool summary: https://pubmed.ncbi.nlm.nih.gov/22742910/
- AXIS cross-sectional tool: https://bmjopen.bmj.com/content/6/12/e011458

## 2026-06-19 workflow lock

- The program must support the complete meta-analysis path: AI-assisted topic/protocol generation -> search string generation -> database search/RIS import -> PRISMA screening -> full-text acquisition -> AI full-text eligibility/extraction -> two human reviewers plus PI final adjudication -> verified Excel extraction dataset -> R-based meta-analysis/NMA figures and tables -> manuscript discussion.
- The published Hyun lab Acta Biomaterialia NMA paper is the reference model for required outputs: PRISMA flow, descriptive included-study charts, NMA network diagrams, network forest plots, SUCRA/rank plots, pairwise forest plots, study/result tables, risk-of-bias tables, NMA/pairwise summary tables, and final raw extraction workbook.
- R/Rscript support is required for true meta-analysis/NMA graph generation. RStudio GUI is optional; the app should call reproducible R scripts or export analysis-ready data for R.
- Full-text history, source files, reviewer decisions, PI adjudication, and extraction datasets must be scoped by `projectId`; no research topic should share a global full-text or Excel dataset store with another topic.
- The Included-paper Excel dataset is the primary quantitative analysis dataset. Records may enter it when `PI final decision = include_quantitative`, or when PI final is still pending but reviewer 1 and reviewer 2 have an `agreement`/`resolved` quantitative include decision. If PI final is `include_narrative_support` or `exclude`, that PI decision overrides reviewer agreement and the record must not appear in the primary Excel dataset verification table or exported workbook.
- Current public Meta deployment URL is `https://search.wiregene.com`; the app must enter Meta mode on that host.

## 2026-06-23 Musician PRMD protocol/process lock

The current Musician PRMD pain project must not be described as `screening completed`. The accurate status is: AI full-text triage and extraction drafting are completed or nearly completed, but reviewer 1/reviewer 2 adjudication, PI final decision, PRISMA audit lock, and evidence-backed extraction lock are still pending.

Scope and search rules:

- The review title/population should use `Instrumental Musicians`. Orchestral musicians remain eligible and important, but they are a subgroup/source population rather than the full title scope.
- No new PRISMA search is required now if the change is limited to protocol wording, extraction rules, adjudication rules, or AI calibration. A new search is required only if eligibility, population, outcome, or database/search terms materially change.
- Existing search counts must be audit-locked before extraction: PubMed `221`, Embase `343`, Scopus `561`, Web of Science `413`, Cochrane `114`, total `1652`; deduplicated/screening master `259`; abstract text `253`; full-text plan `82`; active Excel PDFs `72`; saved AI-reviewed records currently need `71/72` reconciliation.

Pipeline preservation rules:

- Preserve the AI-only pipeline and the human-reviewed pipeline in parallel. Human corrections must not overwrite the original AI-only snapshot.
- Each AI model draft should retain model/profile traceability: model name, provider/base URL, protocol version, prompt version/hash, extraction schema version/hash, source-file checksum, and analysis schema version.
- The AI-only snapshot can later be compared with human/PI final decisions using sensitivity, specificity, false-exclusion rate, kappa/agreement, McNemar test, time/cost, pooled-estimate change, and conclusion stability.

Eligibility and extraction clarifications:

- Treatment-effect RCTs are excluded from the primary prevalence meta-analysis, but independently extractable baseline epidemiologic denominator/outcome data can be retained as secondary evidence if prespecified.
- The primary Included-paper Excel dataset contains only quantitative-included records: `PI final decision = include_quantitative`, or reviewer 1/2 quantitative agreement while PI final is still pending. PI final narrative/support or exclude always overrides reviewer agreement.
- Narrative/support, secondary composite-outcome, risk-factor-only, continuous-outcome-only, and broad-region supplementary records stay in full-text history but do not enter the primary Excel extraction dataset.

Risk-of-bias lock:

- The primary RoB frame must match prevalence/cross-sectional observational evidence: JBI prevalence checklist, Hoy risk-of-bias tool, AXIS, or JBI analytical cross-sectional checklist.
- RoB 2 and ROBINS-I are not default tools for the primary prevalence dataset. Use them only for a separately prespecified intervention or nonrandomized-intervention question.

Required checkpoints before full Excel extraction:

1. Protocol v1.0 lock: title, population, outcomes, RCT baseline rule.
2. Search/PRISMA audit lock: `1652 -> 259 -> 253 -> 82 -> 72/71`.
3. Resolve the 71/72 saved-record mismatch.
4. Freeze AI-only snapshot for the same corpus.
5. Reviewer 1 and reviewer 2 independent decisions.
6. Conflict resolution.
7. PI final adjudication.
8. Fixed exclusion reason coding.
9. Extraction schema lock.
10. Evidence-backed field validation, starting with a 5-paper quantitative pilot.

## 2026-06-23 Santos 2024 inconsistent-denominator risk-factor calibration rule

Santos et al. 2024, `Odds ratio of occurrence of pain, postural changes, and disabilities of violinists`, is a calibration example for small cross-sectional risk-factor papers where a binary pain outcome and posture-related odds ratios are reported, but the underlying denominator, pain/no-pain coding, and model reporting are too inconsistent for pooling.

Locked adjudication for this calibration case:

| Item | Rule |
| --- | --- |
| Final screening classification | Narrative/risk-factor support only |
| Primary anatomical-region/laterality meta-analysis | Exclude |
| Overall pain-prevalence pooling | Exclude |
| Narrative risk-factor synthesis | Limited include as exploratory evidence |
| Study class | Cross-sectional convenience sample |
| Instrument group | Violin |
| Population | College students and professionals mixed |
| Official analyzed sample | 38 |
| Conflicting denominator | Pain figure, k-means analysis, figure explanation, and confusion matrix use 39 observations |
| Pain numerator/denominator | NR; internally inconsistent |
| Recall period | Not reported |
| Playing-related attribution | Unclear |
| Strict PRMD definition | No |
| Anatomical-site prevalence | Not extractable |
| Laterality-specific prevalence | Not extractable |
| VAS/DASH | Narrative only; denominator/SD or extractable summary is insufficient |
| Reported ORs | Narrative only; do not pool without CI/SE and stable model definition |

AI performance rule derived from this case:

- If official sample size conflicts with pain figures, cluster/confusion matrices, or regression denominators, the AI must not choose among `26/38`, `26/39`, `13/38`, or `13/39`. Code prevalence numerator/denominator as `NR` or `internally inconsistent`.
- If pain/no-pain category direction is contradictory across figures, model tables, or text, do not use the article for overall pain-prevalence pooling.
- Absence of a fixed recall period and explicit playing-related pain case definition blocks primary prevalence synthesis, even if the sample is instrument-specific.
- Posture/practice odds ratios from a very small cross-sectional model must not be pooled when confidence intervals, standard errors, exact p values, or stable variable-selection rules are absent.
- VAS and DASH values can be narrative-only when SD, denominator, group definition, or extractable summary statistics are missing.

## 2026-06-22 Screening AI score interpretation lock

Screening page AI numbers are triage and extraction-quality signals. They are not final study-selection authority. Reviewer 1, Reviewer 2, and PI adjudication remain the final decision path.

Canonical scales from Ver 2.31 onward:

| Field | Scale | Meaning | Do not use for |
| --- | --- | --- | --- |
| `Confidence` | 0-100 | AI confidence in the eligibility decision shown at the top, such as quantitative candidate, narrative/support, exclude, or uncertain. | It does not measure extraction completeness or numeric reliability by itself. |
| `Score` | 0-100 | Quality score for the AI full-text screening/extraction output: protocol fit, extracted fields, source evidence, numeric consistency, actionability, and visible risk. | It does not override the actual eligibility decision. |
| `Grade` | `high`, `moderate`, `low`, `unsafe` | Categorical quality label for the same AI output. | It is not a GRADE certainty-of-evidence rating for the meta-analysis result. |

Scale normalization rule:

- AI models sometimes return confidence as 0-1, such as `0.96` or `1`, or score as 1-5, such as `4/5`.
- The app must normalize these to 0-100 before display/storage when possible: `0.96 -> 96`, `1 -> 100`, `4/5 -> 80`.
- Legacy records should be interpreted with this normalization rule during review.

Grade thresholds:

| Grade | Score range | Operational meaning |
| --- | --- | --- |
| `high` | 85-100 | AI output is strongly usable as a reviewer draft; remaining work is verification, not rescue. |
| `moderate` | 65-84 | Usable draft, but some fields or evidence still need manual confirmation. |
| `low` | 40-64 | Major manual checking is required; do not finalize include/exclude from AI alone. |
| `unsafe` | 0-39 | Failed/fallback/unusable; treat as human-review only. |

Selection rules:

| Situation | Minimum condition | Action |
| --- | --- | --- |
| Quantitative include candidate | `decision=include_quantitative`, `confidence>=80`, `score>=65`, `grade=high/moderate`, explicit denominator/numerator or prevalence, numeric `fieldEvidence`, and no material AI-model conflict | Reviewer 1/2 may select quantitative include after checking source table/figure/supplement. PI still finalizes. |
| Narrative/support candidate | Topic/protocol fit is clear but n/total, effect size, or cell-level numeric evidence is incomplete | Mark narrative/support or keep for background/discussion; do not put into quantitative meta-analysis dataset. |
| Exclude | `decision=exclude`, `confidence>=80`, and at least one fixed exclusion reason is clearly supported by the full text | Reviewer may exclude after confirming the cited reason. |
| Pending/manual verification | `confidence<70`, `score<65`, `grade=low/unsafe`, missing critical fields, no numeric source evidence, OCR/table limitation, non-English uncertainty, or AI reviewer disagreement | Keep as pending/conflict. Human reviewer must inspect the full text before include/exclude. |
| AI model disagreement | Valid model drafts disagree on include/exclude or on quantitative extractability | Do not resolve by average score. Escalate to reviewer discussion or PI adjudication. |

Practical rule for the screenshot-type case: a result that displays old-scale `confidence 1` and `score 4` must not be interpreted literally as 1/100 and 4/100. It should be normalized as approximately `confidence 100` and `score 80` only if the stored AI draft clearly used 0-1 and 1-5 scales. After Ver 2.31 the app should store the normalized 0-100 values.

## 2026-06-22 Zuhdi 2020 calibration rule

The Zuhdi et al. 2020 classical-guitar paper is a calibration example for AI full-text screening. The correct interpretation is not "uncertain because body-site n values need to be checked"; the paper should be treated as an instrument-specific observational quantitative extraction candidate when Table 5 is available.

Locked adjudication for this calibration case:

| Item | Rule |
| --- | --- |
| Final screening direction | Include - quantitative extraction candidate after human source check |
| Study class | Instrument-specific observational study |
| Core orchestral comparative | No |
| Instrument/asymmetry mapping | Keep `asymmetry_group=unclassified/other` unless a future protocol defines a guitar class |
| Outcome definition | 12-month classical guitar-related musculoskeletal pain, not strict performance-limiting PRMD |
| Quantitative source | Table 5 site- and laterality-specific pain counts/percentages with denominator n=190 |
| Reported-site handling | Extract reported top-prevalence sites only; unreported contralateral or lower-prevalence sites are `NR`, never 0 |
| Overall prevalence issue | Flag `168/190` vs `88.9%` as a numerator-percentage discrepancy; do not use both as a final confirmed value |
| Site-specific rows | If each site n/190 percentage is internally consistent, use those rows even when the overall prevalence line has a discrepancy |

AI performance rule derived from this case:

- If a full-text article is an original observational instrument-specific study and a table/appendix reports site-specific or laterality-specific pain counts with a common denominator, the AI should keep the article as `include_quantitative` and treat missing extracted cells as an extraction-completeness problem, not an eligibility failure.
- Not being a core orchestral comparative study must not downgrade an otherwise eligible instrument-specific quantitative article.
- The AI must actively search for table labels, appendix references, body-site names, left/right terms, and common denominator statements before concluding that n/total values are unavailable.

## 2026-06-22 Nyman 2007 composite-outcome calibration rule

Nyman et al. 2007, `Work Postures and Neck-Shoulder Pain Among Orchestra Musicians`, is a calibration example for the opposite failure mode: the article is highly relevant and has reconstructable quantitative data, but the outcome cannot be mapped into the primary region- and laterality-specific meta-analysis.

Locked adjudication for this calibration case:

| Item | Rule |
| --- | --- |
| Primary quantitative meta-analysis | Exclude |
| Narrative or secondary synthesis | Include |
| Study class | Cross-sectional professional orchestra musician study |
| Useful exposure data | Four posture/playing-time groups; the elevated-arm >3 h/day group is pooled violin/viola |
| Quantitative source | Table II percentages can reconstruct cases: 5/54, 8/42, 11/37, 36/102, and total 60/235 |
| Core exclusion reason | Outcome is a current composite neck-shoulder complaint: neck, shoulder, or between-shoulder-blades pain combined |
| Laterality issue | No left/right shoulder or side-specific estimates |
| Instrument pooling issue | Violin and viola are pooled in the high-exposure group and must not be split |
| Exposure interpretation | Groups combine arm elevation/posture and estimated playing time; do not treat the contrast as a pure asymmetry effect |
| Outcome definition | Present composite pain, not strict playing-related PRMD |

AI performance rule derived from this case:

- Numeric extractability alone is not sufficient for `include_quantitative`. The outcome must map to the protocol's primary body-region and laterality rows.
- If the only available outcome is a composite such as neck-shoulder complaint, neck/shoulder/interscapular pain combined, or any-region upper-body pain without separate anatomical or left/right estimates, the article should be excluded from the primary quantitative region/laterality meta-analysis.
- If the article is otherwise relevant, keep it as `include_narrative_support` or as a secondary composite-outcome source, and record the exact composite outcome and exposure-group definitions.
- Reconstructed n values from percentages can be retained as secondary evidence when they reproduce the article's reported ORs, but they must not be converted into neck pain, shoulder pain, left shoulder pain, or right shoulder pain rows.

## 2026-06-22 Piatkowska 2016 symptomatic-cohort calibration rule

Piatkowska et al. 2016, `Cervical Pain in Young Professional Musicians - Quality of Life`, is a calibration example for studies with continuous symptom/disability outcomes in participants already selected for pain. These studies can look quantitative, but they do not provide valid prevalence numerator/denominator pairs for the primary meta-analysis.

Locked adjudication for this calibration case:

| Item | Rule |
| --- | --- |
| Primary prevalence meta-analysis | Exclude |
| Narrative or secondary synthesis | Limited include |
| Study class | Repeated-measures symptomatic observational cohort |
| Actual population | Music college students, not professional musicians despite the title wording |
| Instrument groups | Violin 15, cello 15, piano 15 final completers |
| Prevalence n/N | Not extractable; do not code 45/45 as cervical pain prevalence |
| Why 45/45 is invalid | Cervical pain was an inclusion criterion, not an outcome observed in an at-risk population |
| Quantitative source | Table 3 VAS, NDI, and SF-36 continuous mean scores by instrument/time point |
| Attrition issue | Flow 80 assessed -> 60 eligible -> 50 second-stage -> 45 final; 15/60 eligible participants dropped out, with possible outcome-related reasons |
| Outcome definition | Cervical pain, not explicitly playing-related PRMD |
| Reporting issue | Abstract `moderate` disability statement conflicts with NDI table/body text indicating mild/slight disability |

AI performance rule derived from this case:

- If participants are recruited because they already have pain, disability, or symptoms, the AI must not convert final completers into prevalence cases.
- Continuous VAS/NDI/SF-36 or quality-of-life means are not denominator-based pain prevalence data. They can support narrative synthesis or a separately prespecified continuous-outcome analysis only.
- The AI must distinguish actual recruited population from title language; music students should be coded as students/trainees even when a title says professional musicians.
- Attrition, unclear instrument-specific dropouts, and stage-specific sample-size uncertainty should be flagged as risk/limitations, not silently ignored.

## 2026-06-22 Brusky 2010 graph-reconstructed broad-region calibration rule

Brusky 2010, `The High Prevalence of Injury Among Female Bassoonists`, is a calibration example for studies where some subgroup n/N values can be reconstructed, but the outcome/timeframe/body-site structure is incompatible with the primary site- and laterality-specific prevalence meta-analysis.

Locked adjudication for this calibration case:

| Item | Rule |
| --- | --- |
| Final screening classification | Narrative/support candidate |
| Primary site/laterality meta-analysis | Exclude |
| Supplementary quantitative synthesis | Limited include for sex-stratified broad-region PRMD evidence |
| Study class | Nonprobability online cross-sectional survey |
| Instrument group | Bassoon single-instrument sample |
| Analyzed sample | Total 166: male 96, female 70 |
| Primary exclusion reason | Broad composite body regions, absent laterality n/N, and unclear recall period |
| Body-region issue | `Head or neck`, `Back, chest, or shoulders`, `Arms or wrists`, and `Legs or hips` must not be split into standard site rows |
| Supplementary extraction | Figure 1 sex-stratified broad-region counts may be reconstructed and kept as secondary evidence when internally checked |
| Missingness issue | Male body-location missingness differs from symptom/diagnosis reporting and may bias sex-specific location results |
| Overall prevalence issue | Overall 88% PRMD is not fully reconcilable with sex-specific estimates; do not use as a confirmed n/N without caveat |
| Cohort overlap issue | Check possible overlap or secondary analysis relationship with Brusky 2009 before pooling |

AI performance rule derived from this case:

- Quantitative reconstruction from a figure does not by itself justify primary inclusion.
- Broad `or`-joined body regions must not be split into standard anatomical outcomes, and missing laterality n/N prevents laterality-specific extraction.
- Unclear recall period or mixed case definitions such as diagnosed injury, self-reported PRMD symptom, and PRMD location should block pooling with point, 7-day, 12-month, or lifetime pain prevalence.
- Differential subgroup missingness and possible duplicate/overlapping cohorts must be surfaced as review risks.

## 2026-06-22 Yoshimura 2006 overall-pain risk-factor calibration rule

Yoshimura et al. 2006, `Risk Factors for Piano-related Pain among College Students`, is a calibration example for cross-sectional risk-factor studies that report overall piano-related pain but do not report site- or laterality-specific prevalence.

Locked adjudication for this calibration case:

| Item | Rule |
| --- | --- |
| Final screening classification | Narrative/support candidate |
| Primary anatomical-region/laterality meta-analysis | Exclude |
| Supplementary overall-pain synthesis | Limited include if prespecified |
| Narrative risk-factor synthesis | Include as exploratory evidence |
| Study class | Cross-sectional correlation/risk-factor study |
| Population | One university's college piano performance majors |
| Instrument group | Piano |
| Analyzed sample | 35 students |
| Pain preselection | No |
| Recall period | Not reported |
| Main overall pain value | 86% of 35, reconstructable as 30/35 pain while playing |
| Separate body-map value | 32/35 marked at least one pain site |
| Outcome separation | 30/35 and 32/35 are separate outcomes and must not be merged |
| Primary exclusion reason | No anatomical site-specific or laterality-specific n/N |
| Strict PRMD issue | Pain while playing is not the same as interference-based PRMD; performance impact was measured separately |
| Risk-factor interpretation | Small convenience sample and multiple correlation/regression tests; treat findings as hypothesis-generating |

AI performance rule derived from this case:

- Overall pain while playing can be recorded as supplementary evidence, but it is not a primary site/laterality prevalence row.
- If body maps were collected but only the number of marked pain sites is reported, the AI must not infer hand, wrist, forearm, shoulder, neck, trunk, left, or right counts.
- Distinct overall outcomes such as pain while playing and at least one pain site marked must remain separate.
- VAS/frequency/severity means and percent of performance affected are continuous or ordinal outcomes unless a binary case threshold is explicitly defined.

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
