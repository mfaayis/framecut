import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const UPLOAD_DIR = '/tmp/framecut-uploads';
const MEDIA_DIR = '/tmp/framecut-media';
const SESSION_STORE_PATH = '/tmp/framecut-sessions.json';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 250 * 1024 * 1024 },
});

interface StoredOAuthAccount {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  displayName: string;
  handle: string;
  avatarUrl?: string;
  accountType?: string;
  igUserId?: string;
  connectedAt: string;
}

interface PublishJobRecord {
  id: string;
  clipId: string;
  clipTitle: string;
  platform: 'youtube_shorts' | 'instagram_reels';
  status: 'scheduled' | 'publishing' | 'published' | 'failed';
  scheduledFor?: string;
  publishedUrl?: string;
  errorMessage?: string;
  createdAt: string;
}

interface SessionData {
  youtube?: StoredOAuthAccount;
  instagram?: StoredOAuthAccount;
  publishQueue: PublishJobRecord[];
}

function loadSessions(): Record<string, SessionData> {
  try {
    if (fs.existsSync(SESSION_STORE_PATH)) {
      const raw = fs.readFileSync(SESSION_STORE_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {
    // ignore corrupt temp store
  }
  return {};
}

function saveSessions(store: Record<string, SessionData>) {
  try {
    fs.writeFileSync(SESSION_STORE_PATH, JSON.stringify(store, null, 2));
  } catch {
    // non-fatal
  }
}

const sessionStore: Record<string, SessionData> = loadSessions();
const pendingOAuthStates = new Map<string, { sessionId: string; provider: 'youtube' | 'instagram'; createdAt: number }>();

function getAppUrl(): string {
  const raw = process.env.APP_URL || `http://localhost:${PORT}`;
  return raw.replace(/\/+$/, '');
}

function getOrCreateSession(req: express.Request, res: express.Response): { sessionId: string; data: SessionData } {
  let sid = req.cookies?.framecut_sid as string | undefined;
  if (!sid || typeof sid !== 'string' || sid.length < 16) {
    sid = crypto.randomBytes(24).toString('hex');
  }
  if (!sessionStore[sid]) {
    sessionStore[sid] = { publishQueue: [] };
    saveSessions(sessionStore);
  }
  res.cookie('framecut_sid', sid, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return { sessionId: sid, data: sessionStore[sid] };
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '').split('/')[0] || null;
    }
    if (parsed.hostname.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v) return v;
      const parts = parsed.pathname.split('/').filter(Boolean);
      if ((parts[0] === 'live' || parts[0] === 'shorts' || parts[0] === 'embed') && parts[1]) {
        return parts[1];
      }
    }
  } catch {
    return null;
  }
  return null;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchYouTubeContext(url: string, videoId: string | null) {
  let title = '';
  let author = '';
  let description = '';
  let thumbnailUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
  let durationSeconds = 0;
  let transcriptLines: Array<{ start: number; duration: number; text: string }> = [];

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const oembedRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(4000) });
    if (oembedRes.ok) {
      const data = (await oembedRes.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
      title = data.title || '';
      author = data.author_name || '';
      if (data.thumbnail_url) thumbnailUrl = data.thumbnail_url;
    }
  } catch {
    // continue to watch page inspection
  }

  if (videoId) {
    try {
      const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        signal: AbortSignal.timeout(4500),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FrameCutBot/1.0)',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (watchRes.ok) {
        const html = await watchRes.text();
        const lengthMatch = html.match(/"lengthSeconds":"(\d+)"/);
        if (lengthMatch) {
          durationSeconds = Number(lengthMatch[1]) || 0;
        }
        const descMatch = html.match(/"shortDescription":"((?:\\.|[^"\\])*)"/);
        if (descMatch) {
          try {
            description = JSON.parse(`"${descMatch[1]}"`);
          } catch {
            description = descMatch[1].replace(/\\n/g, '\n');
          }
        }
        if (!title) {
          const titleMatch = html.match(/<title>(.*?)<\/title>/);
          if (titleMatch) {
            title = decodeHtmlEntities(titleMatch[1].replace(/ - YouTube$/, ''));
          }
        }
        const captionMatch = html.match(/"captionTracks":(\[.*?\])/);
        if (captionMatch) {
          try {
            const tracks = JSON.parse(captionMatch[1]) as Array<{ baseUrl?: string; languageCode?: string }>;
            const preferred = tracks.find((t) => t.languageCode?.startsWith('en')) || tracks[0];
            if (preferred?.baseUrl) {
              const capRes = await fetch(preferred.baseUrl, { signal: AbortSignal.timeout(4000) });
              if (capRes.ok) {
                const xml = await capRes.text();
                const regex = /<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
                let m: RegExpExecArray | null;
                while ((m = regex.exec(xml)) !== null) {
                  const text = decodeHtmlEntities(m[3]);
                  if (text) {
                    transcriptLines.push({
                      start: Number(m[1]),
                      duration: Number(m[2]),
                      text,
                    });
                  }
                }
              }
            }
          } catch {
            // ignore caption JSON parse failure
          }
        }
      }
    } catch {
      // ignore watch page fetch failure
    }
  }

  return { title, author, description, thumbnailUrl, durationSeconds, transcriptLines };
}

function isRetryableGeminiError(err: any): boolean {
  const status = err?.status ?? err?.code;
  const msg = String(err?.message || '');
  return (
    status === 429 ||
    status === 503 ||
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('quota')
  );
}

function formatGeminiError(err: any): { status: number; message: string } {
  let msg = String(err?.message || '');
  // Extract human-readable message if the SDK threw raw JSON string
  if (msg.startsWith('{')) {
    try {
      const parsed = JSON.parse(msg);
      if (parsed?.error?.message) msg = String(parsed.error.message);
    } catch {
      // keep original
    }
  }

  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || err?.status === 429 || String(err?.message).includes('"code":429')) {
    return {
      status: 429,
      message:
        'Gemini API quota or rate limit exceeded. Wait a few seconds and retry, or select a billing-enabled API key in Settings > Secrets.',
    };
  }
  if (msg.includes('high demand') || msg.includes('UNAVAILABLE') || err?.status === 503 || String(err?.message).includes('"code":503')) {
    return {
      status: 503,
      message: 'The AI model is temporarily experiencing high demand. Please retry in a few seconds.',
    };
  }
  if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || err?.status === 403) {
    return {
      status: 403,
      message: 'Gemini API key is missing or invalid. Please check your key in Settings > Secrets.',
    };
  }
  return {
    status: 500,
    message: msg || 'Failed to analyze content with Gemini.',
  };
}

async function generateStructuredClipsWithRetry(
  ai: GoogleGenAI,
  contents: any,
  schema: any
) {
  const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      return await ai.models.generateContent({
        model,
        contents,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });
    } catch (err: any) {
      lastError = err;
      if (isRetryableGeminiError(err)) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

const clipResponseSchema = {
  type: Type.OBJECT,
  properties: {
    videoTitle: { type: Type.STRING },
    estimatedDurationSeconds: { type: Type.NUMBER },
    clips: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Punchy short clip title (4-8 words)' },
          hookHeadline: { type: Type.STRING, description: '3-5 word on-screen hook banner text' },
          startTime: { type: Type.NUMBER, description: 'Start timestamp in seconds' },
          endTime: { type: Type.NUMBER, description: 'End timestamp in seconds' },
          overallScore: { type: Type.INTEGER, description: 'Viral potential score 70-99' },
          hookStrength: { type: Type.INTEGER, description: 'First 3-second hook strength 70-99' },
          retentionPacing: { type: Type.INTEGER, description: 'Retention pacing score 70-99' },
          shareability: { type: Type.INTEGER, description: 'Shareability score 70-99' },
          recommendedTemplate: {
            type: Type.STRING,
            description: 'One of: auto_reframe, split_screen, blurred_cinema, podcast_focus, clean_minimal',
          },
          recommendedSubtitleStyle: {
            type: Type.STRING,
            description: 'One of: bold_impact, clean_editorial, karaoke_pill, minimal_mono, neon_kinetic',
          },
          recommendedPlatform: {
            type: Type.STRING,
            description: 'One of: both, youtube_shorts, instagram_reels',
          },
          socialCaption: { type: Type.STRING, description: 'Optimized caption for Reels and Shorts' },
          hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
          reasoning: { type: Type.STRING, description: 'Concise explanation of why this moment works' },
          subtitles: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                start: { type: Type.NUMBER, description: 'Relative start in seconds from 0' },
                end: { type: Type.NUMBER, description: 'Relative end in seconds' },
                text: { type: Type.STRING, description: 'Short 3-6 word caption line' },
                emphasisWord: { type: Type.STRING, description: 'Single keyword to highlight' },
              },
              required: ['start', 'end', 'text'],
            },
          },
        },
        required: [
          'title',
          'hookHeadline',
          'startTime',
          'endTime',
          'overallScore',
          'hookStrength',
          'retentionPacing',
          'shareability',
          'recommendedTemplate',
          'recommendedSubtitleStyle',
          'recommendedPlatform',
          'socialCaption',
          'hashtags',
          'reasoning',
          'subtitles',
        ],
      },
    },
  },
  required: ['videoTitle', 'estimatedDurationSeconds', 'clips'],
};

const VALID_TEMPLATES = new Set(['auto_reframe', 'split_screen', 'blurred_cinema', 'podcast_focus', 'clean_minimal']);
const VALID_SUB_STYLES = new Set(['bold_impact', 'clean_editorial', 'karaoke_pill', 'minimal_mono', 'neon_kinetic']);
const VALID_PLATFORMS = new Set(['both', 'youtube_shorts', 'instagram_reels']);

function normalizeClips(rawClips: any[], maxDuration: number) {
  return rawClips.map((c, idx) => {
    let start = Math.max(0, Number(c.startTime) || 0);
    let end = Math.max(start + 5, Number(c.endTime) || start + 25);
    if (maxDuration > 8 && end > maxDuration) {
      end = maxDuration;
      if (start >= end - 3) start = Math.max(0, end - 10);
    }
    const duration = Math.max(3, Number((end - start).toFixed(1)));
    const subs = Array.isArray(c.subtitles)
      ? c.subtitles.map((s: any, sIdx: number) => {
          const sStart = Math.max(0, Math.min(duration - 0.5, Number(s.start) || sIdx * 2));
          const sEnd = Math.max(sStart + 0.6, Math.min(duration, Number(s.end) || sStart + 2));
          return {
            id: `sub-${idx}-${sIdx}`,
            start: Number(sStart.toFixed(2)),
            end: Number(sEnd.toFixed(2)),
            text: String(s.text || '').trim(),
            emphasisWord: s.emphasisWord ? String(s.emphasisWord).trim() : undefined,
          };
        })
      : [];

    return {
      id: `clip-${Date.now()}-${idx}`,
      title: String(c.title || `Viral Moment ${idx + 1}`),
      hookHeadline: String(c.hookHeadline || 'WAIT FOR THIS'),
      startTime: Number(start.toFixed(1)),
      endTime: Number(end.toFixed(1)),
      duration,
      scores: {
        overall: Math.min(99, Math.max(70, Number(c.overallScore) || 88)),
        hookStrength: Math.min(99, Math.max(70, Number(c.hookStrength) || 90)),
        retentionPacing: Math.min(99, Math.max(70, Number(c.retentionPacing) || 86)),
        shareability: Math.min(99, Math.max(70, Number(c.shareability) || 85)),
      },
      recommendedTemplate: VALID_TEMPLATES.has(c.recommendedTemplate) ? c.recommendedTemplate : 'auto_reframe',
      recommendedSubtitleStyle: VALID_SUB_STYLES.has(c.recommendedSubtitleStyle)
        ? c.recommendedSubtitleStyle
        : 'bold_impact',
      recommendedPlatform: VALID_PLATFORMS.has(c.recommendedPlatform) ? c.recommendedPlatform : 'both',
      socialCaption: String(c.socialCaption || c.title || ''),
      hashtags: Array.isArray(c.hashtags) ? c.hashtags.map((h: any) => String(h)) : ['#shorts', '#reels'],
      reasoning: String(c.reasoning || 'Strong opening hook with clear pacing for vertical retention.'),
      subtitles: subs,
    };
  });
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.use(express.json({ limit: '25mb' }));

  // Serve rendered clips transiently for Instagram Graph API ingestion
  app.get('/api/media/:fileId', (req, res) => {
    const safeId = path.basename(req.params.fileId);
    const fullPath = path.join(MEDIA_DIR, safeId);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'Media file not found' });
      return;
    }
    res.sendFile(fullPath);
  });

  // 1. Analyze uploaded video or recorded live capture using Gemini Files API
  app.post('/api/analyze-video', upload.single('video'), async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No video file uploaded.' });
      return;
    }

    const clipCount = Math.min(10, Math.max(3, Number(req.body?.clipCount) || 5));
    const targetPlatform = String(req.body?.targetPlatform || 'both');
    const sourceLabel = String(req.body?.sourceType || 'upload');
    const knownDuration = Number(req.body?.durationSeconds) || 0;

    let uploadedGeminiFile: { name?: string; uri?: string; mimeType?: string } | null = null;

    try {
      const ai = getGeminiClient();
      const mimeType = file.mimetype && file.mimetype.startsWith('video/') ? file.mimetype : 'video/mp4';

      const uploadResp = await ai.files.upload({
        file: file.path,
        config: {
          mimeType,
          displayName: file.originalname || 'framecut-source.mp4',
        },
      });
      uploadedGeminiFile = uploadResp;

      // Poll until Gemini finishes processing the uploaded video
      let fileState = await ai.files.get({ name: uploadResp.name! });
      let attempts = 0;
      while (fileState.state === 'PROCESSING' && attempts < 45) {
        await new Promise((r) => setTimeout(r, 2000));
        fileState = await ai.files.get({ name: uploadResp.name! });
        attempts++;
      }

      if (fileState.state === 'FAILED') {
        throw new Error('Gemini video processing failed for this file format.');
      }
      if (!fileState.uri) {
        throw new Error('Uploaded video URI unavailable from Gemini Files API.');
      }

      const prompt = `You are an expert short-form viral video editor for YouTube Shorts and Instagram Reels.
Inspect the entire video carefully (both visual frames and spoken audio).
Identify ${clipCount} distinct high-retention viral short clips from this video.
Target platform focus: ${targetPlatform}.
${knownDuration > 0 ? `Source video total duration is ${knownDuration.toFixed(1)} seconds. All startTime and endTime values MUST stay strictly between 0 and ${knownDuration.toFixed(1)}.` : ''}
For short source videos under 45 seconds, create overlapping or focused sub-clips (minimum 4 seconds each) highlighting the strongest hooks, visual beats, or quotable moments so the user receives ${clipCount} usable short clips.
For each clip:
- Provide exact startTime and endTime in seconds.
- Transcribe or generate tightly synced relative subtitle cues (start from 0 up to clip duration, 3-6 words per cue, with an emphasisWord).
- Recommend the best vertical 9:16 layout template (auto_reframe, split_screen, blurred_cinema, podcast_focus, or clean_minimal) and subtitle style (bold_impact, clean_editorial, karaoke_pill, minimal_mono, or neon_kinetic).
- Write a punchy hookHeadline (3-5 words), socialCaption, hashtags, and concise reasoning.`;

      const response = await generateStructuredClipsWithRetry(
        ai,
        {
          parts: [
            {
              fileData: {
                fileUri: fileState.uri,
                mimeType: fileState.mimeType || mimeType,
              },
            },
            { text: prompt },
          ],
        },
        clipResponseSchema
      );

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);
      const maxDur = knownDuration > 0 ? knownDuration : Number(parsed.estimatedDurationSeconds) || 60;
      const clips = normalizeClips(Array.isArray(parsed.clips) ? parsed.clips : [], maxDur);

      res.json({
        sourceMeta: {
          sourceType: sourceLabel === 'livestream' ? 'livestream' : 'upload',
          title: parsed.videoTitle || file.originalname.replace(/\.[^/.]+$/, ''),
          durationSeconds: maxDur,
          hasRealTranscript: true,
        },
        clips,
      });
    } catch (error: any) {
      const formatted = formatGeminiError(error);
      if (formatted.status !== 429) {
        console.warn('Analyze video error:', formatted.message);
      }
      res.status(formatted.status).json({
        error: formatted.message,
      });
    } finally {
      if (file?.path && fs.existsSync(file.path)) {
        fs.unlink(file.path, () => {});
      }
      if (uploadedGeminiFile?.name) {
        try {
          const ai = getGeminiClient();
          await ai.files.delete({ name: uploadedGeminiFile.name });
        } catch {
          // ignore cleanup failure
        }
      }
    }
  });

  // 2. Analyze YouTube URL or Live Stream URL
  app.post('/api/analyze-url', async (req, res) => {
    const url = String(req.body?.url || '').trim();
    const clipCount = Math.min(10, Math.max(3, Number(req.body?.clipCount) || 6));
    const targetPlatform = String(req.body?.targetPlatform || 'both');
    const sourceType = req.body?.sourceType === 'livestream' ? 'livestream' : 'youtube';

    if (!url) {
      res.status(400).json({ error: 'Please provide a valid YouTube or live stream URL.' });
      return;
    }

    try {
      const ai = getGeminiClient();
      const videoId = extractYouTubeVideoId(url);
      const ytContext = await fetchYouTubeContext(url, videoId);

      const hasTranscript = ytContext.transcriptLines.length > 0;
      const formattedTranscript = hasTranscript
        ? ytContext.transcriptLines
            .slice(0, 180)
            .map((line) => `[${line.start.toFixed(1)}s] ${line.text}`)
            .join('\n')
        : '';

      const estimatedTotalDuration =
        ytContext.durationSeconds > 0
          ? ytContext.durationSeconds
          : hasTranscript
          ? Math.ceil(
              ytContext.transcriptLines[ytContext.transcriptLines.length - 1].start +
                ytContext.transcriptLines[ytContext.transcriptLines.length - 1].duration
            )
          : 900;

      const descriptionSnippet = ytContext.description ? ytContext.description.slice(0, 2500) : '';

      const prompt = `You are an elite short-form viral video editor creating ${clipCount} vertical clips (Instagram Reels & YouTube Shorts) from this content.
URL: ${url}
Source Type: ${sourceType}
Title: ${ytContext.title || 'Creator Broadcast'}
Channel / Creator: ${ytContext.author || 'Creator'}
Duration: ${estimatedTotalDuration} seconds
Target platform: ${targetPlatform}

${
  hasTranscript
    ? `Timestamped transcript from the video:\n${formattedTranscript}`
    : descriptionSnippet
    ? `Video description & chapters:\n${descriptionSnippet}`
    : `No captions were publicly exposed for this stream/video; infer realistic chapter segments and pacing from the title, creator, and URL context.`
}

Generate ${clipCount} distinct high-retention viral short clips (each 18-55 seconds long within 0..${estimatedTotalDuration}).
For each clip:
- Choose compelling hook startTime and endTime.
- Generate accurate relative subtitle cues (0 to clip duration, 3-6 words each, with an emphasisWord).
- Recommend layout template (auto_reframe, split_screen, blurred_cinema, podcast_focus, or clean_minimal) and subtitle style (bold_impact, clean_editorial, karaoke_pill, minimal_mono, or neon_kinetic).
- Provide viral score breakdown, hookHeadline, socialCaption, hashtags, and clear reasoning.`;

      const structuredResp = await generateStructuredClipsWithRetry(ai, prompt, clipResponseSchema);

      const parsed = JSON.parse((structuredResp.text ?? '{}').trim());
      const clips = normalizeClips(Array.isArray(parsed.clips) ? parsed.clips : [], estimatedTotalDuration);

      res.json({
        sourceMeta: {
          sourceType,
          title: ytContext.title || parsed.videoTitle || 'YouTube / Live Broadcast',
          author: ytContext.author || undefined,
          thumbnailUrl: ytContext.thumbnailUrl || undefined,
          youtubeVideoId: videoId || undefined,
          sourceUrl: url,
          durationSeconds: estimatedTotalDuration,
          hasRealTranscript: hasTranscript,
        },
        clips,
      });
    } catch (error: any) {
      const formatted = formatGeminiError(error);
      if (formatted.status !== 429) {
        console.warn('Analyze URL error:', formatted.message);
      }
      res.status(formatted.status).json({
        error: formatted.message,
      });
    }
  });

  // 3. Connected Accounts Status (YouTube & Instagram)
  app.get('/api/accounts', (req, res) => {
    const { data } = getOrCreateSession(req, res);
    const appUrl = getAppUrl();

    const ytConfigured = Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
    const igConfigured = Boolean(process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET);

    res.json({
      youtube: {
        connected: Boolean(data.youtube),
        provider: 'youtube',
        displayName: data.youtube?.displayName,
        handle: data.youtube?.handle,
        avatarUrl: data.youtube?.avatarUrl,
        connectedAt: data.youtube?.connectedAt,
        configured: ytConfigured,
        callbackUrl: `${appUrl}/auth/youtube/callback`,
        missingVars: ytConfigured ? [] : ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
      },
      instagram: {
        connected: Boolean(data.instagram),
        provider: 'instagram',
        displayName: data.instagram?.displayName,
        handle: data.instagram?.handle,
        avatarUrl: data.instagram?.avatarUrl,
        accountType: data.instagram?.accountType,
        connectedAt: data.instagram?.connectedAt,
        configured: igConfigured,
        callbackUrl: `${appUrl}/auth/instagram/callback`,
        missingVars: igConfigured ? [] : ['INSTAGRAM_CLIENT_ID', 'INSTAGRAM_CLIENT_SECRET'],
      },
    });
  });

  // 4. YouTube OAuth URL & Callback
  app.get('/api/oauth/youtube/url', (req, res) => {
    const { sessionId } = getOrCreateSession(req, res);
    const appUrl = getAppUrl();
    const callbackUrl = `${appUrl}/auth/youtube/callback`;

    if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) {
      res.status(400).json({
        error: 'YOUTUBE_OAUTH_NOT_CONFIGURED',
        message: 'Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in AI Studio Secrets to connect your YouTube channel.',
        missingVars: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
        callbackUrl,
      });
      return;
    }

    const state = crypto.randomBytes(16).toString('hex');
    pendingOAuthStates.set(state, { sessionId, provider: 'youtube', createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  });

  app.get(['/auth/youtube/callback', '/auth/youtube/callback/'], async (req, res) => {
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    const appUrl = getAppUrl();
    const callbackUrl = `${appUrl}/auth/youtube/callback`;

    const pending = pendingOAuthStates.get(state);
    pendingOAuthStates.delete(state);

    if (!code || !pending || pending.provider !== 'youtube') {
      res.status(400).send('<html><body><p>Invalid or expired YouTube OAuth state. You can close this window.</p></body></html>');
      return;
    }

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.YOUTUBE_CLIENT_ID!,
          client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
          redirect_uri: callbackUrl,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = (await tokenRes.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error?: string;
      };
      if (!tokenRes.ok || !tokens.access_token) {
        throw new Error(tokens.error || 'Failed to exchange YouTube OAuth code.');
      }

      const channelRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const channelData = (await channelRes.json()) as {
        items?: Array<{
          snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } };
        }>;
      };
      const ch = channelData.items?.[0]?.snippet;

      if (!sessionStore[pending.sessionId]) {
        sessionStore[pending.sessionId] = { publishQueue: [] };
      }
      sessionStore[pending.sessionId].youtube = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
        displayName: ch?.title || 'YouTube Channel',
        handle: ch?.customUrl || '@youtube',
        avatarUrl: ch?.thumbnails?.default?.url,
        connectedAt: new Date().toISOString(),
      };
      saveSessions(sessionStore);

      res.send(`
        <html>
          <body style="background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'youtube' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>YouTube connected. Closing window...</p>
          </body>
        </html>
      `);
    } catch (err: any) {
      res.status(500).send(`<html><body><p>YouTube OAuth Error: ${err?.message || 'Unknown error'}</p></body></html>`);
    }
  });

  // 5. Instagram OAuth URL & Callback
  app.get('/api/oauth/instagram/url', (req, res) => {
    const { sessionId } = getOrCreateSession(req, res);
    const appUrl = getAppUrl();
    const callbackUrl = `${appUrl}/auth/instagram/callback`;

    if (!process.env.INSTAGRAM_CLIENT_ID || !process.env.INSTAGRAM_CLIENT_SECRET) {
      res.status(400).json({
        error: 'INSTAGRAM_OAUTH_NOT_CONFIGURED',
        message: 'Set INSTAGRAM_CLIENT_ID and INSTAGRAM_CLIENT_SECRET in AI Studio Secrets to connect your Instagram account.',
        missingVars: ['INSTAGRAM_CLIENT_ID', 'INSTAGRAM_CLIENT_SECRET'],
        callbackUrl,
      });
      return;
    }

    const state = crypto.randomBytes(16).toString('hex');
    pendingOAuthStates.set(state, { sessionId, provider: 'instagram', createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id: process.env.INSTAGRAM_CLIENT_ID,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'instagram_business_basic,instagram_business_content_publish',
      state,
    });

    res.json({ url: `https://www.instagram.com/oauth/authorize?${params.toString()}` });
  });

  app.get(['/auth/instagram/callback', '/auth/instagram/callback/'], async (req, res) => {
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    const appUrl = getAppUrl();
    const callbackUrl = `${appUrl}/auth/instagram/callback`;

    const pending = pendingOAuthStates.get(state);
    pendingOAuthStates.delete(state);

    if (!code || !pending || pending.provider !== 'instagram') {
      res.status(400).send('<html><body><p>Invalid or expired Instagram OAuth state. You can close this window.</p></body></html>');
      return;
    }

    try {
      const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.INSTAGRAM_CLIENT_ID!,
          client_secret: process.env.INSTAGRAM_CLIENT_SECRET!,
          grant_type: 'authorization_code',
          redirect_uri: callbackUrl,
          code,
        }),
      });

      const tokenJson = (await tokenRes.json()) as { access_token?: string; user_id?: string | number; error_message?: string };
      if (!tokenRes.ok || !tokenJson.access_token) {
        throw new Error(tokenJson.error_message || 'Failed to exchange Instagram OAuth code.');
      }

      const meRes = await fetch(
        `https://graph.instagram.com/me?fields=id,username,name,account_type,profile_picture_url&access_token=${encodeURIComponent(
          tokenJson.access_token
        )}`
      );
      const meData = (await meRes.json()) as {
        id?: string;
        username?: string;
        name?: string;
        account_type?: string;
        profile_picture_url?: string;
      };

      if (!sessionStore[pending.sessionId]) {
        sessionStore[pending.sessionId] = { publishQueue: [] };
      }
      sessionStore[pending.sessionId].instagram = {
        accessToken: tokenJson.access_token,
        igUserId: meData.id || String(tokenJson.user_id || ''),
        displayName: meData.name || meData.username || 'Instagram Creator',
        handle: meData.username ? `@${meData.username}` : '@instagram',
        avatarUrl: meData.profile_picture_url,
        accountType: meData.account_type || 'BUSINESS',
        connectedAt: new Date().toISOString(),
      };
      saveSessions(sessionStore);

      res.send(`
        <html>
          <body style="background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'instagram' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Instagram connected. Closing window...</p>
          </body>
        </html>
      `);
    } catch (err: any) {
      res.status(500).send(`<html><body><p>Instagram OAuth Error: ${err?.message || 'Unknown error'}</p></body></html>`);
    }
  });

  app.post('/api/oauth/disconnect', (req, res) => {
    const { data } = getOrCreateSession(req, res);
    const provider = req.body?.provider;
    if (provider === 'youtube') delete data.youtube;
    if (provider === 'instagram') delete data.instagram;
    saveSessions(sessionStore);
    res.json({ ok: true });
  });

  // 6. Direct Automated Publishing Endpoints
  app.get('/api/publish/queue', (req, res) => {
    const { data } = getOrCreateSession(req, res);
    res.json({ queue: data.publishQueue || [] });
  });

  app.post('/api/publish/youtube', upload.single('video'), async (req, res) => {
    const { data } = getOrCreateSession(req, res);
    const file = req.file;
    const clipId = String(req.body?.clipId || 'clip');
    const title = String(req.body?.title || 'FrameCut Short').slice(0, 95);
    const description = String(req.body?.description || '');
    const privacyStatus = String(req.body?.privacyStatus || 'public');
    const scheduledFor = req.body?.scheduledFor ? String(req.body.scheduledFor) : undefined;

    try {
      if (!data.youtube?.accessToken) {
        res.status(401).json({ error: 'YouTube account is not connected. Connect YouTube first.' });
        return;
      }
      if (!file) {
        res.status(400).json({ error: 'Rendered clip video file is required for publishing.' });
        return;
      }

      // Refresh access token automatically if expired or expiring soon
      if (
        data.youtube.refreshToken &&
        data.youtube.expiresAt &&
        Date.now() > data.youtube.expiresAt - 60_000 &&
        process.env.YOUTUBE_CLIENT_ID &&
        process.env.YOUTUBE_CLIENT_SECRET
      ) {
        try {
          const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: process.env.YOUTUBE_CLIENT_ID,
              client_secret: process.env.YOUTUBE_CLIENT_SECRET,
              refresh_token: data.youtube.refreshToken,
              grant_type: 'refresh_token',
            }),
          });
          const refreshed = (await refreshRes.json()) as { access_token?: string; expires_in?: number };
          if (refreshRes.ok && refreshed.access_token) {
            data.youtube.accessToken = refreshed.access_token;
            if (refreshed.expires_in) {
              data.youtube.expiresAt = Date.now() + refreshed.expires_in * 1000;
            }
            saveSessions(sessionStore);
          }
        } catch {
          // proceed with existing token if refresh attempt fails
        }
      }

      const metadata = {
        snippet: {
          title: title.includes('#Shorts') ? title : `${title} #Shorts`.slice(0, 100),
          description: `${description}\n\n#Shorts`,
          categoryId: '22',
        },
        status: {
          privacyStatus: scheduledFor ? 'private' : privacyStatus,
          ...(scheduledFor ? { publishAt: new Date(scheduledFor).toISOString() } : {}),
          selfDeclaredMadeForKids: false,
        },
      };

      const boundary = `framecut_${crypto.randomBytes(8).toString('hex')}`;
      const videoBytes = fs.readFileSync(file.path);
      const part1 = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${
          file.mimetype || 'video/webm'
        }\r\n\r\n`
      );
      const part3 = Buffer.from(`\r\n--${boundary}--`);
      const bodyBuffer = Buffer.concat([part1, videoBytes, part3]);

      const ytRes = await fetch(
        'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${data.youtube.accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: bodyBuffer,
        }
      );

      const ytJson = (await ytRes.json()) as { id?: string; error?: { message?: string } };
      if (!ytRes.ok || !ytJson.id) {
        throw new Error(ytJson.error?.message || 'YouTube API upload failed.');
      }

      const job: PublishJobRecord = {
        id: `pub-${Date.now()}`,
        clipId,
        clipTitle: title,
        platform: 'youtube_shorts',
        status: scheduledFor ? 'scheduled' : 'published',
        scheduledFor,
        publishedUrl: `https://youtube.com/shorts/${ytJson.id}`,
        createdAt: new Date().toISOString(),
      };
      data.publishQueue.unshift(job);
      saveSessions(sessionStore);

      res.json({ job });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'YouTube publish error' });
    } finally {
      if (file?.path && fs.existsSync(file.path)) {
        fs.unlink(file.path, () => {});
      }
    }
  });

  app.post('/api/publish/instagram', upload.single('video'), async (req, res) => {
    const { data } = getOrCreateSession(req, res);
    const file = req.file;
    const clipId = String(req.body?.clipId || 'clip');
    const title = String(req.body?.title || 'FrameCut Reel');
    const caption = String(req.body?.caption || title);
    const appUrl = getAppUrl();

    try {
      if (!data.instagram?.accessToken || !data.instagram?.igUserId) {
        res.status(401).json({ error: 'Instagram account is not connected. Connect Instagram first.' });
        return;
      }
      if (!file) {
        res.status(400).json({ error: 'Rendered clip video file is required for publishing.' });
        return;
      }

      const mediaFilename = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}.mp4`;
      const mediaPath = path.join(MEDIA_DIR, mediaFilename);
      fs.copyFileSync(file.path, mediaPath);
      const publicMediaUrl = `${appUrl}/api/media/${mediaFilename}`;

      const createRes = await fetch(`https://graph.instagram.com/v21.0/${data.instagram.igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          media_type: 'REELS',
          video_url: publicMediaUrl,
          caption,
          share_to_feed: 'true',
          access_token: data.instagram.accessToken,
        }),
      });
      const createJson = (await createRes.json()) as { id?: string; error?: { message?: string } };
      if (!createRes.ok || !createJson.id) {
        throw new Error(createJson.error?.message || 'Failed to create Instagram Reels container.');
      }

      const publishRes = await fetch(`https://graph.instagram.com/v21.0/${data.instagram.igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          creation_id: createJson.id,
          access_token: data.instagram.accessToken,
        }),
      });
      const publishJson = (await publishRes.json()) as { id?: string; error?: { message?: string } };
      if (!publishRes.ok || !publishJson.id) {
        throw new Error(publishJson.error?.message || 'Instagram Reel publishing failed.');
      }

      const job: PublishJobRecord = {
        id: `pub-${Date.now()}`,
        clipId,
        clipTitle: title,
        platform: 'instagram_reels',
        status: 'published',
        publishedUrl: `https://www.instagram.com/${data.instagram.handle.replace('@', '')}/reels/`,
        createdAt: new Date().toISOString(),
      };
      data.publishQueue.unshift(job);
      saveSessions(sessionStore);

      res.json({ job });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Instagram publish error' });
    } finally {
      if (file?.path && fs.existsSync(file.path)) {
        fs.unlink(file.path, () => {});
      }
    }
  });

  // Prevent /api/* requests from ever falling through to HTML SPA fallback
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Vite dev middleware or production static files
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FrameCut server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
