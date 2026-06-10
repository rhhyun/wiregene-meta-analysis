import crypto from "crypto";
import Parser from "rss-parser";
import { stripTags } from "./format";
import { isGrantOpportunityExcluded, listGrantExclusions } from "./grant-exclusions";
import { analyzeGrantRfpUpload, fetchGrantRfpDocument } from "./rfp-analysis";
import type {
  GrantDocumentLink,
  GrantEntityType,
  GrantOpportunity,
  GrantOpportunityRfpPreview,
  GrantSearchResponse,
  GrantSearchSource,
  GrantSourceGroup,
  GrantRfpUploadAnalysis,
} from "./types";

type GrantSearchOptions = {
  topics?: string[];
  extraKeywords?: string[];
  institutionTypes?: GrantEntityType[];
  includeExternalSources?: boolean;
  limit?: number;
  sourceGroup?: GrantSourceGroup;
};

type IrisAnnouncement = {
  ancmId?: string;
  ancmTl?: string;
  ancmNo?: string;
  ancmDe?: string;
  blngGovdSeNm?: string;
  sorgnNm?: string;
  rcveStrDe?: string;
  rcveEndDe?: string;
  dDay?: number;
  rcveStt?: string;
  rcveSttSeNmLst?: string;
  pbofrTpSeNmLst?: string;
};

type IrisResponse = {
  listBsnsAncmBtinSitu?: IrisAnnouncement[];
  paginationInfo?: {
    totalPageCount?: number;
  };
};

type SearchRssItem = {
  title?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  isoDate?: string;
  contentSnippet?: string;
  content?: string;
};

type OfficialSource = GrantSearchSource & {
  domain: string;
  searchTerms: string[];
  category?: GrantSourceGroup;
};

const parser = new Parser<object, SearchRssItem>();
const irisListUrl = "https://www.iris.go.kr/contents/retrieveBsnsAncmBtinSituList.do";
const irisViewBaseUrl = "https://www.iris.go.kr/contents/retrieveBsnsAncmView.do";

export const defaultGrantTopics = [
  "척수손상 및 신경재활",
  "근감소증, 노쇠, 재활운동",
  "뇌-컴퓨터 인터페이스와 신경인터페이스",
  "재활로봇, 웨어러블 보조기기, 의료기기",
  "의료 AI, 디지털헬스, 병원 데이터 기반 임상연구",
];

export const defaultRegionalRegulatoryTopics = [
  "식약처 의료기기, 디지털치료기기, 임상시험 과제",
  "질병관리청 국립보건연구원 보건의료 연구용역",
  "서울시 재활로봇, 돌봄로봇, 바이오·의료 R&D",
  "경기도 바이오, 의료기기, 기업연구소 R&D",
  "충북 오송 바이오, 의료기기, AI·공공데이터 사업",
];

export const defaultInvestmentTopics = [
  "TIPS 및 민간투자연계 기술창업 R&D",
  "바이오·헬스케어 스타트업 투자 및 액셀러레이션",
  "의료 AI, 디지털헬스, 의료기기 스타트업 지원",
  "Google for Startups, Google Cloud, AI 스타트업 프로그램",
  "AWS Activate, AWS Startups, Amazon 글로벌 액셀러레이터",
];

export const defaultGlobalResearchTopics = [
  "spinal cord injury, traumatic SCI, paralysis recovery",
  "척수손상 신경재생, axon regeneration, neural repair",
  "neuromodulation, spinal cord stimulation, epidural stimulation",
  "neurorehabilitation, functional recovery, chronic SCI",
  "rehabilitation robotics, BCI, brain-spine interface, assistive technology",
];

export const defaultTraineeFellowshipTopics = [
  "석사·박사·석박통합 과정생 연구장려금, 학문후속세대지원",
  "박사과정생 연구장려금, 박사수료생, 전업 대학원생 연구비",
  "박사후국내연수, 박사후연구원, 비전임 연구자 성장형 연구",
  "세종과학펠로우십, 신진연구자, early career researcher",
  "HFSP, EMBO, MSCA, NIH F31/F32/K99 postdoctoral fellowship",
];

const defaultExtraKeywords = [
  "재활",
  "신경재활",
  "의료기기",
  "디지털치료기기",
  "임상시험",
  "병원",
  "의료 AI",
  "보조기기",
  "로봇",
  "고령",
  "근감소증",
  "척수손상",
  "BCI",
  "spinal cord injury",
  "SCI",
  "paralysis",
  "neural repair",
  "neuromodulation",
  "석박통합",
  "대학원생",
  "박사과정생",
  "박사후연구원",
  "postdoctoral fellowship",
];

export const grantSources: OfficialSource[] = [
  {
    name: "IRIS 범부처통합연구지원시스템",
    url: "https://www.iris.go.kr/contents/retrieveBsnsAncmBtinSituListView.do",
    domain: "iris.go.kr",
    role: "범부처 사업공고 통합 1차 수집원",
    searchTerms: ["사업공고", "접수중"],
  },
  {
    name: "한국연구재단",
    url: "https://www.nrf.re.kr",
    domain: "nrf.re.kr",
    role: "기초·원천·국제협력 과제의 핵심 보조 출처",
    searchTerms: ["신규과제", "공모", "접수"],
  },
  {
    name: "범부처전주기의료기기연구개발사업단",
    url: "https://www.kmdf.org",
    domain: "kmdf.org",
    role: "의료기기 R&D 과제 보조 출처",
    searchTerms: ["의료기기", "신규지원", "공고"],
  },
  {
    name: "한국보건산업진흥원",
    url: "https://www.khidi.or.kr",
    domain: "khidi.or.kr",
    role: "보건복지부·질병관리청 보건의료 R&D 보조 출처",
    searchTerms: ["보건의료", "R&D", "공고"],
  },
  {
    name: "한국산업기술기획평가원",
    url: "https://www.keit.re.kr",
    domain: "keit.re.kr",
    role: "산업통상부 산업기술 R&D 보조 출처",
    searchTerms: ["신규지원", "대상과제", "공고"],
  },
  {
    name: "한국산업기술진흥원",
    url: "https://www.kiat.or.kr",
    domain: "kiat.or.kr",
    role: "산업통상부 실증·사업화 과제 보조 출처",
    searchTerms: ["지원사업", "공고", "접수"],
  },
  {
    name: "중소기업기술정보진흥원",
    url: "https://www.tipa.or.kr",
    domain: "tipa.or.kr",
    role: "중소벤처기업부 중소기업 R&D 보조 출처",
    searchTerms: ["중소기업", "기술개발", "공고"],
  },
  {
    name: "정보통신기획평가원",
    url: "https://www.iitp.kr",
    domain: "iitp.kr",
    role: "과기정통부 ICT·AI 과제 보조 출처",
    searchTerms: ["ICT", "AI", "신규지원"],
  },
  {
    name: "과학기술정보통신부",
    url: "https://www.msit.go.kr",
    domain: "msit.go.kr",
    role: "부처 직접 공고 확인",
    searchTerms: ["공고", "연구개발", "접수"],
  },
  {
    name: "보건복지부",
    url: "https://www.mohw.go.kr",
    domain: "mohw.go.kr",
    role: "부처 직접 공고 확인",
    searchTerms: ["보건의료", "연구개발", "공고"],
  },
  {
    name: "산업통상부",
    url: "https://www.motir.go.kr",
    domain: "motir.go.kr",
    role: "부처 직접 공고 확인",
    searchTerms: ["산업기술", "R&D", "공고"],
  },
  {
    name: "중소벤처기업부",
    url: "https://www.mss.go.kr",
    domain: "mss.go.kr",
    role: "부처 직접 공고 확인",
    searchTerms: ["중소기업", "기술개발", "공고"],
  },
  {
    name: "방위사업청",
    url: "https://www.dapa.go.kr",
    domain: "dapa.go.kr",
    role: "국방 R&D 및 방산 과제 보조 출처",
    searchTerms: ["국방", "기술개발", "공고"],
  },
  {
    name: "국방기술품질원",
    url: "https://www.dtaq.re.kr",
    domain: "dtaq.re.kr",
    role: "국방기술 과제 보조 출처",
    searchTerms: ["국방기술", "연구개발", "공고"],
  },
  {
    name: "식품의약품안전처",
    url: "https://www.mfds.go.kr",
    domain: "mfds.go.kr",
    role: "의료기기·디지털헬스·의약품 안전관리 연구개발 공고",
    searchTerms: ["연구개발사업", "신규과제", "의료기기", "디지털치료기기"],
    category: "regional-regulatory",
  },
  {
    name: "질병관리청",
    url: "https://www.kdca.go.kr",
    domain: "kdca.go.kr",
    role: "국립보건연구원 학술연구용역·감염병·만성질환 연구 공고",
    searchTerms: ["학술연구용역", "연구개발사업", "신규과제", "국립보건연구원"],
    category: "regional-regulatory",
  },
  {
    name: "서울R&D지원센터",
    url: "https://rndb.sba.kr/client/index.jsp",
    domain: "rndb.sba.kr",
    role: "서울시 R&D, 기술사업화, 돌봄로봇·바이오·AI 지원사업",
    searchTerms: ["서울", "R&D", "지원사업", "모집중"],
    category: "regional-regulatory",
  },
  {
    name: "서울경제진흥원",
    url: "https://www.sba.seoul.kr",
    domain: "sba.seoul.kr",
    role: "서울시 기업지원·기술사업화·창업지원 공고",
    searchTerms: ["지원사업", "기술사업화", "R&D", "스타트업"],
    category: "regional-regulatory",
  },
  {
    name: "경기도경제과학진흥원",
    url: "https://www.gbsa.or.kr",
    domain: "gbsa.or.kr",
    role: "경기도 R&D, 바이오기업, 기업연구소, 기술사업화 지원사업",
    searchTerms: ["경기도", "R&D", "바이오", "지원사업"],
    category: "regional-regulatory",
  },
  {
    name: "경기도청",
    url: "https://www.gg.go.kr",
    domain: "gg.go.kr",
    role: "경기도 직접 공고 및 지자체 연구·기업지원 사업",
    searchTerms: ["R&D", "기업지원", "공고", "기술개발"],
    category: "regional-regulatory",
  },
  {
    name: "충북과학기술혁신원",
    url: "https://www.cbist.or.kr/home/main.do",
    domain: "cbist.or.kr",
    role: "충북 AI·ICT·바이오·지역선도기업 사업 공고",
    searchTerms: ["충북", "사업공고", "AI", "바이오", "R&D"],
    category: "regional-regulatory",
  },
  {
    name: "충북테크노파크",
    url: "https://www.cbtp.or.kr",
    domain: "cbtp.or.kr",
    role: "충북 바이오·의료기기·제조혁신·기업지원 사업",
    searchTerms: ["충북", "테크노파크", "지원사업", "의료기기"],
    category: "regional-regulatory",
  },
  {
    name: "충청북도",
    url: "https://www.chungbuk.go.kr",
    domain: "chungbuk.go.kr",
    role: "충청북도 직접 공고 및 지역 R&D·창업지원 사업",
    searchTerms: ["충북", "공고", "R&D", "창업", "바이오"],
    category: "regional-regulatory",
  },
  {
    name: "TIPS",
    url: "https://www.jointips.or.kr",
    domain: "jointips.or.kr",
    role: "민간투자주도형 기술창업지원 프로그램",
    searchTerms: ["TIPS", "팁스", "운영사", "창업기업", "투자"],
    category: "investment",
  },
  {
    name: "K-Startup",
    url: "https://www.k-startup.go.kr",
    domain: "k-startup.go.kr",
    role: "창업지원, 팁스 연계, 민간투자연계 사업 공고",
    searchTerms: ["팁스", "민간투자", "창업지원", "사업공고"],
    category: "investment",
  },
  {
    name: "기업마당",
    url: "https://www.bizinfo.go.kr",
    domain: "bizinfo.go.kr",
    role: "중소기업 정책자금, R&D, 투자연계 지원사업 통합 공고",
    searchTerms: ["민간투자연계", "R&D", "지원사업", "스타트업"],
    category: "investment",
  },
  {
    name: "Google for Startups",
    url: "https://startup.google.com/programs/",
    domain: "startup.google.com",
    role: "Google 글로벌 스타트업 프로그램, Cloud/AI 지원",
    searchTerms: ["Google for Startups", "Cloud Program", "AI startup", "funding"],
    category: "investment",
  },
  {
    name: "AWS Startups",
    url: "https://aws.amazon.com/startups/",
    domain: "aws.amazon.com",
    role: "AWS Activate, AWS Startup Accelerator, Amazon 글로벌 스타트업 지원",
    searchTerms: ["AWS Activate", "startup accelerator", "startup credits", "AI startup"],
    category: "investment",
  },
  {
    name: "Amazon",
    url: "https://www.aboutamazon.com",
    domain: "aboutamazon.com",
    role: "Amazon/AWS 액셀러레이터와 투자 프로그램 발표 확인",
    searchTerms: ["startup accelerator", "investment", "AWS", "founders"],
    category: "investment",
  },
  {
    name: "Microsoft for Startups",
    url: "https://www.microsoft.com/startups",
    domain: "microsoft.com",
    role: "글로벌 스타트업 클라우드·AI 지원 프로그램",
    searchTerms: ["Microsoft for Startups", "AI", "startup program"],
    category: "investment",
  },
  {
    name: "NVIDIA Inception",
    url: "https://www.nvidia.com/en-us/startups/",
    domain: "nvidia.com",
    role: "AI·헬스케어 스타트업 글로벌 지원 프로그램",
    searchTerms: ["NVIDIA Inception", "startup", "healthcare AI"],
    category: "investment",
  },
  {
    name: "Wings for Life",
    url: "https://science.wingsforlife.com/en",
    domain: "science.wingsforlife.com",
    role: "spinal cord injury 기본·임상·AI 연구 grant application",
    searchTerms: ["spinal cord injury", "grant application", "project grant", "AI project grant"],
    category: "global-research",
  },
  {
    name: "Spinal Research",
    url: "https://spinal-research.org/home/our-research/the-research-network/apply-for-a-grant/",
    domain: "spinal-research.org",
    role: "UK 기반 SCI repair/restoration 연구 grant 및 international strategy award 확인",
    searchTerms: ["spinal cord injury", "apply for a grant", "strategy award", "special emphasis grant"],
    category: "global-research",
  },
  {
    name: "Craig H. Neilsen Foundation",
    url: "https://chnfoundation.org",
    domain: "chnfoundation.org",
    role: "미국·캐나다 spinal cord injury 연구, 재활, 임상훈련, psychosocial research 지원",
    searchTerms: ["spinal cord injury research", "psychosocial research grants", "clinical training", "funding"],
    category: "global-research",
  },
  {
    name: "Christopher & Dana Reeve Foundation",
    url: "https://www.christopherreeve.org/tomorrows-cure/pre-clinical-research-request-for-applications/",
    domain: "christopherreeve.org",
    role: "paralysis and traumatic SCI translational/pre-clinical research RFA 확인",
    searchTerms: ["spinal cord injury", "research request for applications", "pre-clinical research", "grant"],
    category: "global-research",
  },
  {
    name: "Paralyzed Veterans of America Research Foundation",
    url: "https://pva.org/research-resources/research-foundation/",
    domain: "pva.org",
    role: "SCI/D basic science, clinical, design/development, fellowship grant cycle",
    searchTerms: ["spinal cord injury", "research grant cycle", "clinical applications", "design and development"],
    category: "global-research",
  },
  {
    name: "NIH Grants",
    url: "https://grants.nih.gov/funding/explore-nih-opportunities",
    domain: "grants.nih.gov",
    role: "NIH NOFO와 NINDS/NIBIB/rehabilitation 관련 미국 공공 연구비 탐색",
    searchTerms: ["spinal cord injury", "NOFO", "RFA", "NINDS", "rehabilitation"],
    category: "global-research",
  },
  {
    name: "CDMRP Spinal Cord Injury Research Program",
    url: "https://cdmrp.health.mil/researchprograms.aspx/srp/default",
    domain: "cdmrp.health.mil",
    role: "미국 DoD CDMRP SCIRP funding opportunities 및 pre-application 일정 확인",
    searchTerms: ["SCIRP", "spinal cord injury", "funding opportunities", "pre-application"],
    category: "global-research",
  },
  {
    name: "NIDILRR Model Systems",
    url: "https://acl.gov/programs/research-and-development/model-systems-program",
    domain: "acl.gov",
    role: "Spinal Cord Injury Model Systems, rehabilitation outcomes, multi-site research funding",
    searchTerms: ["spinal cord injury model systems", "NIDILRR", "funding opportunities", "SCI"],
    category: "global-research",
  },
  {
    name: "Horizon Europe Funding",
    url: "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/home",
    domain: "ec.europa.eu",
    role: "EU Horizon Europe health, digital, robotics, rehabilitation, neurotechnology calls",
    searchTerms: ["Horizon Europe", "health", "rehabilitation", "neurotechnology", "funding"],
    category: "global-research",
  },
  {
    name: "Brain Research UK",
    url: "https://www.brainresearchuk.org.uk/research/apply",
    domain: "brainresearchuk.org.uk",
    role: "UK-based acquired brain and spinal cord injury project grants and fellowships",
    searchTerms: ["acquired brain and spinal cord injury", "project grants", "post-doctoral fellowships"],
    category: "global-research",
  },
  {
    name: "Rick Hansen Foundation",
    url: "https://www.rickhansen.com/about-us/2021-23-strategic-plan/investing-care-and-cure-spinal-cord-injury",
    domain: "rickhansen.com",
    role: "캐나다 SCI care and cure research partnership, seed grant 관련 흐름 확인",
    searchTerms: ["spinal cord injury", "seed grant", "research", "care and cure"],
    category: "global-research",
  },
  {
    name: "한국연구재단 학문후속세대지원",
    url: "https://www.nrf.re.kr",
    domain: "nrf.re.kr",
    role: "석사·박사·석박통합 과정생 연구장려금, 박사후국내연수, 세종과학펠로우십 공고 확인",
    searchTerms: ["학문후속세대지원", "석사과정생 연구장려금", "박사과정생 연구장려금", "박사후국내연수"],
    category: "trainee-fellowship",
  },
  {
    name: "IRIS 학문후속세대 공고",
    url: "https://www.iris.go.kr/contents/retrieveBsnsAncmBtinSituListView.do",
    domain: "iris.go.kr",
    role: "연구장려금·박사후연수·펠로우십 접수중 공고 1차 확인",
    searchTerms: ["석사과정생", "박사과정생", "박사후", "펠로우십", "연구장려금"],
    category: "trainee-fellowship",
  },
  {
    name: "BK21 FOUR",
    url: "https://bk21four.nrf.re.kr",
    domain: "bk21four.nrf.re.kr",
    role: "대학원생 연구장학, 교육연구단 참여대학원생 지원 흐름 확인",
    searchTerms: ["대학원생", "연구장학", "참여대학원생", "지원"],
    category: "trainee-fellowship",
  },
  {
    name: "한국장학재단",
    url: "https://www.kosaf.go.kr",
    domain: "kosaf.go.kr",
    role: "대학원생 장학금·이공계 연구생활장려금 등 학생 지원사업 확인",
    searchTerms: ["대학원생", "장학금", "연구생활장려금", "이공계"],
    category: "trainee-fellowship",
  },
  {
    name: "HFSP Postdoctoral Fellowships",
    url: "https://www.hfsp.org/funding/hfsp-funding/postdoctoral-fellowships",
    domain: "hfsp.org",
    role: "국제 이동 기반 생명과학 포닥 펠로십, LOI·Full Proposal 일정 확인",
    searchTerms: ["postdoctoral fellowships", "LOI", "life sciences", "host institution"],
    category: "trainee-fellowship",
  },
  {
    name: "EMBO Postdoctoral Fellowships",
    url: "https://www.embo.org/funding/fellowships-grants-and-career-support/postdoctoral-fellowships/",
    domain: "embo.org",
    role: "국제 이동 포닥 펠로십, publication eligibility, host lab 조건 확인",
    searchTerms: ["postdoctoral fellowships", "international mobility", "eligibility", "cutoff"],
    category: "trainee-fellowship",
  },
  {
    name: "MSCA Postdoctoral Fellowships",
    url: "https://marie-sklodowska-curie-actions.ec.europa.eu/actions/postdoctoral-fellowships",
    domain: "marie-sklodowska-curie-actions.ec.europa.eu",
    role: "EU Horizon Europe 포닥 펠로십, European/Global Fellowship, mobility rule 확인",
    searchTerms: ["postdoctoral fellowships", "MSCA", "mobility", "Horizon Europe"],
    category: "trainee-fellowship",
  },
  {
    name: "NIH Research Training and Career Development",
    url: "https://researchtraining.nih.gov/programs",
    domain: "researchtraining.nih.gov",
    role: "NIH F31/F32/K99 등 graduate student, postdoc, early career training mechanism 확인",
    searchTerms: ["F31", "F32", "K99", "predoctoral", "postdoctoral"],
    category: "trainee-fellowship",
  },
];

export function buildGrantKeywordSet(topics: string[] = [], extraKeywords: string[] = []) {
  const raw = [...topics, ...extraKeywords, ...defaultExtraKeywords];
  const expanded = new Set<string>();

  for (const value of raw) {
    const term = value.trim();
    if (!term) continue;
    expanded.add(term);
    const lower = term.toLowerCase();

    if (/(척수|spinal|sci)/i.test(lower)) {
      [
        "척수손상",
        "척수 재생",
        "신경재생",
        "마비 회복",
        "전기자극",
        "neuromodulation",
        "spinal cord injury",
        "traumatic SCI",
        "paralysis",
        "axon regeneration",
        "neural repair",
        "functional recovery",
        "chronic SCI",
        "spinal cord stimulation",
        "epidural stimulation",
      ].forEach((item) => expanded.add(item));
    }
    if (/(근감소|sarcopenia|frailty|노쇠)/i.test(lower)) {
      ["근감소증", "노쇠", "운동중재", "고령친화", "근기능", "디지털헬스"].forEach((item) =>
        expanded.add(item),
      );
    }
    if (/(bci|brain|인터페이스|뇌)/i.test(lower)) {
      ["BCI", "뇌-컴퓨터 인터페이스", "신경인터페이스", "신경보철", "뇌신호", "재활로봇"].forEach((item) =>
        expanded.add(item),
      );
    }
    if (/(재활|rehab|robot|로봇|wearable|웨어러블)/i.test(lower)) {
      ["재활", "신경재활", "재활로봇", "웨어러블", "보조기기", "보행", "상지기능"].forEach((item) =>
        expanded.add(item),
      );
    }
    if (/(ai|인공지능|digital|디지털|데이터)/i.test(lower)) {
      ["의료 AI", "디지털헬스", "디지털치료기기", "임상데이터", "CDSS", "병원 데이터"].forEach((item) =>
        expanded.add(item),
      );
    }
    if (/(의료기기|medical device|기기)/i.test(lower)) {
      ["의료기기", "인허가", "식약처", "실증", "제품화", "사용적합성"].forEach((item) =>
        expanded.add(item),
      );
    }
    if (/(대학원|석사|박사|석박|postdoc|postdoctoral|fellow|fellowship|predoc|trainee)/i.test(lower)) {
      [
        "대학원생",
        "석사과정생",
        "박사과정생",
        "석박통합",
        "박사수료생",
        "전업 학생",
        "학문후속세대",
        "연구장려금",
        "박사후국내연수",
        "박사후연구원",
        "포닥",
        "postdoc",
        "postdoctoral fellowship",
        "predoctoral fellowship",
        "early career",
        "career development",
      ].forEach((item) => expanded.add(item));
    }
  }

  return [...expanded].slice(0, 80);
}

export function grantSourceSummaries(sourceGroup: GrantSourceGroup = "central"): GrantSearchSource[] {
  return grantSources
    .filter((source) => sourceMatchesGroup(source, sourceGroup))
    .map(({ name, url, role }) => ({ name, url, role }));
}

export async function searchGovernmentGrants(
  options: GrantSearchOptions = {},
): Promise<GrantSearchResponse> {
  const sourceGroup = options.sourceGroup ?? "central";
  const topics = normalizeList(options.topics).slice(0, 8);
  const activeTopics = topics.length ? topics : defaultTopicsForGroup(sourceGroup);
  const extraKeywords = normalizeList(options.extraKeywords);
  const expandedKeywords = buildGrantKeywordSet(activeTopics, extraKeywords);
  const institutionTypes = options.institutionTypes?.length
    ? options.institutionTypes
    : (["school", "hospital", "company", "graduate", "postdoc"] satisfies GrantEntityType[]);
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 80);
  const warnings: string[] = [];

  const irisItems = sourceGroup === "investment" || sourceGroup === "global-research"
    ? []
    : await fetchIrisOpenAnnouncements(warnings);
  const irisOpportunities = filterIrisBySourceGroup(
    await enrichIrisOpportunities(irisItems, activeTopics, expandedKeywords),
    sourceGroup,
  );
  const externalOpportunities =
    options.includeExternalSources === false
      ? []
      : await fetchExternalOfficialCandidates(activeTopics, expandedKeywords, warnings, sourceGroup);
  const exclusions = await listGrantExclusions();

  const ranked = dedupeOpportunities([...irisOpportunities, ...externalOpportunities])
    .filter((item) => item.eligibleEntities.some((entity) => institutionTypes.includes(entity)))
    .filter((item) => !isGrantOpportunityExcluded(item, exclusions, sourceGroup))
    .sort(orderGrantOpportunities)
    .slice(0, limit);
  const opportunities = await attachRfpPreviews(ranked, activeTopics, expandedKeywords, warnings);

  return {
    searchedAt: new Date().toISOString(),
    topics: activeTopics,
    expandedKeywords,
    entitySummary: summarizeEntities(opportunities),
    sources: grantSourceSummaries(sourceGroup),
    opportunities,
    warnings,
  };
}

function rfpPreviewLimit() {
  const raw = (process.env.GRANT_SEARCH_RFP_PREVIEW_LIMIT ?? "4").trim().toLowerCase();
  if (["0", "false", "off", "none"].includes(raw)) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 0), 8) : 4;
}

function canAttemptRfpPreview(item: GrantOpportunity) {
  if (item.id.startsWith("source:")) return false;
  if (!/^https?:\/\//i.test(item.url)) return false;
  return item.status === "open" || item.relevanceScore >= 0.12 || item.source === "IRIS";
}

async function attachRfpPreviews(
  opportunities: GrantOpportunity[],
  topics: string[],
  expandedKeywords: string[],
  warnings: string[],
) {
  const limit = rfpPreviewLimit();
  if (limit <= 0) return opportunities;

  const targets = opportunities.filter(canAttemptRfpPreview).slice(0, limit);
  if (targets.length === 0) return opportunities;

  const settled = await Promise.allSettled(
    targets.map(async (opportunity) => ({
      id: opportunity.id,
      preview: await buildOpportunityRfpPreview(opportunity, topics, expandedKeywords),
    })),
  );
  const previews = new Map<string, GrantOpportunityRfpPreview>();
  const errors = new Map<string, string>();

  settled.forEach((result, index) => {
    const target = targets[index];
    if (result.status === "fulfilled") {
      previews.set(result.value.id, result.value.preview);
      return;
    }

    const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
    errors.set(target.id, message);
  });

  if (errors.size > 0) {
    warnings.push(`상위 ${targets.length}개 과제 중 ${errors.size}개는 RFP/공고문 자동요약에 실패했습니다. 해당 과제는 후보 등록 후 RFP 파일을 직접 업로드해 확인하세요.`);
  }

  return opportunities.map((item) => ({
    ...item,
    rfpPreview: previews.get(item.id) ?? item.rfpPreview ?? null,
    rfpPreviewError: errors.get(item.id) ?? item.rfpPreviewError ?? null,
  }));
}

async function buildOpportunityRfpPreview(
  opportunity: GrantOpportunity,
  topics: string[],
  expandedKeywords: string[],
): Promise<GrantOpportunityRfpPreview> {
  const downloaded = await fetchGrantRfpDocument(opportunity.url);
  const analysis = await analyzeGrantRfpUpload({
    ...downloaded,
    documentUrl: downloaded.documentUrl ?? opportunity.url,
    contextText: [opportunity.title, opportunity.excerpt].filter(Boolean).join("\n\n"),
    topics: [...topics, ...opportunity.topicMatches],
    extraKeywords: [...expandedKeywords, ...opportunity.expandedKeywords],
    useAi: false,
  });

  return rfpAnalysisToPreview(analysis, opportunity, downloaded.documentLinks ?? []);
}

function rfpAnalysisToPreview(
  analysis: GrantRfpUploadAnalysis,
  opportunity: GrantOpportunity,
  documentLinks: GrantDocumentLink[] = [],
): GrantOpportunityRfpPreview {
  const decision = analysis.decisionSummary;
  const documentKind = classifyAnalyzedGrantDocument(analysis.fileName, opportunity);
  return {
    analyzedAt: new Date().toISOString(),
    fileName: analysis.fileName,
    fileType: analysis.fileType,
    documentUrl: analysis.documentUrl ?? opportunity.url,
    documentLinks: dedupeDocumentLinks(documentLinks),
    documentKind: documentKind.documentKind,
    documentKindLabel: documentKind.documentKindLabel,
    fitSummary: cleanPreviewText(analysis.fitSummary) || "원문 확인 필요",
    matchedKeywords: cleanPreviewKeywordList(analysis.matchedKeywords, "matched").slice(0, 10),
    coreKeywords: cleanPreviewKeywordList(analysis.coreKeywords, "core").slice(0, 12),
    rfpFocus: cleanPreviewList(analysis.rfpFocus).filter((item) => !isNoisyPreviewText(item)).slice(0, 5),
    rfpSections: analysis.rfpSections
      .map((section) => ({ label: section.label, excerpt: cleanPreviewText(section.excerpt) }))
      .filter((section) => section.excerpt && !isNoisyPreviewText(section.excerpt))
      .slice(0, 3),
    researchPeriod: cleanPreviewFact(decision.researchPeriod),
    funding: cleanPreviewFact(decision.funding),
    mainResearchObjective: cleanPreviewFact(decision.mainResearchObjective),
    goals: cleanGoalList(decision.goals, decision.mainResearchObjective.value).slice(0, 4),
    threeBookFiveProjectRule: cleanThreeBookFiveFact(decision.threeBookFiveProjectRule),
    deadlineSignals: summarizeDeadlineSignals(analysis.deadlineSignals).slice(0, 4),
    documentSignals: summarizeDocumentSignals(analysis.documentSignals).slice(0, 6),
    recommendedActions: cleanPreviewList(analysis.recommendedActions).slice(0, 4),
    concerns: cleanPreviewList(analysis.concerns).slice(0, 3),
  };
}

function dedupeDocumentLinks(links: GrantDocumentLink[]) {
  const seen = new Set<string>();
  return links
    .filter((link) => link.url && link.fileName)
    .filter((link) => {
      const key = `${link.url}:${link.fileName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function classifyAnalyzedGrantDocument(
  fileName: string,
  opportunity: Pick<GrantOpportunity, "title" | "solicitationType">,
): Pick<GrantOpportunityRfpPreview, "documentKind" | "documentKindLabel"> {
  const text = `${fileName} ${opportunity.title} ${opportunity.solicitationType ?? ""}`;
  if (/iris-\d+-notice-page\.txt/i.test(fileName)) {
    return { documentKind: "page", documentKindLabel: "IRIS 상세페이지" };
  }
  if (/세부\s*지원내용/i.test(fileName)) {
    return { documentKind: "rfp", documentKindLabel: "세부 지원내용/RFP 대체자료" };
  }
  if (/과제제안요구서|제안요청서|제안요구서|RFP|품목개요|품목정의|기술개요|지원대상과제|공모과제\s*목록/i.test(fileName)) {
    return { documentKind: "rfp", documentKindLabel: "RFP/과제제안요구서" };
  }
  if (/자유공모|자유품목/i.test(text) && /공고문|시행계획|사업안내|안내서/i.test(fileName)) {
    return { documentKind: "notice", documentKindLabel: "자유공모 공고문" };
  }
  if (/공고문|시행계획|사업안내|공모안내서|안내서/i.test(fileName)) {
    return { documentKind: "notice", documentKindLabel: "공고문/시행계획" };
  }
  if (/양식|서식|작성요령|연구개발계획서|사업계획서|신청서/i.test(fileName)) {
    return { documentKind: "form", documentKindLabel: "양식/신청서류" };
  }
  return { documentKind: "unknown", documentKindLabel: "첨부문서" };
}

function cleanPreviewFact(fact: GrantOpportunityRfpPreview["researchPeriod"]) {
  const value = normalizeDateRangeText(cleanPreviewText(fact.value, 220));
  const evidence = fact.evidence ? cleanPreviewText(fact.evidence, 220) : null;
  return {
    value: value && !isNoisyPreviewText(value) ? value : "원문 확인 필요",
    evidence: evidence && !isNoisyPreviewText(evidence) ? evidence : null,
  };
}

function cleanPreviewList(values: string[]) {
  return values.map((value) => cleanPreviewText(value)).filter(Boolean);
}

function cleanPreviewText(value: string, maxLength = 420) {
  return value
    .replace(/--- RFP_ATTACHMENT_TEXT ---/g, " ")
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanPreviewKeywordList(values: string[], kind: "matched" | "core") {
  return cleanPreviewList(values)
    .map((value) => value.replace(/^[·•\-:：\s]+|[·•\-:：\s]+$/g, ""))
    .filter((value) => isUsefulPreviewKeyword(value, kind));
}

function cleanThreeBookFiveFact(fact: GrantOpportunityRfpPreview["threeBookFiveProjectRule"]) {
  const raw = cleanPreviewText([fact.value, fact.evidence].filter(Boolean).join(" "), 360);
  if (/3책\s*5공.{0,30}■\s*Y\s*□\s*N|3책5공.{0,30}■\s*Y\s*□\s*N/i.test(raw)) {
    return { value: "적용", evidence: null };
  }
  if (/3책\s*5공.{0,30}□\s*Y\s*■\s*N|3책5공.{0,30}□\s*Y\s*■\s*N/i.test(raw)) {
    return { value: "미적용 또는 제외", evidence: null };
  }
  if (/3책\s*5공|3책5공|삼책오공|연구개발과제\s*수\s*제한|동시\s*수행/i.test(raw)) {
    if (/미적용|적용\s*제외|제외\s*대상|해당\s*없음|□\s*Y\s*■\s*N|Y\s*□\s*N\s*■/i.test(raw)) {
      return { value: "미적용 또는 제외", evidence: null };
    }
    return { value: "적용", evidence: null };
  }
  if (!raw || /확인 필요|찾지 못|없음/i.test(raw)) {
    return { value: "확인 필요", evidence: null };
  }
  return { value: "확인 필요", evidence: null };
}

function summarizeDeadlineSignals(values: string[]) {
  const text = cleanPreviewList(values).join(" ");
  const ranges = Array.from(
    text.matchAll(
      /20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}\.?\s*(?:일)?\s*[~\-–]\s*20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}\.?\s*(?:일)?/g,
    ),
  ).map((match) => normalizeDateRangeText(match[0]));
  const singleDates = Array.from(text.matchAll(/20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}\.?\s*(?:일)?/g))
    .map((match) => normalizeDateRangeText(match[0]))
    .filter((date) => !ranges.some((range) => range.includes(date)));
  if (ranges.length > 0) return normalizeList(ranges).slice(0, 1);
  return normalizeList(singleDates).slice(0, 2);
}

function summarizeDocumentSignals(values: string[]) {
  const text = cleanPreviewList(values).join(" ");
  const labels = [
    ["연구개발계획서", /연구개발계획서/g],
    ["연구계획서", /연구계획서/g],
    ["사업계획서", /사업계획서/g],
    ["제안서/RFP", /제안서|제안요구서|RFP/gi],
    ["신청서", /신청서/g],
    ["공동연구 증빙", /공동연구\s*수행\s*증빙|LOI|MOU/gi],
    ["개인정보 동의서", /개인정보.{0,8}동의서|동의서/g],
    ["기관장 확인/공문", /기관장|공문/g],
    ["예산서", /예산서|연구비\s*예산|budget/gi],
    ["사업자등록증", /사업자등록증/g],
    ["CV/이력서", /CV|이력서/gi],
    ["추천서", /추천서/g],
    ["학위/재학 증명", /학위증명|재학증명|졸업증명|성적증명/g],
    ["IRB/임상시험 자료", /IRB|임상시험계획|기관생명윤리/gi],
  ] satisfies Array<[string, RegExp]>;
  return labels.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function cleanGoalList(values: string[], mainObjective: string) {
  const objective = cleanPreviewText(mainObjective, 180);
  return cleanPreviewList(values)
    .map(cleanGoalSentence)
    .filter((value) => value !== objective)
    .filter((value) => value.length >= 12)
    .filter((value) => !isNoisyPreviewText(value))
    .filter((value) => !isAdministrativeNoticeExcerpt(value))
    .filter((value) => /목표|개발|실증|검증|구축|고도화|성과|임상|데이터|AI|의료|재활|신경|척수|사업화|제품화/i.test(value));
}

function cleanGoalSentence(value: string) {
  const trimmed = cleanPreviewText(value, 240);
  const [goalPart] = trimmed.split(
    /\s*(?:□|■|○|ㅇ|\*)\s*(?:사업기간|지원규모|지원기간|신청자격|지원대상|제출서류|접수기간|공고기간|사업비|정부출연금|평가절차)|\s+사업기간\/예산|\s+지원규모|\s+지원기간|\s+신청자격|\s+제출서류/i,
  );
  return cleanPreviewText(goalPart || trimmed, 180);
}

function normalizeDateRangeText(value: string) {
  const dates = Array.from(value.matchAll(/20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}/g))
    .map((match) => normalizeSingleDateText(match[0]))
    .filter(Boolean);
  if (dates.length >= 2 && /[~–]/.test(value)) return `${dates[0]} ~ ${dates[1]}`;
  if (dates.length === 1 && value.trim().length <= 40) return dates[0];
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSingleDateText(value: string) {
  const match = value.match(/(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

const previewKeywordStops = new Set([
  "의",
  "과",
  "및",
  "수",
  "내",
  "이내",
  "호",
  "년",
  "월",
  "일",
  "공고",
  "재공고",
  "접수",
  "사업",
  "과제",
  "연구",
  "지원",
  "신청",
  "대상",
  "분야",
  "기간",
  "규모",
  "계획",
  "내용",
  "주관",
  "공동",
  "기관",
  "연구기간",
  "연구비",
  "지원규모",
  "지원대상",
  "지원목적",
  "신청자격",
  "연구책임자",
  "접수기간",
  "제출서류",
  "필수서류",
  "성과목표",
  "최종목표",
  "핵심 연구목표",
  "주관연구개발기관",
  "공동연구개발기관",
  "연구개발계획서",
  "과제제안요구서",
  "rfp",
  "3책5공",
]);

function isUsefulPreviewKeyword(value: string, kind: "matched" | "core") {
  const keyword = value.trim();
  if (!keyword) return false;
  const normalized = normalizeForSearch(keyword);
  if (!normalized) return false;
  if (previewKeywordStops.has(keyword.toLowerCase()) || previewKeywordStops.has(normalized)) return false;
  if (/^[가-힣]$/.test(keyword) || /^[a-z]$/i.test(keyword)) return false;
  if (/^\d+(?:년|월|일|호)?$/.test(keyword) || /^20\d{2}/.test(keyword)) return false;
  if (kind === "matched" && /자격|서류|마감|접수|지원규모|연구비|연구기간|성과목표|최종목표|주관|공동/.test(keyword)) {
    return false;
  }
  if (kind === "core" && /^(?:지|과|호|사업|지원|접수|연구|주관연|공동연구|202\d년?)$/.test(keyword)) {
    return false;
  }
  return keyword.length >= 2;
}

function isNoisyPreviewText(value: string) {
  const text = value.toLocaleLowerCase("ko-KR");
  const fileReferenceCount = (text.match(/\.(?:hwp|hwpx|pdf|zip|xlsx?|docx?)/g) ?? []).length;
  return (
    fileReferenceCount >= 2 ||
    /접수\s*매뉴얼|온라인\s*연구개발과제\s*접수매뉴얼|작성양식|평가\s*관련\s*참고자료|첨부파일/.test(text)
  );
}

function isAdministrativeNoticeExcerpt(value: string) {
  return (
    /공고번호|공고명|공고일자|재공고|사업담당자|연락처|접수\s*개시|소관부처|전문기관|프린트하기|home\s*서브|미개시|관심\s*있는\s*연구자/i.test(
      value,
    ) ||
    /대상과제\s*공고|신규과제\s*공모|시행계획\s*공고|^\d{0,4}\s*년도/i.test(value) ||
    /목적·내용\s*성과물\s*특성\s*지원유형|TRL\s*단계|RFP\s*유형코드/i.test(value) ||
    /\d{2,4}\)\s*$/.test(value) ||
    /\d{4}\s+[가-힣]{2,4}\s*\(/.test(value) ||
    /^\([^)]+R&D[^)]*\)$/.test(value)
  );
}

function defaultTopicsForGroup(sourceGroup: GrantSourceGroup) {
  if (sourceGroup === "regional-regulatory") return defaultRegionalRegulatoryTopics;
  if (sourceGroup === "investment") return defaultInvestmentTopics;
  if (sourceGroup === "global-research") return defaultGlobalResearchTopics;
  if (sourceGroup === "trainee-fellowship") return defaultTraineeFellowshipTopics;
  return defaultGrantTopics;
}

function sourceMatchesGroup(source: OfficialSource, sourceGroup: GrantSourceGroup) {
  if (sourceGroup === "central") {
    return !source.category || source.category === "central" || source.category === "regional-regulatory";
  }
  return source.category === sourceGroup;
}

function filterIrisBySourceGroup(items: GrantOpportunity[], sourceGroup: GrantSourceGroup) {
  if (sourceGroup === "central") return items;
  if (sourceGroup === "investment" || sourceGroup === "global-research") return [];
  if (sourceGroup === "trainee-fellowship") {
    return items.filter((item) =>
      /석사|박사|석박|대학원생|연구장려금|학문후속|박사후|펠로우십|fellow|postdoc|연수/.test(
        `${item.title} ${item.ministry ?? ""} ${item.agency ?? ""} ${item.excerpt ?? ""}`,
      ),
    );
  }
  return items.filter((item) =>
    /식품의약품|식약처|질병관리|국립보건|서울|경기|충북|충청북도|지자체|지역|바이오|의료기기|임상/.test(
      `${item.title} ${item.ministry ?? ""} ${item.agency ?? ""} ${item.excerpt ?? ""}`,
    ),
  );
}

async function fetchIrisOpenAnnouncements(warnings: string[]) {
  try {
    const first = await fetchIrisPage(1);
    const totalPages = Math.min(first.paginationInfo?.totalPageCount ?? 1, 10);
    const pages =
      totalPages > 1
        ? await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => fetchIrisPage(index + 2)))
        : [];
    return [first, ...pages]
      .flatMap((page) => page.listBsnsAncmBtinSitu ?? [])
      .filter(isOpenIrisAnnouncement);
  } catch (error) {
    warnings.push(`IRIS 접수중 공고 수집 실패: ${(error as Error).message}`);
    return [];
  }
}

async function fetchIrisPage(pageIndex: number): Promise<IrisResponse> {
  const body = new URLSearchParams({
    ancmPrg: "ancmIng",
    pageIndex: String(pageIndex),
  });
  const response = await fetch(irisListUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": "research-briefing-platform/0.9",
    },
    body,
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`IRIS ${response.status}`);
  return (await response.json()) as IrisResponse;
}

function isOpenIrisAnnouncement(item: IrisAnnouncement) {
  if (item.rcveStt && item.rcveStt !== "진행중") return false;
  if (typeof item.dDay === "number" && item.dDay < 0) return false;
  const endDate = parseKoreanDate(item.rcveEndDe);
  if (!endDate) return true;
  return endDate >= startOfToday();
}

async function enrichIrisOpportunities(
  items: IrisAnnouncement[],
  topics: string[],
  expandedKeywords: string[],
) {
  const prelim = items.map((item) => irisToOpportunity(item, topics, expandedKeywords));
  const detailTargets = prelim
    .filter((item) => item.relevanceScore > 0 || isPreferredGrantAgency(item))
    .slice(0, 24);
  const detailResults = await Promise.allSettled(
    detailTargets.map(async (item) => ({
      id: item.id,
      excerpt: await fetchIrisDetailExcerpt(item.id.replace("iris:", ""), expandedKeywords),
    })),
  );
  const excerptById = new Map<string, string>();
  for (const result of detailResults) {
    if (result.status === "fulfilled" && result.value.excerpt) {
      excerptById.set(result.value.id, result.value.excerpt);
    }
  }

  return prelim.map((item) => {
    const excerpt = excerptById.get(item.id) ?? item.excerpt;
    const rescored = scoreGrantText(
      `${item.title} ${item.ministry ?? ""} ${item.agency ?? ""} ${excerpt ?? ""}`,
      topics,
      expandedKeywords,
    );
    const eligibility = inferEligibility(`${item.title} ${excerpt ?? ""}`);
    return {
      ...item,
      excerpt,
      topicMatches: rescored.topicMatches,
      expandedKeywords: rescored.keywordMatches,
      relevanceScore: rescored.score,
      relevanceReason: rescored.reason,
      eligibleEntities: eligibility.entities,
      eligibilityNote: eligibility.note,
      actionItems: buildActionItems(item.applicationEnd, item.status, eligibility.entities),
    };
  });
}

function irisToOpportunity(
  item: IrisAnnouncement,
  topics: string[],
  expandedKeywords: string[],
): GrantOpportunity {
  const ancmId = item.ancmId ?? crypto.randomUUID();
  const text = `${item.ancmTl ?? ""} ${item.blngGovdSeNm ?? ""} ${item.sorgnNm ?? ""}`;
  const score = scoreGrantText(text, topics, expandedKeywords);
  const eligibility = inferEligibility(text);
  const endDate = normalizeDate(item.rcveEndDe);

  return {
    id: `iris:${ancmId}`,
    source: "IRIS",
    title: item.ancmTl ?? "제목 없음",
    url: `${irisViewBaseUrl}?ancmId=${encodeURIComponent(ancmId)}&ancmPrg=ancmIng`,
    ministry: item.blngGovdSeNm ?? null,
    agency: item.sorgnNm ?? null,
    noticeNumber: item.ancmNo ?? null,
    announcedAt: normalizeDate(item.ancmDe),
    applicationStart: normalizeDate(item.rcveStrDe),
    applicationEnd: endDate,
    dDay: typeof item.dDay === "number" ? item.dDay : calculateDDay(endDate),
    status: "open",
    statusLabel: item.rcveSttSeNmLst ?? "공고접수중",
    solicitationType: item.pbofrTpSeNmLst ?? null,
    topicMatches: score.topicMatches,
    expandedKeywords: score.keywordMatches,
    relevanceScore: score.score,
    relevanceReason: score.reason,
    eligibleEntities: eligibility.entities,
    eligibilityNote: eligibility.note,
    actionItems: buildActionItems(endDate, "open", eligibility.entities),
    excerpt: null,
  };
}

async function fetchIrisDetailExcerpt(ancmId: string, keywords: string[]) {
  const url = `${irisViewBaseUrl}?ancmId=${encodeURIComponent(ancmId)}&ancmPrg=ancmIng`;
  const response = await fetch(url, {
    headers: { "User-Agent": "research-briefing-platform/0.9" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const html = await response.text();
  const text = stripTags(html)
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return extractExcerpt(text, ["지원대상", "신청자격", "연구개발기관", "접수기간", ...keywords]);
}

async function fetchExternalOfficialCandidates(
  topics: string[],
  expandedKeywords: string[],
  warnings: string[],
  sourceGroup: GrantSourceGroup,
) {
  const queryKeywords = expandedKeywords.slice(0, 8);
  const sources = grantSources
    .filter((source) => source.domain !== "iris.go.kr" && sourceMatchesGroup(source, sourceGroup))
    .slice(0, sourceGroup === "central" ? 10 : 14);
  const settled = await Promise.allSettled(
    sources.map((source) => searchOfficialSource(source, topics, queryKeywords, expandedKeywords, sourceGroup)),
  );
  const opportunities: GrantOpportunity[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      opportunities.push(...result.value);
    } else {
      warnings.push(`${sources[index].name} 보조 검색 실패: ${result.reason}`);
    }
  });
  if (sourceGroup === "investment" || sourceGroup === "global-research" || sourceGroup === "trainee-fellowship") {
    const coveredSources = new Set(opportunities.map((item) => item.source));
    opportunities.push(
      ...sources
        .filter((source) => !coveredSources.has(source.name))
        .map((source) => sourceLandingCandidateToOpportunity(source, topics, expandedKeywords, sourceGroup)),
    );
  }
  return opportunities;
}

async function searchOfficialSource(
  source: OfficialSource,
  topics: string[],
  queryKeywords: string[],
  expandedKeywords: string[],
  sourceGroup: GrantSourceGroup,
) {
  const query = [
    `site:${source.domain}`,
    ...(sourceGroup === "investment"
      ? ["투자", "스타트업", "프로그램", "accelerator"]
      : sourceGroup === "global-research"
        ? ["grant", "funding", "application", "spinal cord injury", "research"]
        : sourceGroup === "trainee-fellowship"
          ? ["fellowship", "연구장려금", "박사후", "석박통합", "대학원생"]
      : ["공고", "접수", "신규과제"]),
    ...source.searchTerms.slice(0, 2),
    ...queryKeywords.slice(0, 5),
  ].join(" ");
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "rss");
  url.searchParams.set("setlang", sourceGroup === "global-research" || sourceGroup === "trainee-fellowship" ? "en-US" : "ko-KR");
  url.searchParams.set("cc", sourceGroup === "global-research" || sourceGroup === "trainee-fellowship" ? "US" : "KR");
  const response = await fetch(url.toString(), {
    headers: { "User-Agent": "research-briefing-platform/0.9" },
    signal: AbortSignal.timeout(9_000),
  });
  if (!response.ok) throw new Error(`search ${response.status}`);
  const feed = await parser.parseString(await response.text());

  return (feed.items ?? [])
    .filter((item) => item.title && item.link)
    .filter((item) => isSourceDomainUrl(item.link, source.domain))
    .slice(0, 4)
    .map((item) => externalItemToOpportunity(source, item, topics, expandedKeywords, sourceGroup))
    .filter(
      (item) =>
        item.relevanceScore > 0 ||
        (sourceGroup === "investment"
          ? /투자|스타트업|팁스|TIPS|accelerator|startup|fund|program|cloud|credit/i.test(item.title)
          : sourceGroup === "global-research"
            ? /grant|funding|application|award|fellowship|spinal cord|SCI|research|call|proposal|NOFO|RFA/i.test(item.title)
            : sourceGroup === "trainee-fellowship"
              ? /연구장려금|석사|박사|석박|대학원생|박사후|포닥|fellowship|postdoc|predoc|career|training|F31|F32|K99/i.test(item.title)
          : /공고|접수|신규|지원|과제|모집/.test(item.title)),
    );
}

function isSourceDomainUrl(value: string | undefined, domain: string) {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    const expected = domain.replace(/^www\./, "").toLowerCase();
    return hostname === expected || hostname.endsWith(`.${expected}`);
  } catch {
    return false;
  }
}

function sourceLandingCandidateToOpportunity(
  source: OfficialSource,
  topics: string[],
  expandedKeywords: string[],
  sourceGroup: GrantSourceGroup,
): GrantOpportunity {
  const title =
    sourceGroup === "investment"
      ? `${source.name} 공식 투자/액셀러레이션 프로그램 확인`
      : sourceGroup === "global-research"
        ? `${source.name} 공식 글로벌 연구과제 확인`
        : sourceGroup === "trainee-fellowship"
          ? `${source.name} 공식 대학원생·포닥 지원과제 확인`
      : `${source.name} 공식 공고 확인`;
  const excerpt = `${source.role} ${source.searchTerms.join(", ")}`;
  const score = scoreGrantText(`${title} ${excerpt}`, topics, expandedKeywords);
  const eligibility =
    sourceGroup === "investment"
      ? ({
          entities: ["company"] satisfies GrantEntityType[],
          note: "주관/지원대상: 회사. 투자·액셀러레이션 프로그램은 법인, 창업팀, 스타트업 요건을 먼저 확인해야 합니다.",
        })
      : sourceGroup === "global-research"
        ? ({
            entities: ["school", "hospital", "company"] satisfies GrantEntityType[],
            note: "글로벌 SCI 연구비는 대학·병원·비영리 연구기관 중심이지만, translational/technology track은 회사의 공동·위탁·파트너 참여 가능성을 확인해야 합니다.",
          })
        : sourceGroup === "trainee-fellowship"
          ? ({
              entities: ["graduate", "postdoc", "school"] satisfies GrantEntityType[],
              note: "주관/지원대상: 대학원생·포닥 개인. 석박통합 과정생, 박사과정생, 박사후연구원의 세부 자격과 지도교수/소속기관 승인을 확인해야 합니다.",
            })
      : inferEligibility(excerpt);

  return {
    id: `source:${source.domain}:${hash(source.url)}`,
    source: source.name,
    title,
    url: source.url,
    ministry: inferMinistryFromSource(source.name),
    agency: source.name,
    noticeNumber: null,
    announcedAt: null,
    applicationStart: null,
    applicationEnd: null,
    dDay: null,
    status: "candidate",
    statusLabel:
      sourceGroup === "investment"
        ? "공식 프로그램 확인 후보"
        : sourceGroup === "global-research"
          ? "공식 글로벌 연구과제 확인 후보"
          : sourceGroup === "trainee-fellowship"
            ? "공식 학생·포닥 과제 확인 후보"
        : "공식사이트 후보",
    solicitationType: null,
    topicMatches: score.topicMatches,
    expandedKeywords: score.keywordMatches,
    relevanceScore: Math.max(score.score, sourceGroup === "investment" || sourceGroup === "global-research" || sourceGroup === "trainee-fellowship" ? 0.25 : 0.1),
    relevanceReason:
      sourceGroup === "investment"
        ? "등록된 공식 투자·액셀러레이션 프로그램 페이지입니다. 현재 모집 여부와 세부 지원요건은 원문에서 확인해야 합니다."
        : sourceGroup === "global-research"
          ? "등록된 글로벌 SCI/재활 연구비 공식 페이지입니다. 현재 call open 여부, 국가/기관 자격, LOI 마감은 원문에서 확인해야 합니다."
          : sourceGroup === "trainee-fellowship"
            ? "등록된 대학원생·포닥 지원과제 공식 페이지입니다. 석박통합, 박사과정, 박사후 자격과 소속기관 승인 절차를 원문에서 확인해야 합니다."
        : "등록된 공식 공고 페이지입니다. 현재 접수 가능 여부는 원문에서 확인해야 합니다.",
    eligibleEntities: eligibility.entities,
    eligibilityNote: eligibility.note,
    actionItems:
      sourceGroup === "investment"
        ? buildInvestmentActionItems(source.name)
        : sourceGroup === "global-research"
          ? buildGlobalResearchActionItems(source.name)
          : sourceGroup === "trainee-fellowship"
            ? buildTraineeFellowshipActionItems(source.name)
        : buildActionItems(null, "candidate", eligibility.entities),
    excerpt,
  };
}

function externalItemToOpportunity(
  source: OfficialSource,
  item: SearchRssItem,
  topics: string[],
  expandedKeywords: string[],
  sourceGroup: GrantSourceGroup,
): GrantOpportunity {
  const title = stripTags(item.title ?? "제목 없음");
  const excerpt = stripTags(item.contentSnippet ?? item.content ?? "");
  const text = `${title} ${excerpt} ${source.name}`;
  const score = scoreGrantText(text, topics, expandedKeywords);
  const eligibility = inferEligibility(text);

  return {
    id: `official:${source.domain}:${hash(`${item.guid ?? item.link ?? title}`)}`,
    source: source.name,
    title,
    url: item.link ?? source.url,
    ministry: inferMinistryFromSource(source.name),
    agency: source.name,
    noticeNumber: null,
    announcedAt: normalizeDate(item.isoDate ?? item.pubDate),
    applicationStart: null,
    applicationEnd: extractDateNearDeadline(text),
    dDay: calculateDDay(extractDateNearDeadline(text)),
    status: "candidate",
    statusLabel:
      sourceGroup === "investment"
        ? "투자/액셀러레이션 후보"
        : sourceGroup === "global-research"
          ? "글로벌 연구과제 후보"
          : sourceGroup === "trainee-fellowship"
            ? "학생·포닥 지원과제 후보"
        : "공식사이트 후보",
    solicitationType: null,
    topicMatches: score.topicMatches,
    expandedKeywords: score.keywordMatches,
    relevanceScore: Math.max(score.score - 0.05, 0),
    relevanceReason:
      score.reason ||
      (sourceGroup === "investment"
        ? "투자·액셀러레이션 프로그램 후보입니다. 지원 가능 국가, 법인 요건, 지분/크레딧 조건을 원문에서 확인해야 합니다."
        : sourceGroup === "global-research"
          ? "글로벌 SCI/재활 연구비 후보입니다. 지원 가능 국가, PI 소속기관, LOI/Full proposal 마감과 indirect cost 조건을 원문에서 확인해야 합니다."
          : sourceGroup === "trainee-fellowship"
            ? "대학원생·포닥 개인지원형 과제 후보입니다. 학적, 박사학위 취득일, 전업 여부, 지도교수/호스트 기관 확인이 필요합니다."
        : "IRIS 밖 공식 사이트 검색 후보입니다. 접수 가능 여부는 원문에서 확인해야 합니다."),
    eligibleEntities: eligibility.entities,
    eligibilityNote: `${eligibility.note} 비IRIS 후보는 반드시 공고문 원문에서 접수상태와 신청자격을 재확인하세요.`,
    actionItems:
      sourceGroup === "investment"
        ? buildInvestmentActionItems(source.name)
        : sourceGroup === "global-research"
          ? buildGlobalResearchActionItems(source.name)
          : sourceGroup === "trainee-fellowship"
            ? buildTraineeFellowshipActionItems(source.name)
        : buildActionItems(null, "candidate", eligibility.entities),
    excerpt: excerpt || null,
  };
}

function scoreGrantText(text: string, topics: string[], expandedKeywords: string[]) {
  const normalized = normalizeForSearch(text);
  const topicMatches = topics.filter((topic) => includesLoose(normalized, topic));
  const keywordMatches = expandedKeywords.filter((keyword) => includesLoose(normalized, keyword)).slice(0, 12);
  const agencyBoost = /한국연구재단|보건산업진흥원|의료기기|보건복지|과학기술|정보통신|산업기술|중소기업|국방|식품의약품|질병관리|서울|경기|충북|TIPS|팁스|Google|AWS|Amazon|startup|accelerator|Wings for Life|Spinal Research|Neilsen|Reeve|Paralyzed Veterans|NIH|CDMRP|NIDILRR|Horizon|spinal cord injury|SCI|학문후속|연구장려금|석박통합|박사후|HFSP|EMBO|MSCA|F31|F32|K99|postdoctoral/i.test(text)
    ? 0.15
    : 0;
  const score = Math.min(
    1,
    topicMatches.length * 0.18 + keywordMatches.length * 0.055 + agencyBoost,
  );
  const reason =
    keywordMatches.length > 0
      ? `주제/확장 키워드 ${keywordMatches.slice(0, 5).join(", ")}와 매칭됩니다.`
      : "직접 키워드 매칭은 약하지만 접수중 공고라 후보에 포함했습니다.";

  return { score: Number(score.toFixed(2)), topicMatches, keywordMatches, reason };
}

function inferEligibility(text: string): { entities: GrantEntityType[]; note: string } {
  const normalizedText = text.replace(/\s+/g, " ");
  if (isSmallBusinessLeadGrant(normalizedText)) {
    return {
      entities: ["company"],
      note:
        "주관/지원대상: 중소기업·창업기업. 학교·병원은 공고/RFP에 공동연구개발기관, 위탁기관, 수요기관 참여가 명시될 때만 참여 후보입니다.",
    };
  }
  if (isCompanyLeadGrant(normalizedText)) {
    return {
      entities: ["company"],
      note: "주관/지원대상: 회사. 학교·병원은 공동·위탁·수요기관 참여 가능 여부가 원문에 명시된 경우만 확인합니다.",
    };
  }
  if (isGraduateOrPostdocGrant(normalizedText)) {
    const entities = new Set<GrantEntityType>();
    if (/석사|석박|박사과정생|박사수료생|대학원생|전업 학생|학문후속|연구장려금|predoctoral|graduate student|PhD student|doctoral student/i.test(normalizedText)) {
      entities.add("graduate");
    }
    if (/박사후|포닥|박사후연구원|박사후국내연수|세종과학펠로우십|postdoc|postdoctoral|early career|K99|F32|EMBO|HFSP|MSCA/i.test(normalizedText)) {
      entities.add("postdoc");
    }
    entities.add("school");
    return {
      entities: [...entities],
      note: "주관/지원대상: 대학원생·포닥 개인 또는 소속 대학. 학적, 박사학위 취득일, 지도교수/소속기관 승인 요건을 확인하세요.",
    };
  }

  const entities = new Set<GrantEntityType>();
  if (/대학|대학교|학교|교원|산학협력단|비영리|연구기관|출연연|정부출연|university|college|research institution|investigator|principal investigator|nonprofit|non-profit/i.test(normalizedText)) {
    entities.add("school");
  }
  if (/병원|의료기관|의료법인|임상|환자|보건의료|의료기기|식약처|hospital|clinic|clinical|patient|rehabilitation center|medical center/i.test(normalizedText)) {
    entities.add("hospital");
  }
  if (/기업|중견기업|산업체|사업화|제품화|창업|벤처|스타트업|startup|founder|accelerator|investment|투자|TIPS|팁스|company|industry|biotech|medtech|technology|commercial/i.test(normalizedText)) {
    entities.add("company");
  }

  if (/산학연|산·학·연|산학협력|컨소시엄|공동연구.{0,80}(대학|병원|기업|연구기관)|대학.{0,20}기업.{0,20}공동|기업.{0,20}대학.{0,20}공동/.test(normalizedText)) {
    entities.add("school");
    entities.add("hospital");
    entities.add("company");
  }
  if (entities.size === 0) {
    entities.add("school");
    entities.add("hospital");
    entities.add("company");
  }

  const selected = [...entities];
  const label = selected.map(entityLabel).join(", ");
  return {
    entities: selected,
    note:
      entities.size === 3
        ? "주관/지원대상 원문 확인 필요. 학교·병원·회사 중 실제 주관, 공동, 위탁 가능 범위를 공고/RFP에서 확인하세요."
        : `주관/지원대상 후보: ${label}. 타 기관은 공동·위탁 참여 가능성이 원문에 명시된 경우만 확인하세요.`,
  };
}

function isSmallBusinessLeadGrant(text: string) {
  return (
    /중소벤처기업부|중소기업기술정보진흥원|TIPA|중소기업|중소기업기술혁신개발|창업성장기술개발|중소기업\s*R&D|중소기업\s*기술개발|구매조건부|네트워크형|시장대응형|수출지향형|글로벌협력형|에코브릿지|테크브릿지|투[·\s-]*융자|투융자|스케일업\s*팁스|TIPS|팁스/i.test(text) ||
    /지원대상.{0,120}(중소기업|창업기업|벤처기업)|신청자격.{0,120}(중소기업|창업기업|벤처기업)|주관(?:연구개발)?기관.{0,120}(중소기업|창업기업|벤처기업)/i.test(
      text,
    )
  );
}

function isCompanyLeadGrant(text: string) {
  return /주관(?:연구개발)?기관.{0,80}(기업|중견기업|산업체|법인)|기업.{0,30}(주관|단독\s*신청|신청\s*가능|지원대상)|법인사업자|기업부설연구소|스타트업|창업기업/i.test(
    text,
  );
}

function isGraduateOrPostdocGrant(text: string) {
  return /석사|석박|박사과정생|박사수료생|대학원생|전업 학생|학문후속|연구장려금|박사후|포닥|박사후연구원|박사후국내연수|세종과학펠로우십|predoctoral|graduate student|PhD student|doctoral student|postdoc|postdoctoral|early career|K99|F32|EMBO|HFSP|MSCA/i.test(
    text,
  );
}

function buildActionItems(
  applicationEnd: string | null,
  status: GrantOpportunity["status"],
  entities: GrantEntityType[],
) {
  const items = [
    "공고문과 첨부 연구개발계획서 양식을 내려받기",
    `신청자격에서 ${entities.map(entityLabel).join(", ")}의 주관/공동/위탁 가능 여부 확인`,
    "연구책임자, 참여기관, 기업 참여 필요성을 1차로 결정",
  ];
  const dDay = calculateDDay(applicationEnd);
  if (typeof dDay === "number" && dDay <= 7) {
    items.unshift("마감 임박: 내부 산학협력단/연구지원팀 일정부터 즉시 확인");
  }
  if (status !== "open") {
    items.unshift("원문에서 접수중 여부와 마감일을 확인");
  }
  return items;
}

function buildInvestmentActionItems(sourceName: string) {
  return [
    `${sourceName} 원문에서 현재 모집/상시접수 여부 확인`,
    "법인 소재지, 업력, 투자유치 단계, 매출/고용 요건 확인",
    "지분투자, 보조금, 클라우드 크레딧, 멘토링 중 실제 혜택 유형 구분",
    "의료기기/의료 AI인 경우 임상, 인허가, 개인정보 규제 대응 자료 준비",
    "TIPS 계열은 운영사 추천·선투자 요건과 정부 R&D 연계 가능성 확인",
  ];
}

function buildGlobalResearchActionItems(sourceName: string) {
  return [
    `${sourceName} 원문에서 call open 여부, LOI/Executive Summary/Full proposal 마감 확인`,
    "지원 가능 국가와 PI 소속기관 요건 확인: international, US/Canada, UK/EU, nonprofit 제한 여부",
    "SCI 특화 범위 확인: traumatic SCI, chronic SCI, neural repair, plasticity, rehabilitation, clinical translation",
    "병원 임상연구는 IRB, 환자군, registry, multicenter collaboration, data sharing 조건을 먼저 점검",
    "회사 참여는 주관 가능 여부보다 공동연구, device/software supply, translational partner, IP 조건을 확인",
  ];
}

function buildTraineeFellowshipActionItems(sourceName: string) {
  return [
    `${sourceName} 원문에서 석박통합·박사과정·박사후 지원 가능 트랙을 구분`,
    "학적 상태 확인: 전업 재학, 수료생, 박사학위 취득일, 임용/고용 형태, 국적 제한",
    "지도교수 또는 host PI 승인, 소속기관 산학협력단 승인, 추천서 필요 여부 확인",
    "학생/포닥 개인 연구계획서, CV, 성적/학위증명, 재학·수료·박사학위 증명서 준비",
    "기존 과제 참여율, 연구비 중복수혜, 인건비/장학금 중복 제한을 확인",
  ];
}

function orderGrantOpportunities(a: GrantOpportunity, b: GrantOpportunity) {
  const statusWeight = { open: 0, candidate: 1, needs_review: 2 };
  const statusDiff = statusWeight[a.status] - statusWeight[b.status];
  if (statusDiff !== 0) return statusDiff;
  const relevanceDiff = b.relevanceScore - a.relevanceScore;
  if (relevanceDiff !== 0) return relevanceDiff;
  return (a.dDay ?? 999) - (b.dDay ?? 999);
}

function summarizeEntities(items: GrantOpportunity[]) {
  return {
    school: items.filter((item) => item.eligibleEntities.includes("school")).length,
    hospital: items.filter((item) => item.eligibleEntities.includes("hospital")).length,
    company: items.filter((item) => item.eligibleEntities.includes("company")).length,
    graduate: items.filter((item) => item.eligibleEntities.includes("graduate")).length,
    postdoc: items.filter((item) => item.eligibleEntities.includes("postdoc")).length,
  };
}

function dedupeOpportunities(items: GrantOpportunity[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeForSearch(`${item.title} ${item.agency ?? ""}`).slice(0, 140);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeList(values: string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeDate(value: string | null | undefined) {
  const date = parseKoreanDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function parseKoreanDate(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 14, 59, 59));
}

function extractDateNearDeadline(text: string) {
  const deadlineMatch =
    text.match(/(?:마감|접수\s*기간|접수|신청)[^\d]{0,20}(20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2})/) ??
    text.match(/(20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2})/);
  return normalizeDate(deadlineMatch?.[1]);
}

function calculateDDay(value: string | null | undefined) {
  const date = parseKoreanDate(value);
  if (!date) return null;
  const diff = date.getTime() - startOfToday().getTime();
  return Math.ceil(diff / 86_400_000);
}

function startOfToday() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) -
      9 * 60 * 60 * 1000,
  );
}

function includesLoose(normalizedText: string, term: string) {
  const normalizedTerm = normalizeForSearch(term);
  if (!normalizedTerm) return false;
  if (normalizedText.includes(normalizedTerm)) return true;
  const parts = normalizedTerm.split(" ").filter((part) => part.length >= 2);
  return parts.length >= 2 && parts.every((part) => normalizedText.includes(part));
}

function normalizeForSearch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractExcerpt(text: string, keywords: string[]) {
  const candidates = keywords.map((keyword) => text.indexOf(keyword)).filter((index) => index >= 0);
  const start = candidates.length ? Math.max(Math.min(...candidates) - 120, 0) : 0;
  return text.slice(start, start + 520).trim() || null;
}

function isPreferredGrantAgency(item: GrantOpportunity) {
  return /한국연구재단|의료기기|보건산업진흥원|정보통신기획평가원|산업기술|중소기업|국방/.test(
    `${item.agency ?? ""} ${item.ministry ?? ""}`,
  );
}

function entityLabel(entity: GrantEntityType) {
  if (entity === "school") return "학교";
  if (entity === "hospital") return "병원";
  if (entity === "graduate") return "대학원생";
  if (entity === "postdoc") return "포닥";
  return "회사";
}

function inferMinistryFromSource(sourceName: string) {
  if (/연구재단|정보통신|과학기술/.test(sourceName)) return "과학기술정보통신부";
  if (/보건|진흥원/.test(sourceName)) return "보건복지부";
  if (/산업기술|산업통상/.test(sourceName)) return "산업통상부";
  if (/중소|TIPA/.test(sourceName)) return "중소벤처기업부";
  if (/국방|방위/.test(sourceName)) return "국방부/방위사업청";
  return null;
}

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}
