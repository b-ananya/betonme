// AI layer: every feature calls Claude when ANTHROPIC_API_KEY is set,
// and falls back to a lightweight offline heuristic so the demo never breaks.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const MODEL = "claude-opus-5-5";
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
export const aiMode = client ? "claude" : "offline";

async function ask(schema, system, content) {
  if (!client) return null;
  try {
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(schema) },
      system,
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason === "refusal") return null;
    return res.parsed_output;
  } catch (err) {
    console.error("[ai] falling back:", err.status ?? "", err.message);
    return null;
  }
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const toAmerican = (pct) =>
  pct >= 50 ? `-${Math.round((pct / (100 - pct)) * 100)}` : `+${Math.round(((100 - pct) / pct) * 100)}`;

/* ---------- 1. Goal coach: vague intention -> bettable SMART goal ---------- */

const CoachSchema = z.object({
  title: z.string().describe("Punchy 2-5 word bet name, like a sportsbook market"),
  goal: z.string().describe("Specific, measurable daily goal in one sentence"),
  proof: z.string().describe("Exactly what photo/screenshot counts as proof each day"),
  durationDays: z.number().int().describe("Suggested length of the bet in days (3-30)"),
  successPct: z.number().int().describe("Realistic probability (5-95) this person completes it"),
  oddsReasoning: z.string().describe("One sentence, sportscaster voice, why these odds"),
  punishments: z
    .array(z.object({ text: z.string(), spice: z.number().int().describe("1 mild, 2 medium, 3 spicy") }))
    .describe("Exactly 3 funny, harmless, recordable punishments, one per spice level"),
  tip: z.string().describe("One concrete tip to actually win the bet"),
});

const COACH_SYSTEM = `You are the AI coach inside BetOnMe, a social app where friends bet on themselves to build good habits.
If they miss a daily check-in, they must do a punishment and post a recording of it for their friends.
Turn the user's vague intention into a bet they can realistically win: make it specific, measurable, and verifiable with a daily photo.
Scale ambition down if it sounds like a beginner (habits beat heroics). Odds should be honest - most people overcommit.
Punishments must be funny, harmless, legal, cheap, not humiliating about identity or body, and filmable in under a minute.`;

export async function coachGoal(text, history = []) {
  const ctx = history.length
    ? `\n\nTheir past bets (use to calibrate odds): ${history.map((b) => `${b.title}: ${b.status}`).join("; ")}`
    : "";
  const out = await ask(CoachSchema, COACH_SYSTEM, `My goal: "${text}"${ctx}`);
  if (out) return { ...out, line: toAmerican(out.successPct), source: "claude" };
  return { ...offlineCoach(text), source: "offline" };
}

function offlineCoach(text) {
  const t = text.toLowerCase();
  const presets = [
    { k: /run|jog|mile|5k|cardio/, title: "Daily Mile Club", goal: "Run at least 1 mile every day, any pace.", proof: "Screenshot of your run tracker showing distance ≥ 1.0 mi and today's date.", pct: 58, tip: "Lay out your shoes the night before - the hardest step is the first one out the door." },
    { k: /read|book/, title: "10 Pages a Day", goal: "Read 10 pages of a physical or e-book every day.", proof: "Photo of the page you finished on, with the page number visible.", pct: 66, tip: "Stack it onto something you already do - read right after brushing your teeth." },
    { k: /water|hydrat/, title: "Hydration Station", goal: "Drink 2 liters of water every day.", proof: "Photo of your marked water bottle at its last line before bed.", pct: 71, tip: "Mark hourly lines on your bottle so you're never 'catching up' at 11pm." },
    { k: /sleep|bed|wake|morning/, title: "Lights Out by 11", goal: "Be in bed with your phone across the room by 11:00pm.", proof: "Photo of your phone charging away from your bed with the clock showing before 11:00.", pct: 44, tip: "Set a 10:30 alarm that means 'start winding down', not 'go to sleep'." },
    { k: /gym|lift|workout|fit|push|exercise/, title: "Show Up Sweaty", goal: "Do a 20-minute workout every day.", proof: "Post-workout selfie plus a screenshot of the timer or tracker.", pct: 52, tip: "Lower the bar on bad days - 20 minutes of anything still counts as a win." },
    { k: /phone|screen|social|tiktok|instagram/, title: "Screen Time Under 3", goal: "Keep daily screen time under 3 hours.", proof: "Screenshot of your Screen Time / Digital Wellbeing total for the day.", pct: 39, tip: "Move your three most-used apps off your home screen tonight." },
    { k: /study|code|leetcode|learn|practice/, title: "Daily Deep Work", goal: "Do 45 focused minutes of study every day.", proof: "Photo of your notes or screen with a timer showing 45:00.", pct: 55, tip: "Pick tomorrow's topic before you stop today so you start instantly." },
  ];
  const p = presets.find((x) => x.k.test(t)) ?? {
    title: "Lock In Daily", goal: `Make daily progress on: ${text.trim()} (15 min minimum).`,
    proof: "A photo that clearly shows you doing it today.", pct: 50,
    tip: "Make the minimum so small you can't say no - 15 minutes is enough to keep the streak alive.",
  };
  return {
    title: p.title, goal: p.goal, proof: p.proof, durationDays: 7, successPct: p.pct, line: toAmerican(p.pct),
    oddsReasoning: p.pct < 50
      ? "The books like the underdog story, but the sharp money says week-one motivation fades fast."
      : "Slight favorite - doable daily ask, but every streak gets tested around day four.",
    punishments: [
      { text: "Post a video doing 25 jumping jacks while narrating why you failed.", spice: 1 },
      { text: "Let the group chat pick your profile picture for 3 days.", spice: 2 },
      { text: "Record yourself singing 'Baby Shark' in a public place, full chorus.", spice: 3 },
    ],
    tip: p.tip,
  };
}

/* ---------- 2. Proof referee: does this photo prove today's goal? ---------- */

const VerdictSchema = z.object({
  approved: z.boolean(),
  confidence: z.number().int().describe("0-100"),
  reason: z.string().describe("One short sentence on what you saw"),
  hype: z.string().describe("One short, fun, sportscaster-style reaction for the friend feed"),
});

export async function verifyProof(bet, caption, image) {
  if (image && client) {
    const out = await ask(
      VerdictSchema,
      `You are the impartial AI referee for BetOnMe. Decide if the photo plausibly proves the person did today's goal.
Be fair but not gullible: a random selfie doesn't prove a run. If it's ambiguous, reject with a helpful reason - their friends can overrule you.`,
      [
        { type: "image", source: { type: "base64", media_type: image.mime, data: image.base64 } },
        { type: "text", text: `Goal: ${bet.goal}\nRequired proof: ${bet.proof}\nTheir caption: "${caption}"` },
      ]
    );
    if (out) return { ...out, source: "claude" };
  }
  const hasImage = !!image;
  return {
    approved: hasImage,
    confidence: hasImage ? 82 : 10,
    reason: hasImage ? "Proof matches the bet terms." : "No photo attached - the refs need receipts.",
    hype: hasImage
      ? pick(["AND THE STREAK LIVES! 🔥", "Money in the bank. Faders in shambles.", "Clutch. Absolutely clutch.", "Another day, another W. The backers are eating good."])
      : "No receipts, no points.",
    source: "offline",
  };
}

/* ---------- 3. Commentator: sportscaster ticker for the board ---------- */

const TickerSchema = z.object({ lines: z.array(z.string()).describe("4-6 short ticker lines, max 90 chars each") });

export async function commentary(board) {
  const out = await ask(
    TickerSchema,
    `You are the hype sportscaster for BetOnMe, a friend group's habit-betting board. Write punchy ESPN-ticker lines about
the live bets: streaks, who's due today, who busted and owes a punishment, where the coins are. Playful roasting is fine, never mean.`,
    JSON.stringify(board)
  );
  if (out?.lines?.length) return { lines: out.lines, source: "claude" };
  const lines = [];
  for (const b of board) {
    if (b.status === "busted") lines.push(`🚨 BUSTED: ${b.user} owes the squad: "${b.punishment}"`);
    else if (b.status === "won") lines.push(`🏆 ${b.user} cashed "${b.title}". Backers get paid.`);
    else if (!b.checkedInToday) lines.push(`⏰ ${b.user} still hasn't posted for "${b.title}" today. Clock's ticking...`);
    else lines.push(`🔥 ${b.user} is ${b.streak} for ${b.streak} on "${b.title}" (${b.line})`);
  }
  return { lines, source: "offline" };
}

/* ---------- 4. Bust announcement when someone misses ---------- */

const BustSchema = z.object({ headline: z.string().describe("Dramatic but kind breaking-news headline, max 80 chars") });

export async function bustHeadline(bet, user) {
  const out = await ask(
    BustSchema,
    "Write a dramatic, playful sports breaking-news headline about a friend who missed their habit bet. Kind, never cruel.",
    `${user} missed day ${bet.checkins.length + 1} of "${bet.title}" (${bet.goal}). Punishment owed: ${bet.punishment}`
  );
  return out?.headline ?? `BREAKING: ${user}'s "${bet.title}" streak snapped. Punishment incoming.`;
}
