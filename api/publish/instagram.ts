import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.status(501).json({
    error: 'Direct publishing requires OAuth tokens. Please connect your Instagram account and use the app locally for direct publishing.',
  });
}
