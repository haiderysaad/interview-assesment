import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { OAuth2Client } from "google-auth-library";
import { GRACE_MS, deadlineOf, cleanAnswers, seededShuffle, finalizeAttempt } from "../attempts.js";
import { SUPPORTED_LANGUAGES } from "../jdoodle.js";
import { assembleCandidateCode, extractCandidateCode } from "../technicalCode.js";

const googleClient = new OAuth2Client();
const limitOf = (value, fallback) => (Number.isInteger(value) && value >= 0 ? value : fallback);
const hasRequiredRounds = (rounds) =>
  rounds.some((round) => round.type === "APTITUDE") &&
  rounds.some((round) => round.type === "TECHNICAL");

// Public routes. Nothing here may ever return `correct`, score or totalMarks.
const router = Router();

async function getContext(req, res) {
  const candidate = await prisma.candidate.findUnique({
    where: { token: req.params.token },
    include: {
      attempts: true,
      violations: { select: { type: true }, take: 1 },
      session: {
        include: {
          rounds: {
            where: { type: "APTITUDE" },
            include: { questions: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
  const round = candidate?.session.rounds[0];
  if (!candidate || !round || candidate.session.status === "DRAFT") {
    res.status(404).json({ error: "This test link is not valid" });
    return null;
  }
  let attempt = candidate.attempts.find((a) => a.roundId === round.id) ?? null;
  if (attempt && !attempt.submittedAt && Date.now() > deadlineOf(attempt, round) + GRACE_MS)
    attempt = await finalizeAttempt(attempt, round, true);
  return { candidate, session: candidate.session, round, attempt };
}

function stateOf(session, attempt) {
  if (attempt?.submittedAt) return "SUBMITTED";
  if (attempt) return "IN_PROGRESS";
  const now = Date.now();
  if (session.status === "CLOSED" || now > session.endsAt.getTime()) return "CLOSED";
  if (now < session.startsAt.getTime()) return "NOT_OPEN";
  return "READY";
}

function testPayload(round, attempt) {
  let questions = round.questions;
  if (round.shuffleQuestions) questions = seededShuffle(questions, `${attempt.id}:questions`);
  return {
    remainingSec: Math.max(0, Math.floor((deadlineOf(attempt, round) - Date.now()) / 1000)),
    answers: attempt.answers,
    questions: questions.map((q) => {
      let options = q.options.map((text, id) => ({ id, text }));
      if (round.shuffleOptions) options = seededShuffle(options, `${attempt.id}:${q.id}`);
      return { id: q.id, type: q.type, text: q.text, marks: q.marks, negativeMarks: q.negativeMarks, options };
    }),
  };
}

router.get("/join/:shareToken", async (req, res) => {
  const session = await prisma.interviewSession.findUnique({
    where: { shareToken: req.params.shareToken },
    select: {
      title: true,
      role: true,
      status: true,
      rounds: { select: { type: true } },
    },
  });
  if (!session || session.status === "DRAFT")
    return res.status(404).json({ error: "This test link is not valid" });
  if (!hasRequiredRounds(session.rounds))
    return res.status(400).json({ error: "This interview link must include both aptitude and technical rounds" });
  res.json({
    title: session.title,
    role: session.role,
    hasAptitudeRound: session.rounds.some((round) => round.type === "APTITUDE"),
    hasTechnicalRound: session.rounds.some((round) => round.type === "TECHNICAL"),
  });
});

router.post("/join/:shareToken/login", async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID)
    return res.status(500).json({ error: "GOOGLE_CLIENT_ID is not set on the server" });

  const session = await prisma.interviewSession.findUnique({
    where: { shareToken: req.params.shareToken },
    select: {
      id: true,
      status: true,
      rounds: { select: { type: true } },
    },
  });
  if (!session || session.status === "DRAFT")
    return res.status(404).json({ error: "This test link is not valid" });
  if (!hasRequiredRounds(session.rounds))
    return res.status(400).json({ error: "This interview link must include both aptitude and technical rounds" });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: String(req.body?.credential || ""),
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: "Google sign-in failed. Please try again." });
  }
  if (!payload?.email || !payload.email_verified)
    return res.status(401).json({ error: "Your Google email is not verified" });

  const candidate = await prisma.candidate.findUnique({
    where: { sessionId_email: { sessionId: session.id, email: payload.email.toLowerCase() } },
  });
  if (!candidate) return res.status(403).json({ error: "NOT_ALLOWED" });

  res.json({
    token: candidate.token,
    hasAptitudeRound: session.rounds.some((round) => round.type === "APTITUDE"),
    hasTechnicalRound: session.rounds.some((round) => round.type === "TECHNICAL"),
  });
});

router.get("/:token", async (req, res) => {
  const ctx = await getContext(req, res);
  if (!ctx) return;
  const { candidate, session, round, attempt } = ctx;
  res.json({
    candidateName: candidate.name,
    removed: candidate.violations.length > 0,
    title: session.title,
    role: session.role,
    description: session.description,
    proctoring: {
      fullscreenRequired: session.proctoring?.fullscreenRequired === true,
      webcamRequired: session.proctoring?.webcamRequired === true,
      screenShareRequired: session.proctoring?.screenShareRequired === true,
      blockCopyPaste: session.proctoring?.blockCopyPaste === true,
      maxTabSwitches: limitOf(session.proctoring?.maxTabSwitches, 3),
      maxFullscreenExits: limitOf(session.proctoring?.maxFullscreenExits, 0),
    },
    durationMin: round.durationMin,
    questionCount: round.questions.length,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    state: stateOf(session, attempt),
  });
});

router.post("/:token/start", async (req, res) => {
  const ctx = await getContext(req, res);
  if (!ctx) return;
  const { candidate, session, round } = ctx;
  let { attempt } = ctx;

  if (attempt?.submittedAt)
    return res.status(409).json({ error: "You have already submitted this test" });
  if (!attempt) {
    const state = stateOf(session, null);
    if (state !== "READY")
      return res.status(403).json({ error: state === "NOT_OPEN" ? "This test has not opened yet" : "This test is closed" });
    try {
      attempt = await prisma.attempt.create({ data: { candidateId: candidate.id, roundId: round.id } });
    } catch (e) {
      if (e.code !== "P2002") throw e;
      attempt = await prisma.attempt.findUnique({
        where: { candidateId_roundId: { candidateId: candidate.id, roundId: round.id } },
      });
    }
  }
  res.json(testPayload(round, attempt));
});

router.put("/:token/answers", async (req, res) => {
  const ctx = await getContext(req, res);
  if (!ctx) return;
  const { round, attempt } = ctx;
  if (!attempt) return res.status(409).json({ error: "Start the test first" });
  if (attempt.submittedAt) return res.status(409).json({ error: "This test is already submitted" });
  await prisma.attempt.update({
    where: { id: attempt.id },
    data: { answers: cleanAnswers(round.questions, req.body?.answers) },
  });
  res.json({ ok: true });
});

router.post("/:token/submit", async (req, res) => {
  const ctx = await getContext(req, res);
  if (!ctx) return;
  const { round, attempt } = ctx;
  if (!attempt) return res.status(409).json({ error: "Start the test first" });
  if (!attempt.submittedAt) {
    const answers =
      req.body?.answers === undefined ? attempt.answers : cleanAnswers(round.questions, req.body.answers);
    await finalizeAttempt({ ...attempt, answers }, round, false);
  }
  res.json({ ok: true }); // deliberately no score
});

router.get("/:token/technical", async (req, res) => {
  const candidate = await prisma.candidate.findUnique({
    where: { token: req.params.token },
    include: {
      attempts: true,
      session: {
        include: {
          rounds: {
            where: { type: { in: ["APTITUDE", "TECHNICAL"] } },
            select: {
              id: true,
              type: true,
              durationMin: true,
              _count: { select: { questions: true, technicalQuestions: true } },
            },
          },
        },
      },
    },
  });
  if (!candidate || candidate.session.status === "DRAFT")
    return res.status(404).json({ error: "This test link is not valid" });

  const aptitudeRound = candidate.session.rounds.find((round) => round.type === "APTITUDE");
  const technicalRound = candidate.session.rounds.find((round) => round.type === "TECHNICAL");
  if (!aptitudeRound || !technicalRound)
    return res.status(404).json({ error: "This assessment does not have both required rounds" });

  const aptitudeAttempt = candidate.attempts.find((attempt) => attempt.roundId === aptitudeRound.id);
  if (!aptitudeAttempt?.submittedAt)
    return res.status(403).json({ error: "Complete the aptitude round before opening the technical round" });

  const [roundDetails, submissions] = await Promise.all([
    prisma.round.findUnique({
      where: { id: technicalRound.id },
      include: { technicalQuestions: { orderBy: { order: "asc" } } },
    }),
    prisma.technicalSubmission.findMany({
      where: {
        candidateId: candidate.id,
        question: { roundId: technicalRound.id },
      },
      select: { questionId: true, language: true, code: true, submittedAt: true },
    }),
  ]);
  const submissionsByQuestion = new Map(submissions.map((submission) => [submission.questionId, submission]));
  res.json({
    title: candidate.session.title,
    role: candidate.session.role,
    candidateName: candidate.name,
    technicalDurationMin: technicalRound.durationMin,
    technicalQuestionCount: technicalRound._count.technicalQuestions,
    startsAt: candidate.session.startsAt,
    endsAt: candidate.session.endsAt,
    languages: SUPPORTED_LANGUAGES,
    questions: roundDetails.technicalQuestions.map((question) => ({
      id: question.id,
      title: question.title,
      difficulty: question.difficulty,
      statement: question.statement,
      inputFormat: question.inputFormat,
      outputFormat: question.outputFormat,
      starterCode: question.starterCode,
      constraints: question.constraints,
      examples: question.examples,
      marks: question.marks,
      existingSubmission: (() => {
        const submission = submissionsByQuestion.get(question.id);
        return submission
          ? {
              language: submission.language,
              candidateCode: extractCandidateCode(
                question.starterCode,
                submission.language,
                submission.code,
              ),
              submittedAt: submission.submittedAt,
            }
          : null;
      })(),
    })),
  });
});

router.put("/:token/technical/submissions", async (req, res) => {
  const candidate = await prisma.candidate.findUnique({
    where: { token: req.params.token },
    include: {
      attempts: true,
      session: { include: { rounds: { where: { type: { in: ["APTITUDE", "TECHNICAL"] } } } } },
    },
  });
  if (!candidate || candidate.session.status === "DRAFT")
    return res.status(404).json({ error: "This test link is not valid" });
  if (candidate.session.status !== "PUBLISHED")
    return res.status(403).json({ error: "This interview is closed" });
  const now = Date.now();
  if (now < candidate.session.startsAt.getTime() || now > candidate.session.endsAt.getTime())
    return res.status(403).json({ error: "This interview is not currently open" });

  const aptitudeRound = candidate.session.rounds.find((round) => round.type === "APTITUDE");
  const technicalRound = candidate.session.rounds.find((round) => round.type === "TECHNICAL");
  if (!aptitudeRound || !technicalRound)
    return res.status(400).json({ error: "This assessment does not have both required rounds" });
  const aptitudeAttempt = candidate.attempts.find((attempt) => attempt.roundId === aptitudeRound?.id);
  if (!aptitudeAttempt?.submittedAt)
    return res.status(403).json({ error: "Complete the aptitude round before submitting technical answers" });

  const { questionId, language, candidateCode } = req.body ?? {};
  console.log("Technical submit language:", language);
  if (typeof questionId !== "string" || !questionId)
    return res.status(400).json({ error: "Choose a technical question" });
  if (!SUPPORTED_LANGUAGES.includes(language))
    return res.status(400).json({ error: "Choose a supported programming language" });
  if (typeof candidateCode !== "string" || !candidateCode.trim())
    return res.status(400).json({ error: "Code cannot be empty" });
  if (candidateCode.length > 50_000)
    return res.status(413).json({ error: "Code is too large to submit (maximum 50 KB)" });

  const question = await prisma.technicalQuestion.findFirst({
    where: { id: questionId, roundId: technicalRound.id },
    select: { id: true, starterCode: true },
  });
  if (!question) return res.status(404).json({ error: "Technical question not found" });
  const code = assembleCandidateCode(question.starterCode, language, candidateCode);
  if (code.length > 50_000)
    return res.status(413).json({ error: "Complete program is too large to submit (maximum 50 KB)" });

  const submission = await prisma.technicalSubmission.upsert({
    where: { candidateId_questionId: { candidateId: candidate.id, questionId } },
    create: { candidateId: candidate.id, questionId, language, code },
    update: {
      language,
      code,
      submittedAt: new Date(),
      evaluation: Prisma.DbNull,
      evaluatedAt: null,
      suggestedCode: null,
      suggestedAt: null,
      suggestionNote: null,
      suggestionChanged: null,
    },
    select: { questionId: true, language: true, submittedAt: true },
  });
  res.json({ ok: true, submission });
});

const VIOLATION_TYPES = ["TAB_SWITCH", "FULLSCREEN_EXIT", "COPY_PASTE"];

router.post("/:token/violation", async (req, res) => {
  const ctx = await getContext(req, res);
  if (!ctx) return;
  const { candidate, session, round, attempt } = ctx;
  const type = req.body?.type;
  if (!VIOLATION_TYPES.includes(type)) return res.status(400).json({ error: "Invalid violation" });
  if (!attempt || attempt.submittedAt) return res.json({ removed: false });

  const policy = session.proctoring ?? {};
  const max =
    type === "TAB_SWITCH" ? limitOf(policy.maxTabSwitches, 3)
    : type === "FULLSCREEN_EXIT" ? limitOf(policy.maxFullscreenExits, 0)
    : 0;
  const count = (await prisma.violation.count({ where: { candidateId: candidate.id, type } })) + 1;
  const removed = count > max;
  await prisma.violation.create({
    data: { candidateId: candidate.id, type, ...(removed && { meta: { removed: true } }) },
  });
  if (!removed) return res.json({ removed: false, count, max });
  const answers =
    req.body?.answers === undefined ? attempt.answers : cleanAnswers(round.questions, req.body.answers);
  await finalizeAttempt({ ...attempt, answers }, round, true);
  res.json({ removed: true });
});

export default router;