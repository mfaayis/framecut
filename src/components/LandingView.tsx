import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  CheckCircle2,
  Film,
  Instagram,
  Link2,
  Loader2,
  Radio,
  Upload,
  Youtube,
} from 'lucide-react';
import { AccountsState, LayoutTemplateId, TargetPlatform } from '../types';
import { LAYOUT_TEMPLATES } from '../utils/videoExporter';

interface LandingViewProps {
  accounts: AccountsState;
  isAnalyzing: boolean;
  analysisStatus: string;
  analysisError: string | null;
  onAnalyzeUrl: (url: string, clipCount: number, platform: TargetPlatform, sourceType: 'youtube' | 'livestream') => void;
  onUploadFile: (file: File, clipCount: number, platform: TargetPlatform) => void;
  onSynthesizeSample: () => void;
  onOpenLiveCapture: () => void;
  onConnectProvider: (provider: 'youtube' | 'instagram') => void;
  onDisconnectProvider: (provider: 'youtube' | 'instagram') => void;
  oauthFeedback: string | null;
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const LandingView: React.FC<LandingViewProps> = ({
  accounts,
  isAnalyzing,
  analysisStatus,
  analysisError,
  onAnalyzeUrl,
  onUploadFile,
  onSynthesizeSample,
  onOpenLiveCapture,
  onConnectProvider,
  onDisconnectProvider,
  oauthFeedback,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [clipCount, setClipCount] = useState(5);
  const [platform, setPlatform] = useState<TargetPlatform>('both');
  const [activeShowcaseTemplate, setActiveShowcaseTemplate] = useState<LayoutTemplateId>('split_screen');
  const [isDragging, setIsDragging] = useState(false);
  const [demoHighlightTick, setDemoHighlightTick] = useState(0);

  // Subtle live caption word cycle on the showcase preview
  useEffect(() => {
    const id = window.setInterval(() => {
      setDemoHighlightTick((prev) => (prev + 1) % 3);
    }, 1400);
    return () => window.clearInterval(id);
  }, []);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || isAnalyzing) return;
    const lower = urlInput.toLowerCase();
    const isLive = lower.includes('/live') || lower.includes('twitch.tv') || lower.includes('kick.com');
    onAnalyzeUrl(urlInput.trim(), clipCount, platform, isLive ? 'livestream' : 'youtube');
  };

  const handleFilePicked = (file?: File) => {
    if (!file || isAnalyzing) return;
    onUploadFile(file, clipCount, platform);
  };

  return (
    <main className="relative bg-black text-neutral-100 overflow-hidden">
      {/* Subtle Ambient Obsidian Studio Rim Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-1/2 w-[920px] h-[460px] rounded-full ambient-hero-glow"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(255,255,255,0.09) 0%, rgba(245,158,11,0.05) 38%, rgba(0,0,0,0) 72%)',
          filter: 'blur(42px)',
        }}
      />

      {/* Hero Section */}
      <section
        id="hero-ingest"
        className="relative z-10 max-w-[1200px] mx-auto px-6 pt-20 pb-16 md:pt-28 md:pb-20 text-center"
      >
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
          className="text-xs font-medium tracking-widest uppercase text-neutral-400 mb-5"
        >
          AI Video Clipping &amp; Automated Publishing Studio
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05, ease: EASE_OUT }}
          className="font-display font-bold tracking-tight text-white text-[clamp(2.5rem,5vw,4.25rem)] leading-[1.06] max-w-4xl mx-auto"
        >
          Turn any footage into viral shorts 10x faster
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: EASE_OUT }}
          className="mt-5 text-base md:text-lg text-neutral-400 max-w-2xl mx-auto leading-relaxed"
        >
          Drop a YouTube link, upload raw footage, or capture a live stream. FrameCut identifies the highest-retention hooks, reframes into 9:16 Reels and Shorts with synced subtitles, and publishes directly.
        </motion.p>

        {/* Central Frosted Glass Ingestion Bar */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15, ease: EASE_OUT }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) handleFilePicked(dropped);
          }}
          className="mt-10 max-w-3xl mx-auto"
        >
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <form
              onSubmit={handleUrlSubmit}
              className={`flex-1 flex items-center gap-2 p-1.5 pl-4 rounded-full glass-capsule transition-all duration-200 ${
                isDragging ? '!border-amber-400/70' : 'focus-within:!border-white/35'
              }`}
            >
              <Link2 className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden="true" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste YouTube video or live stream URL..."
                aria-label="YouTube or live stream URL"
                className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-neutral-500 focus:outline-none py-2"
              />
              <button
                type="submit"
                disabled={isAnalyzing || !urlInput.trim()}
                className="glass-btn-primary px-5 py-2.5 text-xs font-semibold rounded-full disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
              >
                {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>{isAnalyzing ? 'Analyzing...' : 'Get Clips'}</span>
              </button>
            </form>

            <div className="flex items-center justify-center gap-2.5 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => handleFilePicked(e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={isAnalyzing}
                onClick={() => fileInputRef.current?.click()}
                className="glass-btn px-4 py-3 text-xs font-medium text-neutral-100 rounded-full disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Video</span>
              </button>
              <button
                type="button"
                disabled={isAnalyzing}
                onClick={onOpenLiveCapture}
                className="glass-btn px-4 py-3 text-xs font-medium text-neutral-100 rounded-full disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2"
              >
                <Radio className="w-3.5 h-3.5 text-amber-400" />
                <span>Live Capture</span>
              </button>
            </div>
          </div>

          {/* Generation Options Row */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-neutral-400">
            <span className="text-amber-400/90 font-medium flex items-center gap-1.5">
              <span>★</span>
              <span>Upload Video or Record Live Capture for full moving 9:16 clips with sound</span>
            </span>
            <span aria-hidden="true" className="text-neutral-700">·</span>
            <label className="flex items-center gap-2">
              <span>Clips per video</span>
              <select
                value={clipCount}
                onChange={(e) => setClipCount(Number(e.target.value))}
                className="bg-white/[0.05] backdrop-blur-md border border-white/[0.12] rounded-lg px-2.5 py-1 text-neutral-200 font-mono-tabular focus:outline-none focus:border-white/30"
              >
                <option value={3} className="bg-neutral-950">3 clips</option>
                <option value={5} className="bg-neutral-950">5 clips</option>
                <option value={8} className="bg-neutral-950">8 clips</option>
              </select>
            </label>

            <span aria-hidden="true" className="text-neutral-700">·</span>

            <label className="flex items-center gap-2">
              <span>Format target</span>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as TargetPlatform)}
                className="bg-white/[0.05] backdrop-blur-md border border-white/[0.12] rounded-lg px-2.5 py-1 text-neutral-200 focus:outline-none focus:border-white/30"
              >
                <option value="both" className="bg-neutral-950">Reels &amp; Shorts (9:16)</option>
                <option value="instagram_reels" className="bg-neutral-950">Instagram Reels (9:16)</option>
                <option value="youtube_shorts" className="bg-neutral-950">YouTube Shorts (9:16)</option>
              </select>
            </label>

            <span aria-hidden="true" className="text-neutral-700">·</span>

            <button
              type="button"
              disabled={isAnalyzing}
              onClick={onSynthesizeSample}
              className="text-neutral-300 hover:text-white underline underline-offset-4 decoration-white/25 hover:decoration-white transition-colors cursor-pointer disabled:opacity-40"
            >
              Generate sample footage &amp; test clipping
            </button>
          </div>

          {/* Live Analysis Progress or Error */}
          {isAnalyzing && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-6 max-w-xl mx-auto glass-surface rounded-2xl px-5 py-4 text-left flex items-center gap-3.5"
            >
              <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">Processing video intelligence</p>
                <p className="text-xs text-neutral-400 mt-0.5 truncate">{analysisStatus}</p>
              </div>
            </motion.div>
          )}

          {analysisError && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-5 max-w-xl mx-auto bg-red-950/35 backdrop-blur-xl border border-red-500/30 rounded-2xl px-4 py-3 text-xs text-red-200 text-left"
            >
              {analysisError}
            </motion.div>
          )}
        </motion.div>
      </section>

      {/* Bento Showcase Grid */}
      <section className="relative z-10 max-w-[1320px] mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Dominant Bento Card */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
            className="lg:col-span-7 glass-surface rounded-3xl p-6 md:p-8 flex flex-col justify-between overflow-hidden"
          >
            <div>
              <div className="flex items-center justify-between gap-4 text-xs text-neutral-400 mb-5">
                <span className="font-medium text-neutral-200">01. Multi-Clip Extraction</span>
                <span className="font-mono-tabular">16:9 Input → 5–10 Vertical Shorts</span>
              </div>

              {/* 16:9 Source Video Mock Frame */}
              <div className="relative aspect-[16/9] max-w-md mx-auto rounded-2xl overflow-hidden border border-white/[0.12] shadow-2xl group">
                <img
                  src="/src/assets/images/podcast_studio_host_1794922937646.jpg"
                  alt="Podcast hosts recording in a dark studio"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.02]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs">
                  <span className="text-white font-medium truncate">Founder Deep Dive · Episode 42</span>
                  <span className="font-mono-tabular text-neutral-300">01:42:18</span>
                </div>
              </div>
            </div>

            {/* Resulting 9:16 Vertical Clips Row */}
            <div className="mt-7 pt-6 border-t border-white/[0.08]">
              <div className="grid grid-cols-3 gap-3.5">
                {[
                  {
                    title: 'Why hooks fail in 2s',
                    time: '00:34',
                    score: '96',
                    words: ['STOP', 'OPENING', 'HELLO'],
                    img: '/src/assets/images/creator_vertical_reel_1794922939003.jpg',
                  },
                  {
                    title: 'Live Q&A breakthrough',
                    time: '00:41',
                    score: '93',
                    words: ['WATCH', 'THIS', 'SHIFT'],
                    img: '/src/assets/images/livestream_stage_vertical_1794922940145.jpg',
                  },
                  {
                    title: 'Zero-to-one launch rule',
                    time: '00:29',
                    score: '91',
                    words: ['SHIP', 'BEFORE', 'READY'],
                    img: '/src/assets/images/keynote_speaker_stage_1794922939695.jpg',
                  },
                ].map((item, cardIdx) => {
                  const activeWord = (demoHighlightTick + cardIdx) % item.words.length;
                  return (
                    <div
                      key={item.title}
                      className="bg-white/[0.03] border border-white/[0.09] rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-1 hover:border-white/[0.2]"
                    >
                      <div className="relative aspect-[9/12] overflow-hidden">
                        <img
                          src={item.img}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                        <div className="absolute bottom-2.5 inset-x-2 text-center">
                          <p className="font-display font-extrabold text-[11px] leading-tight tracking-tight text-white drop-shadow">
                            {item.words.map((w, wIdx) => (
                              <span
                                key={w}
                                className={`transition-colors duration-200 ${
                                  wIdx === activeWord ? 'text-amber-400' : 'text-white'
                                }`}
                              >
                                {w}
                                {wIdx < item.words.length - 1 ? ' ' : ''}
                              </span>
                            ))}
                          </p>
                        </div>
                      </div>
                      <div className="p-2.5">
                        <p className="text-xs font-medium text-white truncate">{item.title}</p>
                        <p className="mt-1 text-[11px] text-neutral-400 font-mono-tabular truncate">
                          {item.time} · Score {item.score}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>

          {/* Right Bento Card: Interactive Liquid Glass Template Preview */}
          <motion.div
            id="templates-section"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.45, delay: 0.08, ease: EASE_OUT }}
            className="lg:col-span-5 glass-surface rounded-3xl p-6 md:p-8 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-4 text-xs text-neutral-400 mb-5">
                <span className="font-medium text-neutral-200">02. Dynamic Layout Templates</span>
                <span className="font-mono-tabular">9:16 Reels &amp; Shorts</span>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-5">
                {LAYOUT_TEMPLATES.map((tpl) => {
                  const isActive = activeShowcaseTemplate === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setActiveShowcaseTemplate(tpl.id)}
                      className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        isActive ? 'text-black' : 'text-neutral-300 hover:text-white bg-white/[0.04] border border-white/[0.08]'
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="showcase-template-pill"
                          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          className="absolute inset-0 rounded-lg bg-white shadow-[0_4px_16px_rgba(255,255,255,0.22)]"
                        />
                      )}
                      <span className="relative z-10">{tpl.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Visual Preview of Selected Layout */}
              <motion.div
                key={activeShowcaseTemplate}
                initial={{ opacity: 0.7, scale: 0.985 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
                className="relative mx-auto w-56 aspect-[9/16] rounded-2xl overflow-hidden border border-white/[0.18] bg-black shadow-2xl"
              >
                {activeShowcaseTemplate === 'split_screen' ? (
                  <div className="w-full h-full flex flex-col">
                    <div className="h-[55%] relative overflow-hidden border-b-2 border-black">
                      <img
                        src="/src/assets/images/keynote_speaker_stage_1794922939695.jpg"
                        alt="Speaker stage upper split"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="h-[45%] relative overflow-hidden">
                      <img
                        src="/src/assets/images/creator_vertical_reel_1794922939003.jpg"
                        alt="Creator reaction lower split"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover object-top"
                      />
                    </div>
                  </div>
                ) : activeShowcaseTemplate === 'blurred_cinema' ? (
                  <div className="w-full h-full relative flex items-center justify-center">
                    <img
                      src="/src/assets/images/podcast_studio_host_1794922937646.jpg"
                      alt="Ambient blurred backdrop"
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 w-full h-full object-cover blur-lg brightness-50 scale-110"
                    />
                    <div className="relative z-10 w-[88%] aspect-video rounded-lg overflow-hidden border border-white/25 shadow-lg">
                      <img
                        src="/src/assets/images/podcast_studio_host_1794922937646.jpg"
                        alt="Sharp 16:9 inset"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                ) : activeShowcaseTemplate === 'podcast_focus' ? (
                  <div className="w-full h-full flex flex-col">
                    <div className="h-1/2 relative overflow-hidden border-b-2 border-black">
                      <img
                        src="/src/assets/images/podcast_studio_host_1794922937646.jpg"
                        alt="Left podcast host"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover object-left scale-125"
                      />
                    </div>
                    <div className="h-1/2 relative overflow-hidden">
                      <img
                        src="/src/assets/images/podcast_studio_host_1794922937646.jpg"
                        alt="Right podcast guest"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover object-right scale-125"
                      />
                    </div>
                  </div>
                ) : (
                  <img
                    src="/src/assets/images/creator_vertical_reel_1794922939003.jpg"
                    alt="Auto-reframed vertical creator"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-8 inset-x-3 text-center pointer-events-none">
                  <p className="font-display font-extrabold text-sm text-white tracking-tight">
                    OPTIMIZED <span className="text-amber-400">CAPTIONS</span> SYNCED
                  </p>
                </div>
              </motion.div>
            </div>

            <p className="mt-5 text-xs text-neutral-400 leading-relaxed">
              {LAYOUT_TEMPLATES.find((t) => t.id === activeShowcaseTemplate)?.description}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Automated Publishing & OAuth Account Connection Section */}
      <section id="publishing-section" className="relative z-10 border-t border-white/[0.08] py-20">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-medium tracking-widest uppercase text-neutral-400 mb-3">
              Direct Social Automation
            </p>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-white">
              Connect YouTube &amp; Instagram for automated publishing
            </h2>
            <p className="mt-3 text-sm md:text-base text-neutral-400 leading-relaxed">
              Authorize your creator channels once. Export 9:16 vertical cuts with burned-in captions directly to YouTube Shorts and Instagram Reels or schedule automated release queues.
            </p>
          </div>

          {oauthFeedback && (
            <div className="mb-6 glass-surface rounded-2xl !border-amber-400/35 px-4 py-3 text-xs text-amber-200">
              {oauthFeedback}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* YouTube Glass Card */}
            <div className="glass-surface rounded-2xl p-6 flex flex-col justify-between gap-6 transition-colors duration-200 hover:border-white/[0.18]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-white/[0.06] border border-white/[0.12] flex items-center justify-center shrink-0">
                    <Youtube className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">YouTube Shorts</h3>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {accounts.youtube.connected
                        ? `${accounts.youtube.displayName} · ${accounts.youtube.handle}`
                        : 'Direct OAuth upload via YouTube Data API v3'}
                    </p>
                  </div>
                </div>
                {accounts.youtube.connected && (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Connected</span>
                  </span>
                )}
              </div>

              <div className="text-xs text-neutral-400 space-y-1.5">
                <p>OAuth Callback URI</p>
                <p className="font-mono-tabular text-[11px] text-neutral-300 bg-black/60 border border-white/[0.08] rounded-lg px-3 py-2 break-all">
                  {accounts.youtube.callbackUrl}
                </p>
              </div>

              <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/[0.06]">
                <span className="text-xs text-neutral-500">
                  {accounts.youtube.configured ? 'OAuth credentials ready' : 'Requires YOUTUBE_CLIENT_ID & SECRET'}
                </span>
                {accounts.youtube.connected ? (
                  <button
                    type="button"
                    onClick={() => onDisconnectProvider('youtube')}
                    className="glass-btn px-4 py-2 text-xs font-medium text-neutral-200 rounded-full cursor-pointer"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onConnectProvider('youtube')}
                    className="glass-btn-primary px-5 py-2 text-xs font-semibold rounded-full cursor-pointer flex items-center gap-1.5"
                  >
                    <span>Connect YouTube</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Instagram Glass Card */}
            <div className="glass-surface rounded-2xl p-6 flex flex-col justify-between gap-6 transition-colors duration-200 hover:border-white/[0.18]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-white/[0.06] border border-white/[0.12] flex items-center justify-center shrink-0">
                    <Instagram className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">Instagram Reels</h3>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {accounts.instagram.connected
                        ? `${accounts.instagram.displayName} · ${accounts.instagram.handle}`
                        : 'Automated Reels publishing via Instagram Graph API'}
                    </p>
                  </div>
                </div>
                {accounts.instagram.connected && (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Connected</span>
                  </span>
                )}
              </div>

              <div className="text-xs text-neutral-400 space-y-1.5">
                <p>OAuth Callback URI</p>
                <p className="font-mono-tabular text-[11px] text-neutral-300 bg-black/60 border border-white/[0.08] rounded-lg px-3 py-2 break-all">
                  {accounts.instagram.callbackUrl}
                </p>
              </div>

              <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/[0.06]">
                <span className="text-xs text-neutral-500">
                  {accounts.instagram.configured ? 'OAuth credentials ready' : 'Requires INSTAGRAM_CLIENT_ID & SECRET'}
                </span>
                {accounts.instagram.connected ? (
                  <button
                    type="button"
                    onClick={() => onDisconnectProvider('instagram')}
                    className="glass-btn px-4 py-2 text-xs font-medium text-neutral-200 rounded-full cursor-pointer"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onConnectProvider('instagram')}
                    className="glass-btn-primary px-5 py-2 text-xs font-semibold rounded-full cursor-pointer flex items-center gap-1.5"
                  >
                    <span>Connect Instagram</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section id="workflow-section" className="relative z-10 border-t border-white/[0.08] py-20">
        <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-5 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium tracking-widest uppercase text-neutral-400 mb-3">
                Production Pipeline
              </p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-white">
                One long-form upload. A week of vertical shorts.
              </h2>
            </div>

            <div className="mt-8 space-y-6">
              <div className="pt-4 border-t border-white/[0.08]">
                <h3 className="text-sm font-semibold text-white">01. Multimodal Hook Detection</h3>
                <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                  Gemini inspects spoken cadence, topic shifts, and visual energy across your full video or live capture to isolate multiple standalone viral segments.
                </p>
              </div>
              <div className="pt-4 border-t border-white/[0.08]">
                <h3 className="text-sm font-semibold text-white">02. Dynamic 9:16 Layout &amp; Word Sync</h3>
                <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                  Switch seamlessly between Split Reaction, Podcast Two-Shot, Blurred Cinema, or Auto-Reframe with safe-zone guides for Shorts and Reels overlays.
                </p>
              </div>
              <div className="pt-4 border-t border-white/[0.08]">
                <h3 className="text-sm font-semibold text-white">03. Burned-In Export &amp; Auto-Publish</h3>
                <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                  Render trimmed vertical video files directly in your browser or push straight to connected YouTube and Instagram channels on schedule.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 relative rounded-3xl overflow-hidden border border-white/[0.12] min-h-[340px] shadow-2xl">
            <img
              src="/src/assets/images/keynote_speaker_stage_1794922939695.jpg"
              alt="Keynote speaker under spotlight on dark stage"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs text-neutral-300 font-mono-tabular">KEYNOTE &amp; LIVE CAPTURE</p>
                <p className="text-lg font-semibold text-white mt-1">
                  Built for podcasts, livestreams, tutorials, and studio interviews
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="glass-btn-primary px-4 py-2.5 text-xs font-semibold rounded-full cursor-pointer flex items-center gap-1.5"
              >
                <Film className="w-3.5 h-3.5" />
                <span>Upload Footage</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="relative z-10 border-t border-white/[0.08] py-10">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <span className="font-display font-semibold text-neutral-300">FrameCut</span>
          <div className="flex items-center gap-6">
            <a href="#hero-ingest" className="hover:text-neutral-300 transition-colors">Ingest</a>
            <a href="#templates-section" className="hover:text-neutral-300 transition-colors">Templates</a>
            <a href="#publishing-section" className="hover:text-neutral-300 transition-colors">Publishing</a>
          </div>
          <span>© {new Date().getFullYear()} FrameCut Studio</span>
        </div>
      </footer>
    </main>
  );
};
