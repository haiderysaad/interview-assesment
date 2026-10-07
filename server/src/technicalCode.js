export const CANDIDATE_CODE_MARKER = "{{CANDIDATE_CODE}}";

export function hasValidStarterCode(starterCode) {
  if (
    starterCode === null ||
    typeof starterCode !== "object" ||
    Array.isArray(starterCode)
  ) return false;

  return Object.values(starterCode).every((template) =>
    typeof template === "string" &&
    (!template.trim() || template.split(CANDIDATE_CODE_MARKER).length === 2)
  );
}

export function assembleCandidateCode(starterCode, language, candidateCode) {
  const template = starterCode?.[language]?.trim() ? starterCode[language] : "";
  if (!template) return candidateCode;
  if (template.split(CANDIDATE_CODE_MARKER).length !== 2) {
    const error = new Error("The question's starter code must contain exactly one {{CANDIDATE_CODE}} marker.");
    error.status = 400;
    throw error;
  }
  return template.replace(CANDIDATE_CODE_MARKER, candidateCode);
}

export function extractCandidateCode(starterCode, language, submittedCode) {
  const template = starterCode?.[language]?.trim() ? starterCode[language] : "";
  if (!template || template.split(CANDIDATE_CODE_MARKER).length !== 2)
    return submittedCode;

  const [before, after] = template.split(CANDIDATE_CODE_MARKER);
  if (!submittedCode.startsWith(before) || !submittedCode.endsWith(after))
    return submittedCode;
  return submittedCode.slice(before.length, submittedCode.length - after.length);
}
