import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  Download,
  Eye,
  Film,
  Instagram,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  Youtube,
} from 'lucide-react';
import {
  AccountsState,
  ClipCustomization,
  GeneratedClip,
  PublishJob,
  SubtitleCue,
  TargetPlatform,
  VideoSourceMeta,
} from '../types';
import {
  exportClipToWebm,
  formatShortDuration,
  formatTimecode,
  LAYOUT_TEMPLATES,
  renderClipFrame,
  SUBTITLE_STYLES,
} from '../utils/videoExporter';

interface StudioWorkspaceProps {
  sourceMeta: VideoSourceMeta;
  clips: GeneratedClip[];
  accounts: AccountsState;
  publishQueue: PublishJob[];
  oauthFeedback: string | null;
  onUpdateClip: (updated: GeneratedClip) => void;
  onBackToIngest: () => void;
  onConnectProvider: (provider: 'youtube' | 'instagram') => void;
  onDisconnectProvider: (provider: 'youtube' | 'instagram') => void;
  onRefreshQueue: () => void;
}

export const StudioWorkspace: React.FC<StudioWorkspaceProps> = ({
  sourceMeta,
  clips,
  accounts,
  publishQueue,
  oauthFeedback,
  onUpdateClip,
  onBackToIngest,
  onConnectProvider,
  onDisconnectProvider,
  onRefreshQueue,
}) => {
  const [selectedClipId, setSelectedClipId] = useState<string>(clips[0]?.id || '');
  const [filterTab, setFilterTab] = useState<'all' | 'instagram_reels' | 'youtube_shorts' | 'top'>('all');
  const [inspectorTab, setInspectorTab] = useState<'layout' | 'transcript' | 'publish'>('layout');
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);

  const selectedClip = useMemo(
    () => clips.find((c) => c.id === selectedClipId) || clips[0] || null,
    [clips, selectedClipId]
  );

  // Per-clip customization map
  const [customizations, setCustomizations] = useState<Record<string, ClipCustomization>>({});

  const activeCustomization: ClipCustomization = useMemo(() => {
    if (!selectedClip) {
      return {
        template: 'auto_reframe',
        subtitleStyle: 'bold_impact',
        platformTarget: 'both',
        subtitleYPercent: 76,
        subtitleScale: 1,
        showHookBanner: true,
        showSafeZones: false,
      };
    }
    return (
      customizations[selectedClip.id] || {
        template: selectedClip.recommendedTemplate,
        subtitleStyle: selectedClip.recommendedSubtitleStyle,
        platformTarget: selectedClip.recommendedPlatform,
        subtitleYPercent: 76,
        subtitleScale: 1,
        showHookBanner: true,
        showSafeZones: false,
      }
    );
  }, [selectedClip, customizations]);

  const updateActiveCustomization = (patch: Partial<ClipCustomization>) => {
    if (!selectedClip) return;
    setCustomizations((prev) => ({
      ...prev,
      [selectedClip.id]: {
        ...activeCustomization,
        ...patch,
      },
    }));
  };

  // Filtered clip list
  const filteredClips = useMemo(() => {
    return clips.filter((c) => {
      if (filterTab === 'top') return c.scores.overall >= 90;
      if (filterTab === 'instagram_reels') {
        return c.recommendedPlatform === 'instagram_reels' || c.recommendedPlatform === 'both';
      }
      if (filterTab === 'youtube_shorts') {
        return c.recommendedPlatform === 'youtube_shorts' || c.recommendedPlatform === 'both';
      }
      return true;
    });
  }, [clips, filterTab]);

  // Playback & Canvas Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fallbackImgRef = useRef<HTMLImageElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [relativeTime, setRelativeTime] = useState(0);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [publishBusy, setPublishBusy] = useState<'youtube' | 'instagram' | 'batch' | null>(null);
  const [studioNotice, setStudioNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [youtubePrivacy, setYoutubePrivacy] = useState<'public' | 'unlisted' | 'private'>('public');

  // Load fallback image if no local video binary (e.g., YouTube URL mode)
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = sourceMeta.thumbnailUrl || '/src/assets/images/podcast_studio_host_1794922937646.jpg';
    img.onload = () => {
      fallbackImgRef.current = img;
    };
  }, [sourceMeta.thumbnailUrl]);

  // Reset playback when switching clips
  useEffect(() => {
    setIsPlaying(false);
    setRelativeTime(0);
    if (videoRef.current && selectedClip) {
      videoRef.current.pause();
      videoRef.current.currentTime = selectedClip.startTime;
    }
  }, [selectedClip?.id]);

  // Live Canvas Render Loop
  useEffect(() => {
    if (!selectedClip) return;
    let rafId = 0;
    let lastTs = performance.now();

    const clipDur = Math.max(2, selectedClip.endTime - selectedClip.startTime);

    const frame = (now: number) => {
      const dt = (now - lastTs) / 1000;
      lastTs = now;

      let nextRel = relativeTime;
      if (isPlaying) {
        if (videoRef.current && sourceMeta.localVideoUrl) {
          const vTime = videoRef.current.currentTime - selectedClip.startTime;
          if (vTime >= clipDur || videoRef.current.ended) {
            videoRef.current.currentTime = selectedClip.startTime;
            nextRel = 0;
          } else {
            nextRel = Math.max(0, vTime);
          }
          setRelativeTime(nextRel);
        } else {
          setRelativeTime((prev) => {
            const nxt = prev + dt;
            return nxt >= clipDur ? 0 : nxt;
          });
        }
      }

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const videoEl = sourceMeta.localVideoUrl ? videoRef.current : null;
        const imgEl = fallbackImgRef.current;
        const mediaSource = videoEl && videoEl.readyState >= 2 ? videoEl : imgEl;
        const srcW = videoEl && videoEl.readyState >= 2 ? videoEl.videoWidth : imgEl?.naturalWidth || 1280;
        const srcH = videoEl && videoEl.readyState >= 2 ? videoEl.videoHeight : imgEl?.naturalHeight || 720;

        renderClipFrame({
          ctx,
          width: canvas.width,
          height: canvas.height,
          source: mediaSource,
          sourceWidth: srcW,
          sourceHeight: srcH,
          clip: selectedClip,
          relativeTime: nextRel,
          customization: activeCustomization,
        });
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [selectedClip, activeCustomization, isPlaying, relativeTime, sourceMeta.localVideoUrl]);

  const togglePlay = () => {
    if (!selectedClip) return;
    if (videoRef.current && sourceMeta.localVideoUrl) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        if (
          videoRef.current.currentTime < selectedClip.startTime ||
          videoRef.current.currentTime >= selectedClip.endTime
        ) {
          videoRef.current.currentTime = selectedClip.startTime;
        }
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    } else {
      setIsPlaying((prev) => !prev);
    }
  };

  const handleSeek = (newRel: number) => {
    if (!selectedClip) return;
    const clamped = Math.max(0, Math.min(selectedClip.endTime - selectedClip.startTime, newRel));
    setRelativeTime(clamped);
    if (videoRef.current && sourceMeta.localVideoUrl) {
      videoRef.current.currentTime = selectedClip.startTime + clamped;
    }
  };

  const handleExportCurrentClip = async () => {
    if (!selectedClip || exportProgress !== null) return;
    setStudioNotice(null);
    setExportProgress(0);
    try {
      const blob = await exportClipToWebm({
        clip: selectedClip,
        customization: activeCustomization,
        videoUrl: sourceMeta.localVideoUrl,
        fallbackImageUrl: sourceMeta.thumbnailUrl || '/src/assets/images/podcast_studio_host_1794922937646.jpg',
        onProgress: (pct) => setExportProgress(pct),
      });

      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const safeSlug = selectedClip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      a.download = `framecut-${safeSlug || 'short'}-9x16.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 4000);
      setStudioNotice({ type: 'ok', text: `Exported "${selectedClip.title}" in 9:16 vertical format.` });
    } catch (err: any) {
      setStudioNotice({ type: 'err', text: err?.message || 'Clip export failed.' });
    } finally {
      setExportProgress(null);
    }
  };

  const handlePublishClip = async (provider: 'youtube' | 'instagram') => {
    if (!selectedClip) return;
    setStudioNotice(null);
    setPublishBusy(provider);
    try {
      const blob = await exportClipToWebm({
        clip: selectedClip,
        customization: activeCustomization,
        videoUrl: sourceMeta.localVideoUrl,
        fallbackImageUrl: sourceMeta.thumbnailUrl || '/src/assets/images/podcast_studio_host_1794922937646.jpg',
        onProgress: (pct) => setExportProgress(pct),
      });
      setExportProgress(null);

      const form = new FormData();
      form.append('video', blob, `${selectedClip.id}.webm`);
      form.append('clipId', selectedClip.id);
      form.append('title', selectedClip.title);
      const fullCaption = `${selectedClip.socialCaption}\n\n${selectedClip.hashtags.join(' ')}`.trim();
      form.append('description', fullCaption);
      form.append('caption', fullCaption);
      form.append('privacyStatus', youtubePrivacy);
      if (scheduleEnabled && scheduledDateTime) {
        form.append('scheduledFor', scheduledDateTime);
      }

      const endpoint = provider === 'youtube' ? '/api/publish/youtube' : '/api/publish/instagram';
      const resp = await fetch(endpoint, { method: 'POST', body: form });
      const rawText = await resp.text();
      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error('Server returned an unexpected response while publishing.');
      }
      if (!resp.ok) {
        throw new Error(data.error || `Failed to publish to ${provider}`);
      }

      await onRefreshQueue();
      setStudioNotice({
        type: 'ok',
        text:
          provider === 'youtube'
            ? `Published to YouTube Shorts: ${data.job?.publishedUrl || 'Success'}`
            : `Published to Instagram Reels: ${data.job?.publishedUrl || 'Success'}`,
      });
    } catch (err: any) {
      setExportProgress(null);
      setStudioNotice({ type: 'err', text: err?.message || `Failed to publish to ${provider}.` });
    } finally {
      setPublishBusy(null);
    }
  };

  const handleBatchExport = async () => {
    const targets = clips.filter((c) => selectedBatchIds.includes(c.id));
    if (targets.length === 0) return;
    setPublishBusy('batch');
    setStudioNotice(null);
    try {
      for (const clip of targets) {
        const cust = customizations[clip.id] || {
          template: clip.recommendedTemplate,
          subtitleStyle: clip.recommendedSubtitleStyle,
          platformTarget: clip.recommendedPlatform,
          subtitleYPercent: 76,
          subtitleScale: 1,
          showHookBanner: true,
          showSafeZones: false,
        };
        const blob = await exportClipToWebm({
          clip,
          customization: cust,
          videoUrl: sourceMeta.localVideoUrl,
          fallbackImageUrl: sourceMeta.thumbnailUrl || '/src/assets/images/podcast_studio_host_1794922937646.jpg',
          onProgress: (pct) => setExportProgress(pct),
        });
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `framecut-${clip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)}.webm`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 4000);
      }
      setStudioNotice({ type: 'ok', text: `Exported ${targets.length} vertical 9:16 clips.` });
    } catch (err: any) {
      setStudioNotice({ type: 'err', text: err?.message || 'Batch export failed.' });
    } finally {
      setExportProgress(null);
      setPublishBusy(null);
    }
  };

  const handleBatchPublishYouTube = async () => {
    if (!accounts.youtube.connected) {
      onConnectProvider('youtube');
      return;
    }
    const targets = clips.filter((c) => selectedBatchIds.includes(c.id));
    if (targets.length === 0) return;
    setPublishBusy('batch');
    setStudioNotice(null);
    let publishedCount = 0;
    try {
      for (const clip of targets) {
        const cust = customizations[clip.id] || {
          template: clip.recommendedTemplate,
          subtitleStyle: clip.recommendedSubtitleStyle,
          platformTarget: clip.recommendedPlatform,
          subtitleYPercent: 76,
          subtitleScale: 1,
          showHookBanner: true,
          showSafeZones: false,
        };
        const blob = await exportClipToWebm({
          clip,
          customization: cust,
          videoUrl: sourceMeta.localVideoUrl,
          fallbackImageUrl: sourceMeta.thumbnailUrl || '/src/assets/images/podcast_studio_host_1794922937646.jpg',
          onProgress: (pct) => setExportProgress(pct),
        });
        const form = new FormData();
        form.append('video', blob, `${clip.id}.webm`);
        form.append('clipId', clip.id);
        form.append('title', clip.title);
        const fullCaption = `${clip.socialCaption}\n\n${clip.hashtags.join(' ')}`.trim();
        form.append('description', fullCaption);
        form.append('privacyStatus', youtubePrivacy);
        if (scheduleEnabled && scheduledDateTime) {
          form.append('scheduledFor', scheduledDateTime);
        }
        const resp = await fetch('/api/publish/youtube', { method: 'POST', body: form });
        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data.error || `Failed uploading "${clip.title}" to YouTube.`);
        }
        publishedCount++;
      }
      await onRefreshQueue();
      setStudioNotice({
        type: 'ok',
        text: `Automatically uploaded ${publishedCount} Shorts to YouTube.`,
      });
    } catch (err: any) {
      setStudioNotice({ type: 'err', text: err?.message || 'Batch YouTube Shorts upload failed.' });
    } finally {
      setExportProgress(null);
      setPublishBusy(null);
    }
  };

  const updateSubtitleCue = (cueId: string, patch: Partial<SubtitleCue>) => {
    if (!selectedClip) return;
    onUpdateClip({
      ...selectedClip,
      subtitles: selectedClip.subtitles.map((s) => (s.id === cueId ? { ...s, ...patch } : s)),
    });
  };

  const addSubtitleCue = () => {
    if (!selectedClip) return;
    const last = selectedClip.subtitles[selectedClip.subtitles.length - 1];
    const start = last ? Math.min(selectedClip.duration - 1, Number((last.end + 0.1).toFixed(1))) : 0;
    const end = Math.min(selectedClip.duration, Number((start + 2).toFixed(1)));
    onUpdateClip({
      ...selectedClip,
      subtitles: [
        ...selectedClip.subtitles,
        {
          id: `sub-${Date.now()}`,
          start,
          end,
          text: 'New caption line',
          emphasisWord: 'caption',
        },
      ],
    });
  };

  const removeSubtitleCue = (cueId: string) => {
    if (!selectedClip) return;
    onUpdateClip({
      ...selectedClip,
      subtitles: selectedClip.subtitles.filter((s) => s.id !== cueId),
    });
  };

  if (!selectedClip) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-black flex flex-col items-center justify-center px-6 text-center">
        <Film className="w-8 h-8 text-neutral-500 mb-3" />
        <h2 className="font-display text-xl font-semibold text-white">No video loaded in studio</h2>
        <p className="text-sm text-neutral-400 mt-1 max-w-md">
          Upload footage, paste a YouTube link, or capture a live stream to generate multiple vertical shorts.
        </p>
        <button
          type="button"
          onClick={onBackToIngest}
          className="mt-6 px-5 py-2.5 text-xs font-semibold text-black bg-white rounded-full hover:bg-neutral-200 transition-colors cursor-pointer"
        >
          Go to Video Uploader
        </button>
      </div>
    );
  }

  const clipDuration = Math.max(2, selectedClip.endTime - selectedClip.startTime);

  return (
    <div className="bg-black text-neutral-100 min-h-[calc(100vh-64px)] flex flex-col">
      {/* Hidden source video element for real frame extraction & audio */}
      {sourceMeta.localVideoUrl && (
        <video
          ref={videoRef}
          src={sourceMeta.localVideoUrl}
          playsInline
          preload="auto"
          className="hidden"
        />
      )}

      {/* Contextual Studio Top Bar */}
      <div className="border-b border-white/[0.08] bg-[#070709] px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToIngest}
            className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Uploader</span>
          </button>
          <span className="text-neutral-700" aria-hidden="true">/</span>
          <span className="text-sm font-medium text-white truncate max-w-[360px]">{sourceMeta.title}</span>
          <span className="text-neutral-700 hidden sm:inline" aria-hidden="true">·</span>
          <span className="text-xs text-neutral-400 font-mono-tabular hidden sm:inline shrink-0">
            {formatShortDuration(sourceMeta.durationSeconds)} · {clips.length} clips generated
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {exportProgress !== null && (
            <span className="text-xs font-mono-tabular text-amber-400">
              Rendering 9:16 · {exportProgress}%
            </span>
          )}
          <button
            type="button"
            disabled={exportProgress !== null}
            onClick={handleExportCurrentClip}
            className="glass-btn-primary px-4 py-2 text-xs font-semibold rounded-full disabled:opacity-50 cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {exportProgress !== null ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Export 9:16 Clip</span>
          </button>
        </div>
      </div>

      {/* Main 3-Column Studio Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0">
        {/* Left Rail: Generated Clips Queue */}
        <aside className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-white/[0.08] bg-[#070709] flex flex-col max-h-[420px] lg:max-h-[calc(100vh-122px)]">
          <div className="p-4 border-b border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold tracking-wide text-neutral-200">Generated Viral Clips</h2>
              <span className="text-xs font-mono-tabular text-neutral-500">{filteredClips.length}</span>
            </div>

            <div className="grid grid-cols-4 gap-1 p-1 bg-white/[0.03] backdrop-blur-md border border-white/[0.08] rounded-xl">
              {[
                { id: 'all', label: 'All' },
                { id: 'instagram_reels', label: 'Reels' },
                { id: 'youtube_shorts', label: 'Shorts' },
                { id: 'top', label: '90+' },
              ].map((tab) => {
                const active = filterTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterTab(tab.id as any)}
                    className={`relative py-1.5 text-[11px] font-medium rounded-lg transition-colors cursor-pointer ${
                      active ? 'text-black' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="studio-filter-pill"
                        transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                        className="absolute inset-0 bg-white rounded-lg"
                      />
                    )}
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-white/[0.06]">
            {filteredClips.map((clip, idx) => {
              const isActive = clip.id === selectedClip.id;
              const isChecked = selectedBatchIds.includes(clip.id);
              const tplName = LAYOUT_TEMPLATES.find((t) => t.id === (customizations[clip.id]?.template || clip.recommendedTemplate))?.name;
              return (
                <div
                  key={clip.id}
                  className={`p-3.5 transition-colors cursor-pointer flex items-start gap-3 ${
                    isActive ? 'bg-[#141418]' : 'hover:bg-[#0D0D10]'
                  }`}
                  onClick={() => setSelectedClipId(clip.id)}
                >
                  <button
                    type="button"
                    aria-label={`Select ${clip.title} for batch`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBatchIds((prev) =>
                        prev.includes(clip.id) ? prev.filter((id) => id !== clip.id) : [...prev, clip.id]
                      );
                    }}
                    className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer ${
                      isChecked ? 'bg-amber-400 border-amber-400 text-black' : 'border-white/25 hover:border-white/50'
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono-tabular text-neutral-500">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="text-[11px] font-mono-tabular text-amber-400 font-semibold">
                        Score {clip.scores.overall}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-white mt-1 line-clamp-2">{clip.title}</p>
                    <p className="text-[11px] text-neutral-400 font-mono-tabular mt-1.5 truncate">
                      {formatShortDuration(clip.endTime - clip.startTime)} · {tplName || 'Auto-Reframe'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedBatchIds.length > 0 && (
            <div className="p-3 border-t border-white/[0.08] bg-[#0B0B0E] space-y-2">
              <button
                type="button"
                disabled={publishBusy === 'batch'}
                onClick={handleBatchExport}
                className="w-full py-2.5 px-3 text-xs font-semibold text-black bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export {selectedBatchIds.length} Selected Clips</span>
              </button>
              <button
                type="button"
                disabled={publishBusy === 'batch'}
                onClick={handleBatchPublishYouTube}
                className="w-full py-2.5 px-3 text-xs font-semibold text-black bg-white rounded-lg hover:bg-neutral-200 transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                {publishBusy === 'batch' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Youtube className="w-3.5 h-3.5" />
                )}
                <span>
                  {accounts.youtube.connected
                    ? `Auto-Publish ${selectedBatchIds.length} to Shorts`
                    : 'Connect YouTube to Auto-Publish'}
                </span>
              </button>
            </div>
          )}
        </aside>

        {/* Center Stage: Live 9:16 Canvas Previewer */}
        <section className="lg:col-span-5 bg-black flex flex-col items-center justify-center p-6 relative">
          <div className="w-full max-w-[330px] flex flex-col items-center">
            <div className="w-full flex items-center justify-between text-xs text-neutral-400 mb-3">
              <span className="font-mono-tabular">
                {activeCustomization.platformTarget === 'instagram_reels'
                  ? 'Instagram Reels · 9:16'
                  : activeCustomization.platformTarget === 'youtube_shorts'
                  ? 'YouTube Shorts · 9:16'
                  : 'Reels & Shorts · 9:16'}
              </span>
              <button
                type="button"
                onClick={() => updateActiveCustomization({ showSafeZones: !activeCustomization.showSafeZones })}
                className={`flex items-center gap-1 text-xs cursor-pointer transition-colors ${
                  activeCustomization.showSafeZones ? 'text-amber-400' : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Safe Zones</span>
              </button>
            </div>

            {/* 9:16 Live Composited Canvas */}
            <div className="relative w-full aspect-[9/16] rounded-2xl overflow-hidden border border-white/[0.14] bg-[#070709] shadow-2xl">
              <canvas
                ref={canvasRef}
                width={405}
                height={720}
                onClick={togglePlay}
                className="w-full h-full object-contain cursor-pointer"
              />
            </div>

            {/* Playback & Timeline Scrubber */}
            <div className="w-full mt-4 space-y-2.5">
              <input
                type="range"
                min={0}
                max={clipDuration}
                step={0.1}
                value={relativeTime}
                onChange={(e) => handleSeek(Number(e.target.value))}
                aria-label="Clip playback timeline"
                className="w-full accent-amber-400 cursor-pointer"
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:bg-neutral-200 transition-colors cursor-pointer"
                    aria-label={isPlaying ? 'Pause clip' : 'Play clip'}
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5 fill-black" /> : <Play className="w-3.5 h-3.5 fill-black ml-0.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSeek(0)}
                    className="w-8 h-8 rounded-full bg-[#141418] border border-white/[0.1] text-neutral-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                    aria-label="Restart clip"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <span className="text-xs font-mono-tabular text-neutral-300">
                  {formatTimecode(relativeTime)} / {formatTimecode(clipDuration)}
                </span>
              </div>
            </div>

            {/* Unboxed Viral Score Breakdown */}
            <div className="w-full mt-4 pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs text-neutral-400 font-mono-tabular">
              <span>Hook {selectedClip.scores.hookStrength}</span>
              <span aria-hidden="true">·</span>
              <span>Retention {selectedClip.scores.retentionPacing}</span>
              <span aria-hidden="true">·</span>
              <span>Shareability {selectedClip.scores.shareability}</span>
            </div>
          </div>
        </section>

        {/* Right Inspector: Templates, Transcript & Direct Publishing */}
        <aside className="lg:col-span-4 border-t lg:border-t-0 lg:border-l border-white/[0.08] bg-[#070709] flex flex-col max-h-[calc(100vh-122px)]">
          {/* Inspector Mode Tabs */}
          <div className="p-4 border-b border-white/[0.08]">
            <div className="grid grid-cols-3 gap-1 p-1 bg-white/[0.03] backdrop-blur-md border border-white/[0.08] rounded-xl">
              {[
                { id: 'layout', label: 'Layout & Captions' },
                { id: 'transcript', label: 'Transcript & Trim' },
                { id: 'publish', label: 'Publish & Accounts' },
              ].map((tab) => {
                const active = inspectorTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setInspectorTab(tab.id as any)}
                    className={`relative py-2 px-2 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap truncate ${
                      active ? 'text-black' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="studio-inspector-pill"
                        transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                        className="absolute inset-0 bg-white rounded-lg"
                      />
                    )}
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {studioNotice && (
              <div
                className={`rounded-xl px-4 py-3 text-xs border ${
                  studioNotice.type === 'ok'
                    ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                    : 'bg-red-950/30 border-red-500/30 text-red-300'
                }`}
              >
                {studioNotice.text}
              </div>
            )}

            {/* TAB 1: Layout & Captions */}
            {inspectorTab === 'layout' && (
              <div className="space-y-6">
                <div>
                  <p className="text-xs font-medium text-neutral-300 mb-2.5">Target Format</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'both', label: 'Reels + Shorts' },
                        { id: 'instagram_reels', label: 'Instagram Reels' },
                        { id: 'youtube_shorts', label: 'YouTube Shorts' },
                      ] as Array<{ id: TargetPlatform; label: string }>
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateActiveCustomization({ platformTarget: opt.id })}
                        className={`py-2 px-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                          activeCustomization.platformTarget === opt.id
                            ? 'bg-white text-black border-white'
                            : 'bg-[#111114] text-neutral-300 border-white/[0.08] hover:border-white/25'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-neutral-300 mb-2.5">Dynamic Layout Template</p>
                  <div className="space-y-2">
                    {LAYOUT_TEMPLATES.map((tpl) => {
                      const active = activeCustomization.template === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => updateActiveCustomization({ template: tpl.id })}
                          className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#16161B] border-amber-400/70'
                              : 'bg-[#0D0D10] border-white/[0.08] hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-white">{tpl.name}</span>
                            {active && <span className="text-[11px] font-mono-tabular text-amber-400">Active</span>}
                          </div>
                          <p className="text-[11px] text-neutral-400 mt-1">{tpl.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-neutral-300 mb-2.5">Optimized Subtitle Style</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SUBTITLE_STYLES.map((st) => {
                      const active = activeCustomization.subtitleStyle === st.id;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => updateActiveCustomization({ subtitleStyle: st.id })}
                          className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#16161B] border-amber-400/70'
                              : 'bg-[#0D0D10] border-white/[0.08] hover:border-white/20'
                          }`}
                        >
                          <p className="text-[11px] text-neutral-400">{st.name}</p>
                          <p className="text-xs font-bold text-white mt-1 truncate">{st.previewText}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4 pt-2 border-t border-white/[0.08]">
                  <label className="block">
                    <div className="flex items-center justify-between text-xs text-neutral-300 mb-1.5">
                      <span>Subtitle Vertical Position</span>
                      <span className="font-mono-tabular text-neutral-400">{activeCustomization.subtitleYPercent}%</span>
                    </div>
                    <input
                      type="range"
                      min={52}
                      max={88}
                      value={activeCustomization.subtitleYPercent}
                      onChange={(e) => updateActiveCustomization({ subtitleYPercent: Number(e.target.value) })}
                      className="w-full accent-white cursor-pointer"
                    />
                  </label>

                  <label className="block">
                    <div className="flex items-center justify-between text-xs text-neutral-300 mb-1.5">
                      <span>Caption Font Scale</span>
                      <span className="font-mono-tabular text-neutral-400">{activeCustomization.subtitleScale.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.8}
                      max={1.4}
                      step={0.1}
                      value={activeCustomization.subtitleScale}
                      onChange={(e) => updateActiveCustomization({ subtitleScale: Number(e.target.value) })}
                      className="w-full accent-white cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs text-neutral-300 cursor-pointer pt-1">
                    <span>Show Top Hook Banner</span>
                    <input
                      type="checkbox"
                      checked={activeCustomization.showHookBanner}
                      onChange={(e) => updateActiveCustomization({ showHookBanner: e.target.checked })}
                      className="w-4 h-4 accent-amber-400 rounded cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* TAB 2: Transcript & Trim */}
            {inspectorTab === 'transcript' && (
              <div className="space-y-5">
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs text-neutral-400">Clip Title</span>
                    <input
                      type="text"
                      value={selectedClip.title}
                      onChange={(e) => onUpdateClip({ ...selectedClip, title: e.target.value })}
                      className="mt-1 w-full bg-[#111114] border border-white/[0.1] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs text-neutral-400">On-Screen Hook Headline</span>
                    <input
                      type="text"
                      value={selectedClip.hookHeadline}
                      onChange={(e) => onUpdateClip({ ...selectedClip, hookHeadline: e.target.value })}
                      className="mt-1 w-full bg-[#111114] border border-white/[0.1] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs text-neutral-400">Trim Start (sec)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        max={Math.max(0, selectedClip.endTime - 2)}
                        value={selectedClip.startTime}
                        onChange={(e) => {
                          const start = Math.max(0, Number(e.target.value) || 0);
                          onUpdateClip({
                            ...selectedClip,
                            startTime: start,
                            duration: Math.max(2, Number((selectedClip.endTime - start).toFixed(1))),
                          });
                        }}
                        className="mt-1 w-full bg-[#111114] border border-white/[0.1] rounded-lg px-3 py-2 text-xs font-mono-tabular text-white focus:outline-none focus:border-white/30"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs text-neutral-400">Trim End (sec)</span>
                      <input
                        type="number"
                        min={selectedClip.startTime + 2}
                        step={0.5}
                        max={sourceMeta.durationSeconds}
                        value={selectedClip.endTime}
                        onChange={(e) => {
                          const end = Math.min(sourceMeta.durationSeconds, Math.max(selectedClip.startTime + 2, Number(e.target.value) || 5));
                          onUpdateClip({
                            ...selectedClip,
                            endTime: end,
                            duration: Math.max(2, Number((end - selectedClip.startTime).toFixed(1))),
                          });
                        }}
                        className="mt-1 w-full bg-[#111114] border border-white/[0.1] rounded-lg px-3 py-2 text-xs font-mono-tabular text-white focus:outline-none focus:border-white/30"
                      />
                    </label>
                  </div>
                </div>

                {/* Timed Subtitle Cues */}
                <div className="pt-3 border-t border-white/[0.08]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-neutral-200">Synced Subtitle Cues</span>
                    <button
                      type="button"
                      onClick={addSubtitleCue}
                      className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Cue</span>
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {selectedClip.subtitles.map((cue) => (
                      <div key={cue.id} className="bg-[#0D0D10] border border-white/[0.08] rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2 text-[11px] font-mono-tabular text-neutral-400">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step={0.1}
                              value={cue.start}
                              onChange={(e) => updateSubtitleCue(cue.id, { start: Number(e.target.value) })}
                              className="w-14 bg-black border border-white/[0.1] rounded px-1.5 py-0.5 text-white"
                            />
                            <span>→</span>
                            <input
                              type="number"
                              step={0.1}
                              value={cue.end}
                              onChange={(e) => updateSubtitleCue(cue.id, { end: Number(e.target.value) })}
                              className="w-14 bg-black border border-white/[0.1] rounded px-1.5 py-0.5 text-white"
                            />
                            <span>s</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeSubtitleCue(cue.id)}
                            aria-label="Delete subtitle cue"
                            className="text-neutral-500 hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <input
                          type="text"
                          value={cue.text}
                          onChange={(e) => updateSubtitleCue(cue.id, { text: e.target.value })}
                          className="w-full bg-black border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-white/30"
                        />

                        <input
                          type="text"
                          value={cue.emphasisWord || ''}
                          onChange={(e) => updateSubtitleCue(cue.id, { emphasisWord: e.target.value })}
                          placeholder="Highlight word (optional)"
                          className="w-full bg-black border border-white/[0.07] rounded-lg px-2.5 py-1 text-[11px] text-amber-300 placeholder:text-neutral-600 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Social Post Copy */}
                <div className="pt-3 border-t border-white/[0.08] space-y-2">
                  <span className="text-xs font-semibold text-neutral-200">Post Caption &amp; Reasoning</span>
                  <textarea
                    rows={3}
                    value={selectedClip.socialCaption}
                    onChange={(e) => onUpdateClip({ ...selectedClip, socialCaption: e.target.value })}
                    className="w-full bg-[#111114] border border-white/[0.1] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30"
                  />
                  <p className="text-[11px] text-neutral-400 leading-relaxed">{selectedClip.reasoning}</p>
                </div>
              </div>
            )}

            {/* TAB 3: Direct Publishing & Connected OAuth Accounts */}
            {inspectorTab === 'publish' && (
              <div className="space-y-6">
                {oauthFeedback && (
                  <div className="bg-[#141418] border border-amber-400/30 rounded-xl px-3.5 py-2.5 text-xs text-amber-200">
                    {oauthFeedback}
                  </div>
                )}

                {/* Connected Account Controls */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-neutral-200">Connected Channels</p>

                  {/* YouTube Row */}
                  <div className="bg-[#0D0D10] border border-white/[0.08] rounded-xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Youtube className="w-4 h-4 text-white shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">
                            {accounts.youtube.connected ? accounts.youtube.displayName : 'YouTube Shorts'}
                          </p>
                          <p className="text-[11px] text-neutral-400 truncate">
                            {accounts.youtube.connected ? accounts.youtube.handle : 'Not connected'}
                          </p>
                        </div>
                      </div>
                      {accounts.youtube.connected ? (
                        <button
                          type="button"
                          onClick={() => onDisconnectProvider('youtube')}
                          className="text-[11px] text-neutral-400 hover:text-white cursor-pointer"
                        >
                          Disconnect
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onConnectProvider('youtube')}
                          className="px-3 py-1.5 text-[11px] font-semibold text-black bg-white rounded-full hover:bg-neutral-200 cursor-pointer shrink-0"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Instagram Row */}
                  <div className="bg-[#0D0D10] border border-white/[0.08] rounded-xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Instagram className="w-4 h-4 text-white shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">
                            {accounts.instagram.connected ? accounts.instagram.displayName : 'Instagram Reels'}
                          </p>
                          <p className="text-[11px] text-neutral-400 truncate">
                            {accounts.instagram.connected ? accounts.instagram.handle : 'Not connected'}
                          </p>
                        </div>
                      </div>
                      {accounts.instagram.connected ? (
                        <button
                          type="button"
                          onClick={() => onDisconnectProvider('instagram')}
                          className="text-[11px] text-neutral-400 hover:text-white cursor-pointer"
                        >
                          Disconnect
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onConnectProvider('instagram')}
                          className="px-3 py-1.5 text-[11px] font-semibold text-black bg-white rounded-full hover:bg-neutral-200 cursor-pointer shrink-0"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Automated Schedule & Visibility */}
                <div className="pt-3 border-t border-white/[0.08] space-y-3">
                  <label className="flex items-center justify-between text-xs text-neutral-300">
                    <span>YouTube Shorts Visibility</span>
                    <select
                      value={youtubePrivacy}
                      onChange={(e) => setYoutubePrivacy(e.target.value as 'public' | 'unlisted' | 'private')}
                      className="bg-[#111114] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    >
                      <option value="public">Public</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="private">Private</option>
                    </select>
                  </label>

                  <label className="flex items-center justify-between text-xs text-neutral-300 cursor-pointer">
                    <span className="flex items-center gap-2">
                      <CalendarClock className="w-3.5 h-3.5 text-amber-400" />
                      <span>Schedule automated drop</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={scheduleEnabled}
                      onChange={(e) => setScheduleEnabled(e.target.checked)}
                      className="w-4 h-4 accent-amber-400 cursor-pointer"
                    />
                  </label>

                  {scheduleEnabled && (
                    <input
                      type="datetime-local"
                      value={scheduledDateTime}
                      onChange={(e) => setScheduledDateTime(e.target.value)}
                      className="w-full bg-[#111114] border border-white/[0.12] rounded-lg px-3 py-2 text-xs font-mono-tabular text-white"
                    />
                  )}
                </div>

                {/* Direct Publish Actions */}
                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    disabled={publishBusy !== null || exportProgress !== null}
                    onClick={() =>
                      accounts.youtube.connected ? handlePublishClip('youtube') : onConnectProvider('youtube')
                    }
                    className="w-full py-2.5 px-4 text-xs font-semibold text-black bg-white rounded-xl hover:bg-neutral-200 disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    {publishBusy === 'youtube' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {accounts.youtube.connected
                        ? scheduleEnabled
                          ? 'Schedule to YouTube Shorts'
                          : 'Publish Direct to YouTube Shorts'
                        : 'Connect YouTube to Publish'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={publishBusy !== null || exportProgress !== null}
                    onClick={() =>
                      accounts.instagram.connected ? handlePublishClip('instagram') : onConnectProvider('instagram')
                    }
                    className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-[#141418] border border-white/[0.15] rounded-xl hover:border-white/35 disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    {publishBusy === 'instagram' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {accounts.instagram.connected
                        ? 'Publish Direct to Instagram Reels'
                        : 'Connect Instagram to Publish'}
                    </span>
                  </button>
                </div>

                {/* Recent Publish Log */}
                <div className="pt-3 border-t border-white/[0.08]">
                  <p className="text-xs font-semibold text-neutral-300 mb-2.5">Publishing History</p>
                  {publishQueue.length === 0 ? (
                    <p className="text-xs text-neutral-500">No clips published in this session yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {publishQueue.map((job) => (
                        <div key={job.id} className="bg-[#0D0D10] border border-white/[0.08] rounded-lg p-3 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-white truncate">{job.clipTitle}</span>
                            <span className="flex items-center gap-1 text-[11px] text-emerald-400 shrink-0">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{job.status}</span>
                            </span>
                          </div>
                          <p className="text-[11px] text-neutral-400 font-mono-tabular mt-1">
                            {job.platform === 'youtube_shorts' ? 'YouTube Shorts' : 'Instagram Reels'}
                          </p>
                          {job.publishedUrl && (
                            <a
                              href={job.publishedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block mt-1 text-[11px] text-amber-400 hover:underline truncate max-w-full"
                            >
                              {job.publishedUrl}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
