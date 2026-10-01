import crypto from "node:crypto";
import { prisma } from "./prisma.js";

export const GRACE_MS = 30_000;

export const deadlineOf = (attempt, round) =>
  attempt.startedAt.getTime() + round.durationMin * 60_000;

function cleanPicks(value, optionCount) {
  const list = Array.isArray(value) ? value : [];
  return [...new Set(list.filter((n) => Number.isInteger(n) && n >= 0 && n < optionCount))];
}

// Keeps only valid picks (original option indexes) keyed by question id
export function cleanAnswers(questions, raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const q of questions) {
    let picks = cleanPicks(source[q.id], q.options.length);
    if (q.type === "SINGLE") picks = picks.slice(0, 1);
    if (picks.length) out[q.id] = picks;
  }
  return out;
}

// Full marks only when the picked set equals the correct set. Wrong = minus negativeMarks. Blank = 0.
export function gradeAnswers(questions, answers) {
  const clean = cleanAnswers(questions, answers);
  let score = 0, totalMarks = 0, correctCount = 0;
  for (const q of questions) {
    totalMarks += q.marks;
    const picks = clean[q.id];
    if (!picks) continue;
    const right = picks.length === q.correct.length && q.correct.every((c) => picks.includes(c));
    if (right) { score += q.marks; correctCount++; }
    else score -= q.negativeMarks;
  }
  return { score, totalMarks, correctCount };
}

function rng(seed) {
  let a = crypto.createHash("sha256").update(seed).digest().readUInt32BE(0);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Same seed = same order, so a refresh doesn't reshuffle
export function seededShuffle(items, seed) {
  const rand = rng(seed);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function finalizeAttempt(attempt, round, auto = false) {
  if (attempt.submittedAt) return attempt;
  const grade = gradeAnswers(round.questions, attempt.answers);
  return prisma.attempt.update({
    where: { id: attempt.id },
    data: {
      answers: attempt.answers,
      submittedAt: new Date(),
      autoSubmitted: auto,
      ...grade,
    },
  });
}