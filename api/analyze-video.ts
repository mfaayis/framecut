import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Video upload analysis requires the Gemini Files API which needs
  // a persistent file system. In the serverless Vercel environment,
  // we return a helpful message directing users to use URL analysis instead.
  res.status(501).json({
    error: 'Direct video upload is not supported in this deployment. Please use a YouTube URL for analysis, or run the app locally for file upload support.',
  });
}
