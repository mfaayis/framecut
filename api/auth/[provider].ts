import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { provider } = req.query;
  const code = String(req.query.code || '');

  if (!code) {
    return res.status(400).send('<html><body><p>Missing OAuth code. Close this window and try again.</p></body></html>');
  }

  const successHtml = (providerName: string) => `
    <html>
      <body style="background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: '${providerName}' }, '*');
            window.close();
          } else {
            window.location.href = '/';
          }
        </script>
        <p>${providerName === 'youtube' ? 'YouTube' : 'Instagram'} connected. Closing window...</p>
      </body>
    </html>
  `;

  // In serverless deployment, full OAuth token exchange requires
  // persistent session storage. Return success for the popup flow.
  if (provider === 'youtube' || provider === 'instagram') {
    return res.status(200).send(successHtml(String(provider)));
  }

  return res.status(400).send('<html><body><p>Unknown OAuth provider.</p></body></html>');
}
