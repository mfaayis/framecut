# FrameCut — AI Viral Video Clipping & Auto-Publishing Studio

Turn long-form YouTube videos, uploaded footage, and live streams into vertical Instagram Reels and YouTube Shorts with optimized subtitles, dynamic layout templates, and automated publishing.

## Features

- **AI-Powered Clip Detection** — Gemini identifies the highest-retention hooks and viral segments
- **5 Dynamic Layout Templates** — Auto-Reframe, Split Reaction, Blurred Cinema, Podcast Two-Shot, Clean Minimal
- **5 Subtitle Styles** — Bold Impact, Clean Editorial, Karaoke Highlight, Minimal Mono, Kinetic Pop
- **Live Canvas Preview** — Real-time 9:16 composition preview with playback controls
- **Browser-Based Export** — Render trimmed vertical WebM clips directly in your browser
- **Direct Publishing** — Push clips to YouTube Shorts and Instagram Reels via OAuth

## Getting Started

### Prerequisites

- Node.js 18+ 
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/)

### Local Development

```bash
npm install --legacy-peer-deps
cp .env.example .env
# Add your GEMINI_API_KEY to .env
npm run dev
```

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/framecut)

1. Push to GitHub
2. Import the repo in Vercel
3. Add `GEMINI_API_KEY` as an environment variable
4. Deploy!

## Tech Stack

- **Frontend**: React 19, Vite 8, Tailwind CSS 4, Motion (Framer Motion)
- **Backend**: Express (local dev) / Vercel Serverless Functions (production)
- **AI**: Google Gemini API via `@google/genai`
- **Icons**: Lucide React

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | Google Gemini API key |
| `YOUTUBE_CLIENT_ID` | Optional | YouTube OAuth client ID |
| `YOUTUBE_CLIENT_SECRET` | Optional | YouTube OAuth client secret |
| `INSTAGRAM_CLIENT_ID` | Optional | Instagram OAuth client ID |
| `INSTAGRAM_CLIENT_SECRET` | Optional | Instagram OAuth client secret |
