import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const appUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.APP_URL || 'http://localhost:3000';

  const ytConfigured = Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
  const igConfigured = Boolean(process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET);

  res.json({
    youtube: {
      connected: false,
      provider: 'youtube',
      configured: ytConfigured,
      callbackUrl: `${appUrl}/auth/youtube/callback`,
      missingVars: ytConfigured ? [] : ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
    },
    instagram: {
      connected: false,
      provider: 'instagram',
      configured: igConfigured,
      callbackUrl: `${appUrl}/auth/instagram/callback`,
      missingVars: igConfigured ? [] : ['INSTAGRAM_CLIENT_ID', 'INSTAGRAM_CLIENT_SECRET'],
    },
  });
}
