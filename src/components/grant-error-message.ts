const friendlyApiErrors: Record<string, string> = {
  "Invalid government grant search options.": "검색 조건 형식이 올바르지 않습니다.",
  "Invalid grant candidate payload.": "후보 등록 요청 형식이 올바르지 않습니다.",
  "Invalid grant candidate update payload.": "RFP 분석 요청 형식이 올바르지 않습니다.",
  "Invalid grant candidate delete payload.": "후보 배제 요청 형식이 올바르지 않습니다.",
  "Invalid grant source group.": "과제 메뉴 값이 올바르지 않습니다.",
  "Invalid keyword expansion payload.": "확장 키워드 요청 형식이 올바르지 않습니다.",
  "Invalid keyword preset payload.": "기본 키워드 저장 요청 형식이 올바르지 않습니다.",
  "At least one base keyword is required.": "저장할 기본 키워드를 하나 이상 입력해 주세요.",
};

export function apiErrorMessage(payload: unknown, fallback: string) {
  const data = payload && typeof payload === "object" ? (payload as { error?: unknown; details?: unknown }) : {};
  const rawBase = typeof data.error === "string" && data.error.trim() ? data.error.trim() : fallback;
  const base = friendlyApiErrors[rawBase] ?? rawBase;
  const details = formatErrorDetails(data.details);

  return details ? `${base} 상세: ${details}` : base;
}

function formatErrorDetails(details: unknown): string {
  if (typeof details === "string") return shorten(details.trim());
  if (typeof details === "number" || typeof details === "boolean") return String(details);
  if (!details) return "";

  if (Array.isArray(details)) {
    return shorten(
      details
        .map((item) => formatErrorDetails(item))
        .filter(Boolean)
        .join(", "),
    );
  }

  if (typeof details !== "object") return "";

  const record = details as Record<string, unknown>;
  const formErrors = formatErrorDetails(record.formErrors);
  const fieldErrors = formatFieldErrors(record.fieldErrors);
  const knownMessages = [formErrors, fieldErrors].filter(Boolean).join("; ");
  if (knownMessages) return shorten(knownMessages);

  const entries = Object.entries(record)
    .map(([key, value]) => {
      const message = formatErrorDetails(value);
      return message ? `${key}: ${message}` : "";
    })
    .filter(Boolean);

  if (entries.length > 0) return shorten(entries.join("; "));

  try {
    return shorten(JSON.stringify(details));
  } catch {
    return "";
  }
}

function formatFieldErrors(fieldErrors: unknown) {
  if (!fieldErrors || typeof fieldErrors !== "object") return "";

  return Object.entries(fieldErrors as Record<string, unknown>)
    .map(([field, value]) => {
      const message = formatErrorDetails(value);
      return message ? `${field}: ${message}` : "";
    })
    .filter(Boolean)
    .join("; ");
}

function shorten(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 700 ? `${normalized.slice(0, 697)}...` : normalized;
}
