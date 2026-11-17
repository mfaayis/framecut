import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }
  return new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
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

  const tasks: Promise<any>[] = [];

  // Task 1: oEmbed (fast, lightweight metadata)
  tasks.push(
    (async () => {
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const data = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
          if (data.title) title = data.title;
          if (data.author_name) author = data.author_name;
          if (data.thumbnail_url) thumbnailUrl = data.thumbnail_url;
        }
      } catch {
        // non-fatal
      }
    })()
  );

  // Task 2: Watch page (for duration & captions)
  if (videoId) {
    tasks.push(
      (async () => {
        try {
          const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            signal: AbortSignal.timeout(2500),
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          });
          if (watchRes.ok) {
            const html = await watchRes.text();
            const lengthMatch = html.match(/"lengthSeconds":"(\d+)"/);
            if (lengthMatch) durationSeconds = Number(lengthMatch[1]) || 0;
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
              if (titleMatch) title = decodeHtmlEntities(titleMatch[1].replace(/ - YouTube$/, ''));
            }
            const captionMatch = html.match(/"captionTracks":(\[.*?\])/);
            if (captionMatch) {
              try {
                const tracks = JSON.parse(captionMatch[1]) as Array<{ baseUrl?: string; languageCode?: string }>;
                const preferred = tracks.find((t) => t.languageCode?.startsWith('en')) || tracks[0];
                if (preferred?.baseUrl) {
                  const capRes = await fetch(preferred.baseUrl, { signal: AbortSignal.timeout(1500) });
                  if (capRes.ok) {
                    const xml = await capRes.text();
                    const regex = /<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
                    let m: RegExpExecArray | null;
                    while ((m = regex.exec(xml)) !== null) {
                      const text = decodeHtmlEntities(m[3]);
                      if (text) transcriptLines.push({ start: Number(m[1]), duration: Number(m[2]), text });
                    }
                  }
                }
              } catch {
                // ignore
              }
            }
          }
        } catch {
          // ignore
        }
      })()
    );
  }

  await Promise.allSettled(tasks);
  return { title, author, description, thumbnailUrl, durationSeconds, transcriptLines };
}

function isRetryableGeminiError(err: any): boolean {
  const status = err?.status ?? err?.code;
  const msg = String(err?.message || '');
  return (
    status === 429 || status === 503 || msg.includes('429') || msg.includes('503') ||
    msg.includes('RESOURCE_EXHAUSTED') || msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') || msg.includes('quota')
  );
}

function formatGeminiError(err: any): { status: number; message: string } {
  let msg = String(err?.message || '');
  if (msg.startsWith('{')) {
    try { const parsed = JSON.parse(msg); if (parsed?.error?.message) msg = String(parsed.error.message); } catch { /* keep */ }
  }
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || err?.status === 429) {
    return { status: 429, message: 'Gemini API quota exceeded. Wait a few seconds and retry.' };
  }
  if (msg.includes('high demand') || msg.includes('UNAVAILABLE') || err?.status === 503) {
    return { status: 503, message: 'The AI model is temporarily experiencing high demand. Please retry.' };
  }
  if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || err?.status === 403) {
    return { status: 403, message: 'Gemini API key is missing or invalid.' };
  }
  return { status: 500, message: msg || 'Failed to analyze content with Gemini.' };
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
          title: { type: Type.STRING },
          hookHeadline: { type: Type.STRING },
          startTime: { type: Type.NUMBER },
          endTime: { type: Type.NUMBER },
          overallScore: { type: Type.INTEGER },
          hookStrength: { type: Type.INTEGER },
          retentionPacing: { type: Type.INTEGER },
          shareability: { type: Type.INTEGER },
          recommendedTemplate: { type: Type.STRING },
          recommendedSubtitleStyle: { type: Type.STRING },
          recommendedPlatform: { type: Type.STRING },
          socialCaption: { type: Type.STRING },
          hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
          reasoning: { type: Type.STRING },
          subtitles: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                start: { type: Type.NUMBER },
                end: { type: Type.NUMBER },
                text: { type: Type.STRING },
                emphasisWord: { type: Type.STRING },
              },
              required: ['start', 'end', 'text'],
            },
          },
        },
        required: ['title','hookHeadline','startTime','endTime','overallScore','hookStrength','retentionPacing','shareability','recommendedTemplate','recommendedSubtitleStyle','recommendedPlatform','socialCaption','hashtags','reasoning','subtitles'],
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
      recommendedSubtitleStyle: VALID_SUB_STYLES.has(c.recommendedSubtitleStyle) ? c.recommendedSubtitleStyle : 'bold_impact',
      recommendedPlatform: VALID_PLATFORMS.has(c.recommendedPlatform) ? c.recommendedPlatform : 'both',
      socialCaption: String(c.socialCaption || c.title || ''),
      hashtags: Array.isArray(c.hashtags) ? c.hashtags.map((h: any) => String(h)) : ['#shorts', '#reels'],
      reasoning: String(c.reasoning || 'Strong opening hook with clear pacing for vertical retention.'),
      subtitles: subs,
    };
  });
}

async function generateStructuredClipsWithRetry(ai: GoogleGenAI, contents: any, schema: any) {
  const modelsToTry = ['gemini-2.5-flash'];
  let lastError: any = null;
  for (const model of modelsToTry) {
    try {
      return await ai.models.generateContent({
        model,
        contents,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          thinkingConfig: { thinkingBudget: 0 },
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = String(req.body?.url || '').trim();
  const clipCount = Math.min(10, Math.max(3, Number(req.body?.clipCount) || 6));
  const targetPlatform = String(req.body?.targetPlatform || 'both');
  const sourceType = req.body?.sourceType === 'livestream' ? 'livestream' : 'youtube';

  if (!url) {
    return res.status(400).json({ error: 'Please provide a valid YouTube or live stream URL.' });
  }

  try {
    const ai = getGeminiClient();
    const videoId = extractYouTubeVideoId(url);
    const ytContext = await fetchYouTubeContext(url, videoId);

    const hasTranscript = ytContext.transcriptLines.length > 0;
    const formattedTranscript = hasTranscript
      ? ytContext.transcriptLines.slice(0, 180).map((line) => `[${line.start.toFixed(1)}s] ${line.text}`).join('\n')
      : '';

    const estimatedTotalDuration =
      ytContext.durationSeconds > 0
        ? ytContext.durationSeconds
        : hasTranscript
        ? Math.ceil(ytContext.transcriptLines[ytContext.transcriptLines.length - 1].start + ytContext.transcriptLines[ytContext.transcriptLines.length - 1].duration)
        : 900;

    const descriptionSnippet = ytContext.description ? ytContext.description.slice(0, 2500) : '';

    const prompt = `You are an elite short-form viral video editor creating ${clipCount} vertical clips (Instagram Reels & YouTube Shorts) from this content.
URL: ${url}
Source Type: ${sourceType}
Title: ${ytContext.title || 'Creator Broadcast'}
Channel / Creator: ${ytContext.author || 'Creator'}
Duration: ${estimatedTotalDuration} seconds
Target platform: ${targetPlatform}

${hasTranscript ? `Timestamped transcript from the video:\n${formattedTranscript}` : descriptionSnippet ? `Video description & chapters:\n${descriptionSnippet}` : `No captions were publicly exposed; infer realistic chapter segments from the title and context.`}

Generate ${clipCount} distinct high-retention viral short clips (each 18-55 seconds long within 0..${estimatedTotalDuration}).
For each clip:
- Choose compelling hook startTime and endTime.
- Generate accurate relative subtitle cues (0 to clip duration, 3-6 words each, with an emphasisWord).
- Recommend layout template and subtitle style.
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
    res.status(formatted.status).json({ error: formatted.message });
  }
}
