import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  // In serverless mode, OAuth disconnect is stateless
  if (req.method === 'POST') {
    return res.json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
