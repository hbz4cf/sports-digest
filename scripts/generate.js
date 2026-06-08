// scripts/generate.js
// Run: node scripts/generate.js
// Requires: ANTHROPIC_API_KEY and NEWS_API_KEY env vars

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SPORTS = [
  { name: "NFL", query: "NFL football news" },
  { name: "NBA", query: "NBA basketball news" },
  { name: "MLB", query: "MLB baseball news" },
  { name: "College Sports", query: "college football basketball NCAA news" },
  { name: "Soccer/EPL", query: "Premier League soccer football news" },
  { name: "F1", query: "Formula 1 F1 racing news" },
  { name: "Tennis", query: "tennis ATP WTA news" },
  { name: "NHL", query: "NHL hockey news" },
  { name: "Golf", query: "PGA golf news" },
];

async function fetchNewsForSport(sport) {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) throw new Error("NEWS_API_KEY not set");

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(sport.query)}&sortBy=publishedAt&pageSize=5&language=en&apiKey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NewsAPI error for ${sport.name}: ${res.status}`);
  const data = await res.json();

  return data.articles
    .slice(0, 5)
    .map((a) => `- ${a.title}: ${a.description || ""}`)
    .join("\n");
}

async function generateSection(client, sport, rawNews) {
  const prompt = `You're writing the ${sport.name} section of a casual, conversational weekly sports digest called "The Weekly Rundown." 

Here are this week's raw headlines and news snippets for ${sport.name}:
${rawNews}

Write a digest section with 2-3 stories. For each story:
- A punchy headline (not just the article title — rewrite it with personality)
- 2-3 sentences of casual, conversational commentary. Not dry recapping — more like a knowledgeable friend catching you up. Light humor is welcome but don't force it.
- A short tag (1-3 words) categorizing the story type, like "Trade Rumors", "Standings", "Injury Update", "Big Win", "Drama", etc.

Return ONLY valid JSON in this exact format, no markdown:
{
  "sport": "${sport.name}",
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
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].text.trim();
  return JSON.parse(text);
}

async function generateIntro(client, sections) {
  const headlines = sections
    .flatMap((s) => s.stories.slice(0, 1).map((st) => `${s.sport}: ${st.headline}`))
    .join(", ");

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Write a 2-sentence casual intro for a weekly sports digest called "The Weekly Rundown." This week's biggest stories include: ${headlines}. Keep it breezy and fun, like a friend kicking off a recap.`,
      },
    ],
  });

  return message.content[0].text.trim();
}

async function main() {
  console.log("🏆 Generating sports digest...\n");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const sections = [];

  for (const sport of SPORTS) {
    try {
      process.stdout.write(`Fetching ${sport.name} news...`);
      const rawNews = await fetchNewsForSport(sport);
      process.stdout.write(" ✓ Writing section...");
      const section = await generateSection(client, sport, rawNews);
      sections.push(section);
      console.log(` ✓ Done`);
    } catch (err) {
      console.log(` ✗ Skipped (${err.message})`);
    }
  }

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
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
