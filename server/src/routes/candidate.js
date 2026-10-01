import { Router } from "express";
import { prisma } from "../prisma.js";
import { GRACE_MS, deadlineOf, cleanAnswers, seededShuffle, finalizeAttempt } from "../attempts.js";

// Public routes. Nothing here may ever return `correct`, score or totalMarks.
const router = Router();

async function getContext(req, res) {
  const candidate = await prisma.candidate.findUnique({
    where: { token: req.params.token },
    include: {
      attempts: true,
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

router.get("/:token", async (req, res) => {
  const ctx = await getContext(req, res);
  if (!ctx) return;
  const { candidate, session, round, attempt } = ctx;
  res.json({
    candidateName: candidate.name,
    title: session.title,
    role: session.role,
    description: session.description,
    proctoring: {
      fullscreenRequired: session.proctoring?.fullscreenRequired === true,
      webcamRequired: session.proctoring?.webcamRequired === true,
      screenShareRequired: session.proctoring?.screenShareRequired === true,
      blockCopyPaste: session.proctoring?.blockCopyPaste === true,
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

export default router;