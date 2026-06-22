export const defaultMetaFullTextResearcherGuidanceLines = [
  "Do not invent values. Use null or an empty string when a value is not explicitly supported.",
  "Eligibility is only a draft for human verification; never present an AI decision as final inclusion.",
  "Prefer quantitative inclusion only when original observational data, instrument/instrument-group data, region-specific pain outcomes, and extractable denominator/numerator or prevalence are present.",
  "Exclude RCTs, treatment/intervention/effect studies, case reports, reviews, conference-only records, non-English full text, wrong population, wrong outcome, and studies without extractable denominator-based pain outcomes.",
  "Extract numbers exactly as reported. If only percent is reported without denominator, put a note instead of fabricating n.",
  "Actively extract study-level characteristics that are usually in title page, abstract, Methods, Table 1, participant/general characteristics tables, affiliations, Results tables, figures, and supplements.",
  "Always look for and fill first_author, year, country, design, sample_size_total, sample_size_analyzed, population_source, professional_status, mean_age, female_percent, playing_hours, years_experience, instrument_group_reported, and specific_instrument when the article reports them.",
  "Derive country from study setting, recruitment site, sample description, or author affiliation only when no explicit study country is reported; note the source in fieldEvidence.",
  "Search tables/figures for instrument-specific denominators, body-region pain counts/percentages, recall window, and PRMD/pain definitions before marking these cells missing.",
  "For every non-empty extracted numeric cell, provide cell-level evidence with field name, value, short exact excerpt, and page/table/figure/supplement hint when available.",
  "For every non-empty key descriptive cell, especially first_author, country, sample_size_total, mean_age, female_percent, instrument_group_reported, and specific_instrument, provide fieldEvidence when the text/table/affiliation supports it.",
  "Do not fill instrument group or asymmetry mapping from background-only mentions; use actual sample/group information only.",
  "Never infer left/right laterality from instrument playing side. Fill left/right cells only when the article explicitly reports left/right outcomes.",
  "If an article is treatment/intervention/RCT/effect-focused, do not mark it quantitative unless independent baseline observational prevalence with explicit denominator/numerator is clearly extractable.",
  "If a numeric cell lacks source evidence, leave the cell empty or mark it needs review instead of fabricating a value.",
  "Instrument-specific observational studies are eligible for quantitative inclusion even when they are not core orchestral comparative studies, if instrument-specific site/laterality pain counts with denominators are extractable.",
  "When a table reports site-specific or laterality-specific pain counts and percentages with a common denominator, extract the n/total pairs from the table. Do not downgrade eligibility merely because the article reports only the highest-prevalence sites; code unreported sites as NR, not 0.",
  "If an overall prevalence numerator and percentage disagree internally, flag a numerator-percentage discrepancy in notes_on_extractability and validationIssues, but do not discard internally consistent site-specific table rows.",
  "For classical guitar studies, keep asymmetry_group as unclassified/other unless a protocol-approved guitar asymmetry class exists. Do not assign a high/moderate/low asymmetry group by intuition.",
  "Distinguish playing-related musculoskeletal pain over a recall period from strict PRMD definitions requiring performance limitation; record the actual outcome definition.",
  "Calibration example: If the article is Zuhdi et al. 2020 Occupational Health Problems of Classical Guitarists, Table 5 reports site- and laterality-specific 12-month pain counts with denominator n=190. Treat it as include_quantitative for instrument-specific observational extraction, flag the overall 168/190 vs 88.9% inconsistency, keep unreported sites as NR, and keep guitar asymmetry_group as unclassified/other. Do not transfer these exact values to other papers.",
  "If the only quantitative pain outcome is a composite anatomical outcome such as neck-shoulder complaint, neck/shoulder/interscapular pain combined, or any-region upper-body pain, and the article does not report separate region-specific and laterality-specific estimates, do not classify it as primary include_quantitative for the region/laterality meta-analysis.",
  "For composite-outcome papers that are otherwise protocol-relevant, use include_narrative_support or record primary-analysis exclusion with secondary/narrative inclusion. Extract reconstructable group n/total values as secondary evidence only, not as primary region/laterality rows.",
  "When exposure groups combine instrument, arm elevation, posture, and playing time, preserve the exact reported group labels. Do not reinterpret them as a pure asymmetry effect and do not split pooled violin/viola or other pooled instruments unless the article reports separate values.",
  "Calibration example: If the article is Nyman et al. 2007 Work Postures and Neck-Shoulder Pain Among Orchestra Musicians, Table II percentages can reconstruct neck-shoulder complaint cases by posture/playing-time group, but the outcome is current composite neck, shoulder, or interscapular pain with no separate anatomical or left/right estimates. Treat primary region/laterality meta-analysis as excluded and retain for narrative or secondary composite-outcome synthesis. Do not transfer these exact values to other papers.",
  "For risk-of-bias fields, extract only article-supported facts needed for observational-study RoB judgment: sampling/recruitment, measurement/outcome definition, confounding/adjustment, missing data, selective reporting, response rate, funding, and conflict-of-interest statements.",
  "For publication-bias fields, collect only study-level inputs that later funnel/small-study-effect checks need: outcome group, effect size/prevalence input, standard error or data needed to compute it, and whether the row is eligible for funnel/small-study assessment. Do not claim publication bias from a single article.",
  "Use rob_supporting_quote and rob_page_table for short evidence excerpts or page/table/supplement hints. If the full text lacks evidence, leave the field empty and list it in manual_required_fields.",
  "Keep evidence excerpts short.",
  "Use eligibility.confidence as a 0-100 percentage, not a 0-1 probability. Return 96 for 96% confidence; do not return 0.96.",
  "Use reviewEvaluation.score and criterion scores as 0-100 quality scores, not 1-5 scores. Convert 4/5 to 80 before returning JSON.",
  "Grade mapping is high=85-100 with no major unresolved issue, moderate=65-84 or usable with limited missing fields, low=40-64 or major manual checks needed, unsafe=0-39/fallback/failed/not usable.",
  "Select quantitative inclusion only when decision is include_quantitative, confidence is at least 80, score is at least 65, grade is high or moderate, denominator/numerator or prevalence is extractable, numeric fieldEvidence is present, and the outcome maps to the protocol's primary region/laterality rows.",
  "Use include_narrative_support when the article is relevant but quantitative n/total or effect-size extraction is incomplete, or when numeric data exist but the outcome/grouping is incompatible with the primary region/laterality meta-analysis.",
  "Accept exclusion only when confidence is at least 80 and a fixed exclusion reason is clearly supported by the full text.",
  "Use uncertain/human verification when confidence is below 70, score is below 65, grade is low/unsafe, model drafts disagree, critical fields are missing, or numeric source evidence is absent.",
  "Also evaluate the quality of your own screening/extraction using the reviewEvaluation criteria below.",
  "Return only one JSON object.",
];

export const defaultMetaFullTextResearcherGuidance = defaultMetaFullTextResearcherGuidanceLines
  .map((line) => `- ${line}`)
  .join("\n");

export function normalizeMetaFullTextResearcherGuidance(value: string | null | undefined) {
  const normalized = (value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
  return (normalized || defaultMetaFullTextResearcherGuidance).slice(0, 12_000);
}
