// scripts/generate.js
// Requires: ANTHROPIC_API_KEY, PERPLEXITY_API_KEY env vars
// Optional: RESEND_API_KEY to send email newsletter

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RECIPIENT_EMAIL = "hbz4cf@virginia.edu";

const SPORTS = [
  { name: "Soccer & World Cup", query: "What are the biggest soccer news stories this week? Include FIFA World Cup 2026 updates, major Premier League, La Liga, Champions League news. What matches happened, who scored, any upsets or drama?" },
  { name: "NFL", query: "What are the most important NFL news stories this week? Include trades, signings, training camp news, injuries, and any major developments." },
  { name: "NBA", query: "What are the biggest NBA news stories this week? Include trades, free agency, Summer League, injuries, and major developments." },
  { name: "MLB", query: "What are the most important MLB news stories this week? Include standings, big games, trades, injuries, and notable performances." },
  { name: "F1", query: "What are the biggest Formula 1 news stories this week? Include race results, standings, team news, driver updates." },
  { name: "Tennis", query: "What are the most important tennis news stories this week? Include tournament results, upsets, player news, rankings changes." },
  { name: "NHL", query: "What are the biggest NHL news stories this week? Include trades, free agency, signings, draft news." },
  { name: "College Sports", query: "What are the biggest college sports news stories this week? Include football, basketball, transfers, recruiting, and major results." },
  { name: "Golf", query: "What are the most important golf news stories this week? Include PGA Tour results, leaderboards, player news, major championship updates." },
];

async function fetchNewsForSport(sport) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY not set");

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        {
          role: "system",
          content: `You are a sports news researcher. Today is ${today}. Focus ONLY on news from the past 7 days. Be specific with scores, names, and facts. Do not make things up.`
        },
        {
          role: "user",
          content: sport.query
        }
      ],
      search_recency_filter: "week",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Perplexity error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

async function rankAndFilterSports(client, sportResults) {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const summary = sportResults
    .map((s) => `${s.sport}: ${s.news.slice(0, 200)}...`)
    .join("\n\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Today is ${today}. Based on these sport summaries, rank them from most to least newsworthy/timely this week. Consider: active tournaments, recent major results, breaking news, trade deadlines, playoffs. Return ONLY a JSON array of sport names in order, most important first. Example: ["Soccer & World Cup", "NBA", "NFL"]. Here are the summaries:\n\n${summary}`,
      },
    ],
  });

  try {
    const text = message.content[0].text.trim();
    const clean = text.replace(/```json|```/g, "").trim();
    const ranked = JSON.parse(clean);
    return ranked;
  } catch {
    return sportResults.map((s) => s.sport);
  }
}

async function generateSection(client, sport, rawNews) {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const prompt = `You're writing the ${sport} section of a casual, conversational weekly sports digest called "The Weekly Rundown." Today is ${today}.

Here is this week's news for ${sport}:
${rawNews}

Write 2-3 stories based ONLY on actual events mentioned above — do not invent anything. For each story:
- A punchy, specific headline with real names/teams (rewrite with personality, not a generic title)
- 2-3 sentences of casual commentary. Like a knowledgeable friend catching you up. Light humor welcome.
- A short tag (1-3 words): "Trade Rumors", "Standings", "Injury Update", "Big Win", "Drama", "Results", "Transfer", etc.

Return ONLY valid JSON, no markdown:
{
  "sport": "${sport}",
  "stories": [
    {
      "headline": "...",
      "body": "...",
      "tag": "..."
    }
  ]
}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 900,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].text.trim();
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

async function generateIntro(client, sections) {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const headlines = sections
    .slice(0, 4)
    .flatMap((s) => s.stories.slice(0, 1).map((st) => `${s.sport}: ${st.headline}`))
    .join(", ");

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Write a 2-sentence casual intro for a weekly sports digest called "The Weekly Rundown." Today is ${today}. This week's biggest stories: ${headlines}. Keep it breezy and specific — reference actual events, not generic filler.`,
      },
    ],
  });

  return message.content[0].text.trim();
}

function digestToHtml(intro, sections) {
  const sportIcons = {
    "Soccer & World Cup": "🏆", NFL: "🏈", NBA: "🏀", MLB: "⚾",
    "College Sports": "🎓", F1: "🏎️", Tennis: "🎾", NHL: "🏒", Golf: "⛳",
  };

  const sectionsHtml = sections.map((s) => `
    <h2 style="font-family:sans-serif;margin-top:32px;font-size:18px;">${sportIcons[s.sport] || "📰"} ${s.sport}</h2>
    ${s.stories.map((st) => `
      <div style="margin-bottom:20px;padding:16px;background:#f9f9f9;border-radius:8px;">
        <strong style="font-family:sans-serif;font-size:15px;">${st.headline}</strong>
        <span style="display:inline-block;margin-left:8px;font-size:11px;background:#e8ff47;color:#000;padding:2px 8px;border-radius:4px;font-family:sans-serif;">${st.tag}</span>
        <p style="font-family:sans-serif;font-size:14px;color:#444;margin-top:8px;line-height:1.6;">${st.body}</p>
      </div>
    `).join("")}
  `).join("");

  const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return `
    <div style="max-width:600px;margin:0 auto;padding:24px;font-family:sans-serif;">
      <div style="border-bottom:2px solid #e8ff47;padding-bottom:16px;margin-bottom:24px;">
        <h1 style="margin:0;font-size:28px;">⚡ The Weekly Rundown</h1>
        <p style="margin:4px 0 0;color:#888;font-size:13px;">${date}</p>
      </div>
      <p style="color:#555;font-size:15px;line-height:1.6;">${intro}</p>
      ${sectionsHtml}
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;text-align:center;">
        <p style="font-size:12px;color:#999;">Generated by AI · Updated every Monday</p>
      </div>
    </div>
  `;
}

async function sendEmail(digest) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set");

  const date = new Date(digest.generatedAt).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const html = digestToHtml(digest.intro, digest.sections);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: "The Weekly Rundown <onboarding@resend.dev>",
      to: [RECIPIENT_EMAIL],
      subject: `⚡ The Weekly Rundown — ${date}`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${res.status} ${err}`);
  }

  return await res.json();
}

async function main() {
  console.log("🏆 Generating sports digest...\n");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Step 1: Fetch all news in parallel
  const sportResults = [];
  await Promise.all(
    SPORTS.map(async (sport) => {
      process.stdout.write(`Fetching ${sport.name} news...\n`);
      try {
        const news = await fetchNewsForSport(sport);
        sportResults.push({ sport: sport.name, news });
        console.log(`✓ Got ${sport.name} news`);
      } catch (err) {
        console.log(`✗ Skipped ${sport.name} (${err.message})`);
      }
    })
  );

  // Step 2: Rank sports by newsworthiness this week
  console.log("\nRanking sports by newsworthiness...");
  const rankedOrder = await rankAndFilterSports(client, sportResults);
  console.log(`Order: ${rankedOrder.join(" → ")}`);

  // Step 3: Generate sections in ranked order
  const sections = [];
  const orderedResults = rankedOrder
    .map((name) => sportResults.find((s) => s.sport === name))
    .filter(Boolean);

  for (const sportResult of orderedResults) {
    try {
      process.stdout.write(`Writing ${sportResult.sport} section...`);
      const section = await generateSection(client, sportResult.sport, sportResult.news);
      sections.push(section);
      console.log(` ✓`);
    } catch (err) {
      console.log(` ✗ (${err.message})`);
    }
  }

  // Step 4: Generate intro
  console.log("\nWriting intro...");
  const intro = await generateIntro(client, sections);

  const digest = {
    generatedAt: new Date().toISOString(),
    intro,
    sections,
  };

  const outputPath = path.join(__dirname, "../public/digest.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(digest, null, 2));

  console.log(`\n✅ Digest written to public/digest.json`);
  console.log(`   ${sections.length} sports covered`);

  // Step 5: Send email
  if (process.env.RESEND_API_KEY) {
    try {
      process.stdout.write("\nSending email via Resend...");
      await sendEmail(digest);
      console.log(` ✅ Email sent to ${RECIPIENT_EMAIL}!`);
    } catch (err) {
      console.log(` ✗ Email failed (${err.message})`);
    }
  } else {
    console.log("\nℹ️  Skipping email (RESEND_API_KEY not set)");
  }
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
