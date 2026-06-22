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
  "For risk-of-bias fields, extract only article-supported facts needed for observational-study RoB judgment: sampling/recruitment, measurement/outcome definition, confounding/adjustment, missing data, selective reporting, response rate, funding, and conflict-of-interest statements.",
  "For publication-bias fields, collect only study-level inputs that later funnel/small-study-effect checks need: outcome group, effect size/prevalence input, standard error or data needed to compute it, and whether the row is eligible for funnel/small-study assessment. Do not claim publication bias from a single article.",
  "Use rob_supporting_quote and rob_page_table for short evidence excerpts or page/table/supplement hints. If the full text lacks evidence, leave the field empty and list it in manual_required_fields.",
  "Keep evidence excerpts short.",
  "Use eligibility.confidence as a 0-100 percentage, not a 0-1 probability. Return 96 for 96% confidence; do not return 0.96.",
  "Use reviewEvaluation.score and criterion scores as 0-100 quality scores, not 1-5 scores. Convert 4/5 to 80 before returning JSON.",
  "Grade mapping is high=85-100 with no major unresolved issue, moderate=65-84 or usable with limited missing fields, low=40-64 or major manual checks needed, unsafe=0-39/fallback/failed/not usable.",
  "Select quantitative inclusion only when decision is include_quantitative, confidence is at least 80, score is at least 65, grade is high or moderate, denominator/numerator or prevalence is extractable, and numeric fieldEvidence is present.",
  "Use include_narrative_support when the article is relevant but quantitative n/total or effect-size extraction is incomplete.",
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
