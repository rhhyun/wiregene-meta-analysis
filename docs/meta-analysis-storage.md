# Meta-analysis Repository Storage

## Recommendation

Use Google Drive as the primary active repository and Synology as a scheduled
backup/archive mirror.

## Why Google Drive should be primary

- The platform already supports Google Drive JSON storage.
- Study teams can share protocol, extraction sheets, figures, and manuscript
  files without separate VPN/NAS setup.
- Google Drive works naturally with Google Docs/Sheets-based collaboration.
- It is easier to connect project files to Zotero and manuscript workflows.

## Why Synology should remain a mirror

- It is better for long-term retention and large raw exports.
- It reduces risk if Drive files are moved, deleted, or permission-restricted.
- It can preserve versioned archives after major milestones such as search
  completion, full-text screening, data lock, analysis lock, and submission.

## Suggested Drive structure

```text
Research Briefing Platform/
  Meta-analysis/
    orchestra_prmd_asymmetry/
      00_protocol/
      01_search/
      02_screening/
      03_extraction/
      04_risk_of_bias/
      05_analysis/
      06_figures_tables/
      07_manuscript/
      99_archive/
```

## Suggested storage rule

- Active work: Google Drive.
- Weekly or milestone backup: Synology.
- References: Zotero collections.
- Final reproducible scripts and templates: GitHub repository.

## Multi-database source intake

PubMed systematic-review searches should run directly on NCBI PubMed so that
PubMed field tags, phrase handling, Search Details, and result counts remain
reproducible. Wiregene should store the exact query, search log, exported files,
and imported records. Other bibliographic databases should enter the same
PRISMA pipeline through one of two reproducible intake routes:

- API harvest when an institutional key is available.
- Export/import when the database requires manual execution or institutional
  web access.

The platform should keep the search strategy and the intake result together:

```text
database -> search date -> exact query -> API/export file -> normalized records
         -> deduplication -> title/abstract screening -> full-text screening
         -> PRISMA 2020 counts
```

Recommended source handling:

- PubMed: NCBI PubMed direct search, then NBIB/RIS import when needed.
- Scopus: Elsevier API key if available, otherwise CSV/RIS export import.
- Web of Science: Clarivate API key if available, otherwise Excel/RIS export
  import.
- Embase: Elsevier Embase API/OAuth if available, otherwise RIS export import.
- Cochrane/CENTRAL: export references and import the citation file.

Deduplication should use DOI first, PMID or source accession identifiers second,
and normalized title matching last. Search counts, deduplicated counts, screening
decisions, exclusion reasons, and data-lock dates should be stored as PRISMA log
artifacts in `01_search/` and `02_screening/`.
