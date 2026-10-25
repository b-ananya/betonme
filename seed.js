// Demo data: a friend group mid-week, with one live streak, one bet due today,
// one busted friend who already posted their punishment, and one winner.
const ck = (day, extra = {}) => ({
  day, caption: "", file: null, mime: null, approved: true, confidence: 90,
  reason: "Proof matches the bet terms.", hype: "Streak alive.", overruledBy: [], ts: Date.now() - (20 - day) * 864e5, ...extra,
});

const base = (o) => ({
  refs: [], status: "active", backers: [], faders: [], punishmentProof: null,
  reactions: {}, comments: [], createdAt: Date.now(), oddsReasoning: "", tip: "", ...o,
});

export function seed() {
  return {
    day: 12,
    users: [
      { id: "alex", name: "Alex", color: "#00e676", coins: 450 },
      { id: "jordan", name: "Jordan", color: "#40c4ff", coins: 425 },
      { id: "priya", name: "Priya", color: "#ff4081", coins: 450 },
      { id: "marcus", name: "Marcus", color: "#ffab40", coins: 410 },
      { id: "sam", name: "Sam", color: "#b388ff", coins: 760 },
    ],
    bets: [
      base({
        id: "sam-sleep", userId: "sam", title: "Lights Out by 11", goal: "In bed, phone across the room, by 11:00pm.",
        proof: "Photo of phone charging away from bed before 11:00.", durationDays: 7, startDay: 1,
        punishment: "Wear a full suit to every class for a day.", spice: 2, successPct: 44, line: "+127",
        checkins: [1, 2, 3, 4, 5, 6, 7].map((d) => ck(d)), status: "won",
        backers: [{ userId: "priya", amount: 50 }], faders: [{ userId: "jordan", amount: 50 }],
        reactions: { "🏆": ["priya", "alex"] },
      }),
      base({
        id: "marcus-food", userId: "marcus", title: "No DoorDash Week", goal: "Zero food delivery orders for 7 days.",
        proof: "Screenshot of empty DoorDash order history for today.", durationDays: 7, startDay: 5,
        punishment: "Sing 'Baby Shark' (full chorus, with hand motions) in the dining hall.", spice: 3,
        successPct: 35, line: "+186", status: "busted", bustDay: 9,
        headline: "BREAKING: Marcus folds to 2AM wings on day 5. Dining hall concert scheduled.",
        checkins: [5, 6, 7, 8].map((d) => ck(d)),
        backers: [{ userId: "alex", amount: 25 }], faders: [{ userId: "sam", amount: 100 }, { userId: "jordan", amount: 50 }],
        punishmentProof: { file: "/seed-media/marcus-punishment.mp4", mime: "video/mp4", caption: "never ordering wings again 😭", ts: Date.now() - 2 * 864e5 },
        reactions: { "😂": ["jordan", "priya", "sam", "alex"], "🔥": ["sam"], "🫡": ["priya"] },
        comments: [
          { userId: "sam", text: "thank you for your service (and my 285 coins)", ts: Date.now() - 2 * 864e5 },
          { userId: "priya", text: "the hand motions were COMMITTED", ts: Date.now() - 2 * 864e5 },
        ],
      }),
      base({
        id: "jordan-run", userId: "jordan", title: "Daily Mile Club", goal: "Run at least 1 mile every day, any pace.",
        proof: "Run tracker screenshot showing ≥ 1.0 mi and today's date.", durationDays: 14, startDay: 8,
        punishment: "Do the worm across the main quad and post it.", spice: 3, successPct: 58, line: "-138",
        oddsReasoning: "Jordan's a former cross-country kid - but 14 straight days is a long season.",
        checkins: [8, 9, 10, 11].map((d) => ck(d)).concat([
          ck(12, { file: "/seed-media/jordan-run.png", mime: "image/png", caption: "1.3 before class. cold but we move", hype: "FIVE FOR FIVE. The man does not miss. 🔥", reason: "Tracker shows 1.31 mi today." }),
        ]),
        backers: [{ userId: "alex", amount: 50 }, { userId: "sam", amount: 100 }], faders: [{ userId: "marcus", amount: 50 }],
        reactions: { "🔥": ["alex", "sam", "priya"], "💪": ["sam"] },
        comments: [
          { userId: "sam", text: "5 for 5 let's gooo", ts: Date.now() - 3600e3 },
          { userId: "marcus", text: "fading till my last coin", ts: Date.now() - 1800e3 },
        ],
      }),
      base({
        id: "priya-read", userId: "priya", title: "10 Pages a Day", goal: "Read 10 pages of a book every day.",
        proof: "Photo of the page you finished on, page number visible.", durationDays: 7, startDay: 10,
        punishment: "Post a video doing a dramatic reading of your Spotify Wrapped in a British accent.", spice: 2, successPct: 66, line: "-194",
        checkins: [10, 11].map((d) => ck(d)),
        backers: [{ userId: "jordan", amount: 50 }], faders: [{ userId: "marcus", amount: 25 }],
      }),
      base({
        id: "alex-gym", userId: "alex", title: "Show Up Sweaty", goal: "Do a 20-minute workout every day.",
        proof: "Post-workout selfie or tracker screenshot with the timer.", durationDays: 7, startDay: 11,
        punishment: "Record yourself singing 'Happy Birthday' to a stranger's dog.", spice: 2, successPct: 52, line: "-108",
        oddsReasoning: "Coin flip with a slight edge - day 2 is where most gym streaks die.",
        checkins: [ck(11)],
        backers: [{ userId: "priya", amount: 50 }], faders: [{ userId: "jordan", amount: 25 }],
      }),
    ],
  };
}
