import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }
  return new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
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
      recommendedTemplate: VALID_TEMPLATES.has(c.recommendedTemplate) ? c.recommendedTemplate : 'split_screen',
      recommendedSubtitleStyle: VALID_SUB_STYLES.has(c.recommendedSubtitleStyle) ? c.recommendedSubtitleStyle : 'bold_impact',
      recommendedPlatform: VALID_PLATFORMS.has(c.recommendedPlatform) ? c.recommendedPlatform : 'both',
      socialCaption: String(c.socialCaption || c.title || ''),
      hashtags: Array.isArray(c.hashtags) ? c.hashtags.map((h: any) => String(h)) : ['#shorts', '#reels'],
      reasoning: String(c.reasoning || 'Strong opening hook with clear pacing for vertical retention.'),
      subtitles: subs,
    };
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const fileName = String(req.body?.fileName || 'Uploaded Footage').replace(/\.[^/.]+$/, '');
  const durationSeconds = Math.max(5, Number(req.body?.durationSeconds) || 60);
  const clipCount = Math.min(8, Math.max(2, Number(req.body?.clipCount) || 4));
  const targetPlatform = String(req.body?.targetPlatform || 'both');
  const sourceType = req.body?.sourceType === 'livestream' ? 'livestream' : 'upload';

  try {
    const ai = getGeminiClient();

    const prompt = `You are an elite viral short-form video editor for YouTube Shorts and Instagram Reels.
A creator has uploaded their video footage:
Title / File: "${fileName}"
Total Duration: ${durationSeconds.toFixed(1)} seconds
Target Platform: ${targetPlatform}
Requested Clip Count: ${clipCount}

Generate ${clipCount} distinct viral short segments from this video.
Rules:
- All startTime and endTime must be strictly within 0 and ${durationSeconds.toFixed(1)} seconds.
- Each clip duration should be between 15 and 45 seconds (or proportional if source video is short).
- Recommend dynamic layout template: 'split_screen' (reaction / two-shot), 'auto_reframe' (solo subject), 'blurred_cinema', 'podcast_focus', or 'clean_minimal'.
- Recommend subtitle style: 'bold_impact' (all-caps with yellow highlights), 'neon_kinetic' (kinetic pop), 'clean_editorial', or 'karaoke_pill'.
- For each clip, generate 3 to 8 subtitle lines with relative start/end seconds from 0 to clip duration, punchy 3-5 word lines, and an emphasisWord to highlight.
- Write a 3-5 word hookHeadline (e.g. "HE REALLY SAID THIS?!", "WAIT TILL THE END").`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: clipResponseSchema,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    const clips = normalizeClips(Array.isArray(parsed.clips) ? parsed.clips : [], durationSeconds);

    res.json({
      sourceMeta: {
        sourceType,
        title: parsed.videoTitle || fileName,
        durationSeconds,
        hasRealTranscript: false,
      },
      clips,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to analyze uploaded video.' });
  }
}
