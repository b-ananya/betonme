# BetOnMe: bet on yourself, your friends will collect

## Inspiration
Everyone has a group chat where someone says "I'm going to start running every day," and two days later nobody mentions it again. Habit apps don't fix this because they're private. You only let yourself down, and that's easy. What actually works is other people: a friend who'll notice when you miss, and a little embarrassment if you do.

Sports betting apps are great at making people care about outcomes. We pointed that energy at the people we care about.

## What it does
BetOnMe turns your friend group's goals into a live betting board.

1. **Bet on yourself.** Type a goal in plain words. The **AI Coach** makes it specific and provable ("Run ≥ 1.0 mi daily; proof = tracker screenshot"), sets honest odds as a sportsbook line, and drafts three punishments from mild to spicy, like *"sing Baby Shark in the dining hall."*
2. **Post proof daily.** Upload a photo. The **AI Referee** (Claude vision) checks it against your bet's terms. Friends can overrule the AI, so humans always get the final word.
3. **Friends back you or fade you** with squad coins (no real money), react, and talk trash in the comments. An AI sportscaster ticker narrates the board.
4. **Miss a day and you're BUSTED.** The AI writes the breaking-news headline, and you owe your punishment. You record it and post it on the **Wall of Shame** for the whole squad to watch.

## How AI is integrated
AI is part of every step of the loop:
- **Goal setting:** most habit attempts fail because the goal is vague or too ambitious. The coach scales the goal to something winnable, defines exactly what counts as proof, and calibrates odds using your past bets.
- **Verification:** the referee reviews each proof photo, which removes the awkwardness of friends having to call each other out. Friends can still overrule it, so AI handles the tedious part and people make the final call.
- **Stakes and storytelling:** punishments are generated to be funny, harmless, and filmable. Bust headlines and the live ticker turn a missed run into a moment the group talks about.

All calls use the Anthropic SDK with Claude and structured outputs (Zod schemas), so the UI always gets well-formed odds, verdicts, and punishments.

## How it strengthens human connection
Your friends are the core of the app. They're your refs, your backers, your hecklers, and your audience. Every check-in is a reason for a friend to react. Every bust ends in a shared, silly moment, usually a video the group will bring up for weeks. Accountability turns into something you do together instead of a chore you do alone.

## How we built it
Node + Express backend with a JSON store and Multer for photo and video uploads. The frontend is vanilla JS and CSS styled like a sportsbook: dark theme, odds buttons, a live ticker, and a bet slip. Claude powers the coach, referee, commentator, and headline writer. Each AI feature has an offline fallback so the live demo can't break. We scripted the demo video with Playwright and ffmpeg.

## Challenges
- Making odds feel *fair*. The coach has to be honest that most people overcommit, but still encouraging.
- Balancing AI judgment and human judgment. We settled on "AI refs, friends overrule."
- Keeping punishments funny and never cruel. The prompt rules out anything humiliating about identity or body, anything costly, and anything unsafe.

## What we learned
Stakes only feel real when they're social. The same goal hits differently when three friends have coins on it and a Baby Shark video is on the line.

## What's next
Real accounts and group invites, push reminders before midnight, Strava and Apple Health auto-proof, streak insurance, and group "parlays" where the whole squad bets together.

## Built with
`node.js` · `express` · `javascript` · `anthropic-claude` · `claude-vision` · `zod` · `multer` · `playwright` · `ffmpeg`
