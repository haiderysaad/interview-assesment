import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { GRACE_MS, deadlineOf, finalizeAttempt } from "../attempts.js";
import { executeWithJDoodle } from "../jdoodle.js";

function sameOutput(actual, expected) {
  if (actual === expected) return true;
  try {
    return JSON.stringify(JSON.parse(actual)) === JSON.stringify(JSON.parse(expected));
  } catch {
    return false;
  }
}
import { suggestSyntaxFix } from "../geminiSyntax.js";

// Admin-only (mounted behind requireAdmin)
const router = Router();

router.delete("/:id", async (req, res) => {
  const session = await prisma.interviewSession.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!session) return res.status(404).json({ error: "Session not found" });

  await prisma.interviewSession.delete({ where: { id: session.id } });
  res.json({ ok: true });
});

router.patch("/:id/status", async (req, res) => {
  const { status } = req.body ?? {};
  if (!["PUBLISHED", "CLOSED"].includes(status))
    return res.status(400).json({ error: "Status must be PUBLISHED or CLOSED" });

  const session = await prisma.interviewSession.findUnique({
    where: { id: req.params.id },
    include: {
      rounds: {
        where: { type: { in: ["APTITUDE", "TECHNICAL"] } },
        include: {
          _count: {
            select: {
              questions: true,
              technicalQuestions: true,
            },
          },
        },
      },
    },
  });
  if (!session) return res.status(404).json({ error: "Session not found" });

  if (status === "PUBLISHED") {
    if (session.status !== "DRAFT")
      return res.status(400).json({ error: "Only draft sessions can be published" });
    const aptitudeRound = session.rounds.find((round) => round.type === "APTITUDE");
    const technicalRound = session.rounds.find((round) => round.type === "TECHNICAL");
    if (!aptitudeRound || !technicalRound)
      return res.status(400).json({ error: "Every interview session must include aptitude and technical rounds" });
    const emptyRound = session.rounds.find((round) =>
      round.type === "APTITUDE"
        ? round._count.questions === 0
        : round._count.technicalQuestions === 0
    );
    if (emptyRound)
      return res.status(400).json({
        error: `Add at least one ${emptyRound.type === "APTITUDE" ? "aptitude" : "technical"} question before publishing`,
      });
  } else if (session.status !== "PUBLISHED") {
    return res.status(400).json({ error: "Only published sessions can be closed" });
  }

  res.json(await prisma.interviewSession.update({ where: { id: session.id }, data: { status } }));
});

router.post("/:id/candidates", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!name || !/^\S+@\S+\.\S+$/.test(email))
    return res.status(400).json({ error: "Enter a name and a valid email" });

  const session = await prisma.interviewSession.findUnique({ where: { id: req.params.id } });
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.status === "CLOSED") return res.status(400).json({ error: "This session is closed" });

  try {
    res.status(201).json(await prisma.candidate.create({ data: { sessionId: session.id, name, email } }));
  } catch (e) {
    if (e.code === "P2002") return res.status(409).json({ error: "That email is already added to this session" });
    throw e;
  }
});

router.get("/:id/results", async (req, res) => {
  const session = await prisma.interviewSession.findUnique({ where: { id: req.params.id } });
  if (!session) return res.status(404).json({ error: "Session not found" });

  const round = await prisma.round.findFirst({
    where: { sessionId: session.id, type: "APTITUDE" },
    include: { questions: true },
  });
  const candidates = await prisma.candidate.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    include: {
      attempts: true,
      violations: { where: { meta: { path: ["removed"], equals: true } }, take: 1 },
      technicalSubmissions: {
        include: { question: { select: { title: true } } },
        orderBy: { submittedAt: "desc" },
      },
    },
  });

  const rows = [];
  for (const c of candidates) {
    let a = c.attempts[0] ?? null;
    if (a && !a.submittedAt && round && Date.now() > deadlineOf(a, round) + GRACE_MS)
      a = await finalizeAttempt(a, round, true);
    const submitted = !!a?.submittedAt;
    rows.push({
      id: c.id,
      name: c.name,
      email: c.email,
      token: c.token,
      status: !a ? "NOT_STARTED" : submitted ? "SUBMITTED" : "IN_PROGRESS",
      startedAt: a?.startedAt ?? null,
      submittedAt: a?.submittedAt ?? null,
      autoSubmitted: a?.autoSubmitted ?? false,
      removedReason: c.violations[0]?.type ?? null,
      score: submitted ? a.score : null,
      totalMarks: submitted ? a.totalMarks : null,
      correctCount: submitted ? a.correctCount : null,
      percentage: submitted && a.totalMarks > 0 ? Math.round((a.score / a.totalMarks) * 1000) / 10 : null,
      technicalSubmissions: c.technicalSubmissions.map((submission) => ({
        id: submission.id,
        questionTitle: submission.question.title,
        language: submission.language,
        code: submission.code,
        suggestedCode: submission.suggestedCode,
        suggestedAt: submission.suggestedAt,
        suggestionNote: submission.suggestionNote,
        suggestionChanged: submission.suggestionChanged,
        submittedAt: submission.submittedAt,
        evaluation: submission.evaluation,
        evaluatedAt: submission.evaluatedAt,
      })),
    });
  }
  for (const row of rows) {
    const evaluated = row.technicalSubmissions.filter((s) => s.evaluation);
    row.techPassed = evaluated.reduce((sum, s) => sum + (s.evaluation.passedCount ?? 0), 0);
    row.techTotal = evaluated.reduce((sum, s) => sum + (s.evaluation.totalCases ?? 0), 0);
    row.techRuntime = evaluated.reduce((sum, s) => sum + (s.evaluation.cpuTime ?? 0), 0);
    row.techMemory = Math.max(0, ...evaluated.map((s) => s.evaluation.memory ?? 0));
    const techPercent = row.techTotal > 0 ? (row.techPassed / row.techTotal) * 100 : 0;
    row.combined = row.percentage === null ? null : Math.round(((row.percentage + techPercent) / 2) * 10) / 10;
  }
  rows
    .filter((row) => row.combined !== null)
    .sort((a, b) => b.combined - a.combined || a.techRuntime - b.techRuntime || a.techMemory - b.techMemory)
    .forEach((row, index) => { row.rank = index + 1; });
  res.json({ questionCount: round?.questions.length ?? 0, candidates: rows });
});

router.post("/:id/technical-submissions/:submissionId/evaluate", async (req, res) => {
  const submission = await prisma.technicalSubmission.findFirst({
    where: {
      id: req.params.submissionId,
      candidate: { sessionId: req.params.id },
    },
    include: { question: true },
  });
  if (!submission) return res.status(404).json({ error: "Technical submission not found" });
  const codeVersion = req.body?.version ?? "ORIGINAL";
  if (!["ORIGINAL", "AI_SUGGESTED"].includes(codeVersion))
    return res.status(400).json({ error: "Choose ORIGINAL or AI_SUGGESTED code" });
  if (codeVersion === "AI_SUGGESTED" && !submission.suggestedCode)
    return res.status(400).json({ error: "Ask Gemini for a syntax suggestion first" });
  const code = codeVersion === "AI_SUGGESTED" ? submission.suggestedCode : submission.code;

  const testCases = submission.question.testCases;
  if (
    !Array.isArray(testCases) ||
    testCases.length === 0 ||
    testCases.some((testCase) =>
      !testCase ||
      typeof testCase.input !== "string" ||
      typeof testCase.expectedOutput !== "string"
    )
  )
    return res.status(400).json({ error: "This question has no valid test cases. Review its test cases before evaluating." });

  const results = [];
  for (const [index, testCase] of testCases.entries()) {
    const run = await executeWithJDoodle({
      code,
      language: submission.language,
      input: testCase.input,
    });
    const compilationFailed =
      run.compilationStatus?.toLowerCase() === "failure" ||
      run.compilationStatus?.toLowerCase() === "failed" ||
      run.statusCode === 6;
    const executionFailed = run.statusCode !== 200 || compilationFailed;
    const normalize = (text) =>
      text.replace(/\r\n/g, "\n").split("\n").map((line) => line.trimEnd()).join("\n").trim();
    const actual = normalize(run.output);
    const expected = normalize(testCase.expectedOutput);
        console.log(JSON.stringify(actual), JSON.stringify(expected));
    results.push({
      index: index + 1,
      category: testCase.category,
      passed: !executionFailed && sameOutput(actual, expected),
      errorType: compilationFailed ? "COMPILE_ERROR" : executionFailed ? "EXECUTION_ERROR" : null,
      expectedOutput: testCase.expectedOutput,
      actualOutput: run.output.slice(0, 5000),
      statusCode: run.statusCode,
      compilationStatus: run.compilationStatus,
      cpuTime: run.cpuTime,
      memory: run.memory,
    });
    if (executionFailed) break;
  }

  const passedCount = results.filter((result) => result.passed).length;
  const evaluatedAt = new Date();
  const evaluation = {
    status: results.some((result) => result.errorType === "COMPILE_ERROR")
      ? "COMPILE_ERROR"
      : results.some((result) => result.errorType === "EXECUTION_ERROR")
        ? "EXECUTION_ERROR"
        : passedCount === testCases.length
          ? "PASSED"
          : "FAILED",
    passedCount,
    totalCases: testCases.length,
    cpuTime: results.reduce((total, result) => total + (result.cpuTime ?? 0), 0),
    memory: Math.max(0, ...results.map((result) => result.memory ?? 0)),
    codeVersion,
    results,
  };
  const updated = await prisma.technicalSubmission.update({
    where: { id: submission.id },
    data: { evaluation, evaluatedAt },
  });
  res.json({
    evaluation: updated.evaluation,
    evaluatedAt: updated.evaluatedAt,
  });
});

router.post("/:id/technical-submissions/:submissionId/suggest-syntax-fix", async (req, res) => {
  const submission = await prisma.technicalSubmission.findFirst({
    where: {
      id: req.params.submissionId,
      candidate: { sessionId: req.params.id },
    },
    select: { id: true, code: true, language: true },
  });
  if (!submission) return res.status(404).json({ error: "Technical submission not found" });

  try {
    const suggestion = await suggestSyntaxFix(submission.code, submission.language);
    const updated = await prisma.technicalSubmission.update({
      where: { id: submission.id },
      data: {
        suggestedCode: suggestion.code,
        suggestedAt: new Date(),
        evaluation: Prisma.DbNull,
        evaluatedAt: null,
        suggestionNote: suggestion.explanation,
        suggestionChanged: suggestion.changed,
      },
      select: {
        suggestedCode: true,
        suggestedAt: true,
        suggestionNote: true,
        suggestionChanged: true,
      },
    });
    res.json({
      changed: suggestion.changed,
      explanation: suggestion.explanation,
      ...updated,
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    throw error;
  }
});

export default router;