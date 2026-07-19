const MAX_BRIEF_LENGTH = 420;

export function normalizeAiBrief(value?: string, fallback = "Live market brief is still syncing.") {
  const cleaned = (value ?? "")
    .replace(/\r?\n+/g, " ")
    .replace(/\*\*/g, "")
    .replace(/[`_]/g, "")
    .replace(/#{1,6}\s*/g, "")
    .replace(/(^|\s)(?:[-*]|\d+\.)\s+/g, " ")
    .replace(/^Summary of Key Market Observations as of \d{4}-\d{2}-\d{2}:?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return fallback;
  if (cleaned.length <= MAX_BRIEF_LENGTH) return cleaned;

  const slice = cleaned.slice(0, MAX_BRIEF_LENGTH);
  const cut = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("; "), slice.lastIndexOf(", "), slice.lastIndexOf(" "));
  const end = cut >= 240 ? cut : MAX_BRIEF_LENGTH;

  return `${slice.slice(0, end).trim()}...`;
}
