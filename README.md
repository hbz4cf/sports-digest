# The Weekly Rundown 🏆

AI-powered sports digest, auto-updated every Monday.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Get your API keys
- **Anthropic API key**: https://console.anthropic.com
- **NewsAPI key** (free tier works): https://newsapi.org

### 3. Run locally
```bash
# Generate your first digest
ANTHROPIC_API_KEY=your_key NEWS_API_KEY=your_key npm run generate

# Start the dev server
npm run dev
```

### 4. Deploy to Vercel

```bash
npm install -g vercel
vercel
```

### 5. Set up weekly auto-updates (GitHub Actions)

1. Push this repo to GitHub
2. Go to **Settings → Secrets and variables → Actions**
3. Add two secrets:
   - `ANTHROPIC_API_KEY`
   - `NEWS_API_KEY`
4. The workflow in `.github/workflows/weekly-digest.yml` runs every Monday at 8am UTC automatically. You can also trigger it manually from the Actions tab.

## How it works

1. `scripts/generate.js` fetches recent headlines from NewsAPI for each sport
2. Sends them to Claude with a prompt defining the casual, conversational voice
3. Claude returns structured JSON for each sport section
4. The output is saved to `public/digest.json`
5. The React frontend reads that file and renders the digest
6. Vercel serves it as a static site

## Customization

- **Add/remove sports**: Edit the `SPORTS` array in `scripts/generate.js`
- **Change the voice**: Edit the prompt in `generateSection()`
- **Rename the digest**: Update `logo-title` in `App.jsx` and the `<title>` in `index.html`
