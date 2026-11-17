import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { provider } = req.query;

  if (provider === 'youtube') {
    return handleYouTubeOAuth(req, res);
  }
  if (provider === 'instagram') {
    return handleInstagramOAuth(req, res);
  }
  if (provider === 'disconnect') {
    return res.json({ ok: true, message: 'Disconnected (stateless in serverless mode).' });
  }

  return res.status(400).json({ error: 'Unknown OAuth provider.' });
}

function getAppUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.APP_URL || 'http://localhost:3000';
}

function handleYouTubeOAuth(req: VercelRequest, res: VercelResponse) {
  const appUrl = getAppUrl();
  const callbackUrl = `${appUrl}/auth/youtube/callback`;

  if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) {
    return res.status(400).json({
      error: 'YOUTUBE_OAUTH_NOT_CONFIGURED',
      message: 'Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in Vercel Environment Variables.',
      missingVars: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
      callbackUrl,
    });
  }

  const state = crypto.randomBytes(16).toString('hex');
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
}

function handleInstagramOAuth(req: VercelRequest, res: VercelResponse) {
  const appUrl = getAppUrl();
  const callbackUrl = `${appUrl}/auth/instagram/callback`;

  if (!process.env.INSTAGRAM_CLIENT_ID || !process.env.INSTAGRAM_CLIENT_SECRET) {
    return res.status(400).json({
      error: 'INSTAGRAM_OAUTH_NOT_CONFIGURED',
      message: 'Set INSTAGRAM_CLIENT_ID and INSTAGRAM_CLIENT_SECRET in Vercel Environment Variables.',
      missingVars: ['INSTAGRAM_CLIENT_ID', 'INSTAGRAM_CLIENT_SECRET'],
      callbackUrl,
    });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_CLIENT_ID,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'instagram_business_basic,instagram_business_content_publish',
    state,
  });

  res.json({ url: `https://www.instagram.com/oauth/authorize?${params.toString()}` });
}
