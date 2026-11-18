import { useCallback, useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { Navbar } from './components/Navbar';
import { LandingView } from './components/LandingView';
import { StudioWorkspace } from './components/StudioWorkspace';
import { LiveCaptureModal } from './components/LiveCaptureModal';
import {
  AccountsState,
  GeneratedClip,
  PublishJob,
  TargetPlatform,
  VideoSourceMeta,
} from './types';
import { synthesizeSampleFootageVideo } from './utils/videoExporter';

const DEFAULT_ACCOUNTS: AccountsState = {
  youtube: {
    connected: false,
    provider: 'youtube',
    configured: false,
    callbackUrl: `${window.location.origin}/auth/youtube/callback`,
  },
  instagram: {
    connected: false,
    provider: 'instagram',
    configured: false,
    callbackUrl: `${window.location.origin}/auth/instagram/callback`,
  },
};

function probeVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.src = url;
    v.onloadedmetadata = () => {
      const dur = Number.isFinite(v.duration) ? v.duration : 0;
      URL.revokeObjectURL(url);
      resolve(dur);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
  });
}

async function parseApiJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (res.status === 504 || res.status === 502 || text.trim().startsWith('<')) {
      throw new Error('The request timed out or the server returned an unexpected response. Please retry.');
    }
    throw new Error(text || `Unexpected server response (${res.status})`);
  }
}

export default function App() {
  const [activeView, setActiveView] = useState<'landing' | 'studio'>('landing');
  const [accounts, setAccounts] = useState<AccountsState>(DEFAULT_ACCOUNTS);
  const [publishQueue, setPublishQueue] = useState<PublishJob[]>([]);
  const [oauthFeedback, setOauthFeedback] = useState<string | null>(null);

  const [sourceMeta, setSourceMeta] = useState<VideoSourceMeta | null>(null);
  const [clips, setClips] = useState<GeneratedClip[]>([]);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isLiveModalOpen, setIsLiveModalOpen] = useState(false);

  const refreshAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts');
      if (res.ok) {
        const data = (await parseApiJson(res)) as AccountsState;
        setAccounts(data);
      }
    } catch {
      // ignore initial offline error
    }
  }, []);

  const refreshQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/publish/queue');
      if (res.ok) {
        const data = (await parseApiJson(res)) as { queue: PublishJob[] };
        setPublishQueue(data.queue || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshAccounts();
    refreshQueue();
  }, [refreshAccounts, refreshQueue]);

  // Listen for OAuth popup completion via postMessage
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const providerName = event.data.provider === 'youtube' ? 'YouTube' : 'Instagram';
        setOauthFeedback(`${providerName} account connected and ready for direct publishing.`);
        refreshAccounts();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [refreshAccounts]);

  const handleConnectProvider = async (provider: 'youtube' | 'instagram') => {
    setOauthFeedback(null);
    try {
      const res = await fetch(`/api/oauth/${provider}/url`);
      const data = await parseApiJson(res);

      if (!res.ok) {
        setOauthFeedback(
          `${data.message || 'OAuth not configured yet.'} Callback URL: ${data.callbackUrl || ''}`
        );
        return;
      }

      const popup = window.open(data.url, 'oauth_popup', 'width=600,height=700');
      if (!popup) {
        setOauthFeedback('Popup blocked by browser. Allow popups for this site to finish connecting your account.');
      }
    } catch (err: any) {
      setOauthFeedback(err?.message || `Failed to initiate ${provider} OAuth.`);
    }
  };

  const handleDisconnectProvider = async (provider: 'youtube' | 'instagram') => {
    try {
      await fetch('/api/oauth/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      await refreshAccounts();
      setOauthFeedback(`Disconnected ${provider === 'youtube' ? 'YouTube' : 'Instagram'} account.`);
    } catch {
      // ignore
    }
  };

  const handleAnalyzeUrl = async (
    url: string,
    clipCount: number,
    platform: TargetPlatform,
    sourceType: 'youtube' | 'livestream'
  ) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisStatus('Fetching video metadata, captions, and identifying viral segments...');

    try {
      const res = await fetch('/api/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, clipCount, targetPlatform: platform, sourceType }),
      });
      const data = await parseApiJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze URL.');
      }

      setSourceMeta(data.sourceMeta);
      setClips(data.clips || []);
      setActiveView('studio');
    } catch (err: any) {
      setAnalysisError(err?.message || 'Unable to process this URL.');
    } finally {
      setIsAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  const handleUploadFile = async (
    file: File,
    clipCount = 5,
    platform: TargetPlatform = 'both',
    sourceType: 'upload' | 'livestream' = 'upload'
  ) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisStatus(`Uploading "${file.name}" and inspecting frames & audio for viral moments...`);

    try {
      const durationSeconds = await probeVideoDuration(file);
      const localVideoUrl = URL.createObjectURL(file);

      const res = await fetch('/api/analyze-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          durationSeconds: durationSeconds || 60,
          clipCount,
          targetPlatform: platform,
          sourceType,
        }),
      });
      const data = await parseApiJson(res);
      if (!res.ok) {
        URL.revokeObjectURL(localVideoUrl);
        throw new Error(data.error || 'Video analysis failed.');
      }

      setSourceMeta({
        ...data.sourceMeta,
        localVideoUrl,
      });
      setClips(data.clips || []);
      setActiveView('studio');
    } catch (err: any) {
      setAnalysisError(err?.message || 'Unable to analyze uploaded video.');
    } finally {
      setIsAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  const handleSynthesizeSample = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisStatus('Generating 9-second multi-scene studio sample video...');
    try {
      const sampleFile = await synthesizeSampleFootageVideo();
      await handleUploadFile(sampleFile, 3, 'both', 'upload');
    } catch (err: any) {
      setAnalysisError(err?.message || 'Failed to generate sample video.');
      setIsAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  const handleNavigateLanding = (sectionId?: string) => {
    setActiveView('landing');
    if (sectionId) {
      window.setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleAttachLocalVideo = (file: File) => {
    const localVideoUrl = URL.createObjectURL(file);
    setSourceMeta((prev) => (prev ? { ...prev, localVideoUrl } : null));
  };

  const handleUpdateClip = (updated: GeneratedClip) => {
    setClips((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen w-full overflow-x-hidden bg-black text-neutral-100 flex flex-col">
        <Navbar
          activeView={activeView}
          hasClips={clips.length > 0}
          onNavigateLanding={handleNavigateLanding}
          onOpenStudio={() => setActiveView('studio')}
        />

        {activeView === 'landing' || !sourceMeta ? (
          <LandingView
            accounts={accounts}
            isAnalyzing={isAnalyzing}
            analysisStatus={analysisStatus}
            analysisError={analysisError}
            onAnalyzeUrl={handleAnalyzeUrl}
            onUploadFile={(f, count, plat) => handleUploadFile(f, count, plat, 'upload')}
            onSynthesizeSample={handleSynthesizeSample}
            onOpenLiveCapture={() => setIsLiveModalOpen(true)}
            onConnectProvider={handleConnectProvider}
            onDisconnectProvider={handleDisconnectProvider}
            oauthFeedback={oauthFeedback}
          />
        ) : (
          <StudioWorkspace
            sourceMeta={sourceMeta}
            clips={clips}
            accounts={accounts}
            publishQueue={publishQueue}
            oauthFeedback={oauthFeedback}
            onUpdateClip={handleUpdateClip}
            onAttachLocalVideo={handleAttachLocalVideo}
            onBackToIngest={() => handleNavigateLanding('hero-ingest')}
            onConnectProvider={handleConnectProvider}
            onDisconnectProvider={handleDisconnectProvider}
            onRefreshQueue={refreshQueue}
          />
        )}

        <LiveCaptureModal
          isOpen={isLiveModalOpen}
          onClose={() => setIsLiveModalOpen(false)}
          onCapturedFile={(file) => handleUploadFile(file, 4, 'both', 'livestream')}
        />
      </div>
    </MotionConfig>
  );
}
