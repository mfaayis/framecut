import { ClipCustomization, GeneratedClip, LayoutTemplateId, SubtitleCue, SubtitleStyleId } from '../types';

export const LAYOUT_TEMPLATES: Array<{
  id: LayoutTemplateId;
  name: string;
  description: string;
}> = [
  {
    id: 'auto_reframe',
    name: 'Auto-Reframe 9:16',
    description: 'Full-bleed subject-centered vertical crop for solo creators.',
  },
  {
    id: 'split_screen',
    name: 'Split Reaction',
    description: 'Upper speaker feed paired with lower dynamic zoom cut.',
  },
  {
    id: 'blurred_cinema',
    name: 'Blurred Cinema',
    description: 'Sharp 16:9 widescreen centerpiece over ambient blurred frame.',
  },
  {
    id: 'podcast_focus',
    name: 'Podcast Two-Shot',
    description: 'Stacked upper/lower dual framing for interviews and panels.',
  },
  {
    id: 'clean_minimal',
    name: 'Clean Minimal',
    description: 'Edge-to-edge vertical framing with bottom contrast scrim.',
  },
];

export const SUBTITLE_STYLES: Array<{
  id: SubtitleStyleId;
  name: string;
  previewText: string;
}> = [
  { id: 'bold_impact', name: 'Bold Impact', previewText: 'STOP SCROLLING' },
  { id: 'clean_editorial', name: 'Clean Editorial', previewText: 'Key insight here' },
  { id: 'karaoke_pill', name: 'Karaoke Highlight', previewText: 'WATCH THIS PART' },
  { id: 'minimal_mono', name: 'Minimal Mono', previewText: '01 / transcript' },
  { id: 'neon_kinetic', name: 'Kinetic Pop', previewText: 'VIRAL HOOK' },
];

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export function formatShortDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function drawCoverSource(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  cropBiasX = 0.5,
  zoom = 1
) {
  if (!srcW || !srcH) return;
  const targetRatio = dw / dh;
  const sourceRatio = srcW / srcH;

  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;

  if (sourceRatio > targetRatio) {
    sw = srcH * targetRatio;
    sx = (srcW - sw) * cropBiasX;
  } else {
    sh = srcW / targetRatio;
    sy = (srcH - sh) * 0.5;
  }

  if (zoom > 1) {
    const zw = sw / zoom;
    const zh = sh / zoom;
    sx += (sw - zw) * 0.5;
    sy += (sh - zh) * 0.5;
    sw = zw;
    sh = zh;
  }

  ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
}

export function renderClipFrame(params: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  source: CanvasImageSource | null;
  sourceWidth: number;
  sourceHeight: number;
  clip: GeneratedClip;
  relativeTime: number;
  customization: ClipCustomization;
}) {
  const { ctx, width, height, source, sourceWidth, sourceHeight, clip, relativeTime, customization } = params;

  ctx.save();
  ctx.fillStyle = '#070709';
  ctx.fillRect(0, 0, width, height);

  const template = customization.template;

  if (source && sourceWidth > 0 && sourceHeight > 0) {
    if (template === 'auto_reframe') {
      const subtlePan = 0.5 + Math.sin(relativeTime * 0.6) * 0.05;
      drawCoverSource(ctx, source, sourceWidth, sourceHeight, 0, 0, width, height, subtlePan, 1.04);
    } else if (template === 'split_screen') {
      const topH = Math.round(height * 0.55);
      const botH = height - topH;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, topH);
      ctx.clip();
      drawCoverSource(ctx, source, sourceWidth, sourceHeight, 0, 0, width, topH, 0.5, 1.02);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, topH, width, botH);
      ctx.clip();
      drawCoverSource(ctx, source, sourceWidth, sourceHeight, 0, topH, width, botH, 0.35, 1.45);
      ctx.restore();

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, topH - 2, width, 4);
    } else if (template === 'blurred_cinema') {
      ctx.save();
      ctx.filter = 'blur(26px) brightness(0.45)';
      drawCoverSource(ctx, source, sourceWidth, sourceHeight, -30, -30, width + 60, height + 60, 0.5, 1.1);
      ctx.restore();

      const boxW = width - 48;
      const boxH = Math.round(boxW * (9 / 16));
      const boxX = 24;
      const boxY = Math.round((height - boxH) * 0.44);

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 16);
      ctx.clip();
      drawCoverSource(ctx, source, sourceWidth, sourceHeight, boxX, boxY, boxW, boxH, 0.5, 1.0);
      ctx.restore();

      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 16);
      ctx.stroke();
    } else if (template === 'podcast_focus') {
      const halfH = Math.round(height * 0.5);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, halfH);
      ctx.clip();
      drawCoverSource(ctx, source, sourceWidth, sourceHeight, 0, 0, width, halfH, 0.22, 1.3);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, halfH, width, height - halfH);
      ctx.clip();
      drawCoverSource(ctx, source, sourceWidth, sourceHeight, 0, halfH, width, height - halfH, 0.78, 1.3);
      ctx.restore();

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, halfH - 2, width, 4);
    } else {
      // clean_minimal
      drawCoverSource(ctx, source, sourceWidth, sourceHeight, 0, 0, width, height, 0.5, 1.0);
    }
  } else {
    // Fallback studio gradient backdrop if no video frame available
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#121216');
    grad.addColorStop(1, '#050507');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  // Measured contrast scrim for bottom readability
  const scrim = ctx.createLinearGradient(0, height * 0.52, 0, height);
  scrim.addColorStop(0, 'rgba(0,0,0,0)');
  scrim.addColorStop(0.65, 'rgba(0,0,0,0.48)');
  scrim.addColorStop(1, 'rgba(0,0,0,0.84)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, height * 0.52, width, height * 0.48);

  // Top Hook Headline Banner if enabled
  if (customization.showHookBanner && clip.hookHeadline) {
    const bannerY = template === 'blurred_cinema' ? height * 0.16 : height * 0.1;
    ctx.save();
    ctx.font = `800 ${Math.round(width * 0.044)}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = clip.hookHeadline.toUpperCase();
    const metrics = ctx.measureText(text);
    const padX = 24;
    const boxW = Math.min(width - 48, metrics.width + padX * 2);
    const boxH = Math.round(width * 0.085);

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect((width - boxW) / 2, bannerY - boxH / 2, boxW, boxH, 10);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.fillText(text, width / 2, bannerY + 1, width - 72);
    ctx.restore();
  }

  // Active Subtitle Rendering
  const activeCue = clip.subtitles.find((s) => relativeTime >= s.start && relativeTime <= s.end);
  if (activeCue) {
    drawSubtitleCue(ctx, width, height, activeCue, relativeTime, customization);
  }

  // Safe zone overlays for Shorts / Reels preview (not burned into export when disabled)
  if (customization.showSafeZones) {
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    // Right action column safe zone
    ctx.strokeRect(width - 96, height * 0.48, 80, height * 0.36);
    // Bottom caption safe zone
    ctx.strokeRect(20, height * 0.82, width - 124, height * 0.14);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.85)';
    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.fillText('SAFE ZONE', 28, height * 0.82 - 8);
    ctx.restore();
  }

  ctx.restore();
}

function drawSubtitleCue(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cue: SubtitleCue,
  relativeTime: number,
  customization: ClipCustomization
) {
  const words = cue.text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return;

  const progress = Math.max(0, Math.min(0.999, (relativeTime - cue.start) / Math.max(0.2, cue.end - cue.start)));
  const activeWordIdx = Math.floor(progress * words.length);
  const baseY = height * (customization.subtitleYPercent / 100);
  const scale = customization.subtitleScale;
  const style = customization.subtitleStyle;

  ctx.save();
  ctx.textBaseline = 'middle';

  let fontSize = Math.round(width * 0.056 * scale);
  let fontStr = `800 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
  if (style === 'minimal_mono') {
    fontSize = Math.round(width * 0.041 * scale);
    fontStr = `600 ${fontSize}px "JetBrains Mono", monospace`;
  } else if (style === 'clean_editorial') {
    fontSize = Math.round(width * 0.048 * scale);
    fontStr = `700 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
  }
  ctx.font = fontStr;

  // Wrap words into max 2 lines
  const maxLineWidth = width * 0.82;
  const lines: Array<Array<{ word: string; index: number }>> = [[]];
  let currentLineWidth = 0;
  const spaceW = ctx.measureText(' ').width;

  words.forEach((word, index) => {
    const displayWord = style === 'bold_impact' || style === 'neon_kinetic' ? word.toUpperCase() : word;
    const w = ctx.measureText(displayWord).width;
    const lastLine = lines[lines.length - 1];
    if (lastLine.length > 0 && currentLineWidth + spaceW + w > maxLineWidth && lines.length < 2) {
      lines.push([{ word: displayWord, index }]);
      currentLineWidth = w;
    } else {
      lastLine.push({ word: displayWord, index });
      currentLineWidth += (lastLine.length > 1 ? spaceW : 0) + w;
    }
  });

  const lineHeight = fontSize * 1.28;
  const startY = baseY - ((lines.length - 1) * lineHeight) / 2;

  lines.forEach((line, lineIdx) => {
    const lineText = line.map((item) => item.word).join(' ');
    const totalW = ctx.measureText(lineText).width;
    const ly = startY + lineIdx * lineHeight;

    if (style === 'clean_editorial') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
      ctx.beginPath();
      ctx.roundRect((width - totalW) / 2 - 18, ly - lineHeight * 0.48, totalW + 36, lineHeight * 0.96, 10);
      ctx.fill();
    }

    let cursorX = (width - totalW) / 2;
    line.forEach((item, idxInLine) => {
      const wWidth = ctx.measureText(item.word).width;
      const isCurrent = item.index === activeWordIdx;
      const isEmphasis =
        cue.emphasisWord && item.word.toLowerCase().includes(cue.emphasisWord.toLowerCase().replace(/[^a-z0-9]/gi, ''));

      if (style === 'karaoke_pill' && isCurrent) {
        ctx.fillStyle = '#F59E0B';
        ctx.beginPath();
        ctx.roundRect(cursorX - 8, ly - fontSize * 0.62, wWidth + 16, fontSize * 1.24, 8);
        ctx.fill();
      }

      if (style === 'bold_impact' || style === 'neon_kinetic') {
        ctx.lineWidth = Math.max(4, Math.round(fontSize * 0.22));
        ctx.strokeStyle = '#000000';
        ctx.lineJoin = 'round';
        ctx.strokeText(item.word, cursorX, ly);
      }

      if (style === 'karaoke_pill' && isCurrent) {
        ctx.fillStyle = '#000000';
      } else if (isCurrent || isEmphasis) {
        ctx.fillStyle = '#F59E0B';
      } else {
        ctx.fillStyle = '#FFFFFF';
      }

      ctx.fillText(item.word, cursorX, ly);
      cursorX += wWidth + (idxInLine < line.length - 1 ? spaceW : 0);
    });
  });

  ctx.restore();
}

export async function exportClipToWebm(params: {
  clip: GeneratedClip;
  customization: ClipCustomization;
  videoUrl?: string;
  fallbackImageUrl?: string;
  onProgress: (pct: number) => void;
}): Promise<Blob> {
  const { clip, customization, videoUrl, fallbackImageUrl, onProgress } = params;
  const width = 720;
  const height = 1280;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  let videoEl: HTMLVideoElement | null = null;
  let imgEl: HTMLImageElement | null = null;

  if (videoUrl) {
    videoEl = document.createElement('video');
    videoEl.src = videoUrl;
    videoEl.crossOrigin = 'anonymous';
    videoEl.playsInline = true;
    videoEl.muted = false;

    await new Promise<void>((resolve, reject) => {
      if (!videoEl) return reject(new Error('Video element missing'));
      videoEl.onloadedmetadata = () => resolve();
      videoEl.onerror = () => reject(new Error('Could not load source video for export.'));
    });

    videoEl.currentTime = clip.startTime;
    await new Promise<void>((resolve) => {
      if (!videoEl) return resolve();
      videoEl.onseeked = () => resolve();
      setTimeout(resolve, 400);
    });
  } else if (fallbackImageUrl) {
    imgEl = new Image();
    imgEl.crossOrigin = 'anonymous';
    imgEl.src = fallbackImageUrl;
    await new Promise<void>((resolve) => {
      if (!imgEl) return resolve();
      imgEl.onload = () => resolve();
      imgEl.onerror = () => resolve();
    });
  }

  const stream = canvas.captureStream(30);
  if (videoEl && 'captureStream' in videoEl) {
    try {
      const vStream = (videoEl as any).captureStream() as MediaStream;
      vStream.getAudioTracks().forEach((track) => stream.addTrack(track));
    } catch {
      // proceed with video track if audio capture restricted
    }
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : 'video/webm';

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4_500_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const exportCustomization: ClipCustomization = {
    ...customization,
    showSafeZones: false,
  };

  const clipDuration = Math.max(2, clip.endTime - clip.startTime);

  return new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      if (videoEl) {
        videoEl.pause();
        videoEl.src = '';
      }
      resolve(new Blob(chunks, { type: mimeType }));
    };
    recorder.onerror = () => reject(new Error('MediaRecorder export failed.'));

    recorder.start(100);
    const startTs = performance.now();
    if (videoEl) {
      videoEl.play().catch(() => {});
    }

    const tick = () => {
      const elapsedSec = videoEl
        ? Math.max(0, videoEl.currentTime - clip.startTime)
        : (performance.now() - startTs) / 1000;

      const pct = Math.min(99, Math.round((elapsedSec / clipDuration) * 100));
      onProgress(pct);

      renderClipFrame({
        ctx,
        width,
        height,
        source: videoEl || imgEl,
        sourceWidth: videoEl ? videoEl.videoWidth : imgEl?.naturalWidth || 1280,
        sourceHeight: videoEl ? videoEl.videoHeight : imgEl?.naturalHeight || 720,
        clip,
        relativeTime: elapsedSec,
        customization: exportCustomization,
      });

      if (elapsedSec >= clipDuration || (videoEl && videoEl.ended)) {
        onProgress(100);
        recorder.stop();
        return;
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}

export async function synthesizeSampleFootageVideo(): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const stream = canvas.captureStream(30);
  const audioCtx = new AudioContext();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const dest = audioCtx.createMediaStreamDestination();
  osc.type = 'sine';
  osc.frequency.value = 220;
  gain.gain.value = 0.04;
  osc.connect(gain);
  gain.connect(dest);
  osc.start();
  dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));

  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const durationMs = 9000;
  const scenes = [
    { label: '01 · HOOK: WHY 90% OF CREATORS QUIT AT 1K', sub: 'Retention drops in the first 2.4 seconds' },
    { label: '02 · FRAMEWORK: THE 3-BEAT VISUAL RESET', sub: 'Dynamic framing keeps viewers locked in' },
    { label: '03 · RESULT: 4.8X SHORTS & REELS REACH', sub: 'Automated multi-platform publishing workflow' },
  ];

  return new Promise<File>((resolve) => {
    recorder.onstop = () => {
      osc.stop();
      audioCtx.close();
      const blob = new Blob(chunks, { type: 'video/webm' });
      resolve(new File([blob], 'creator-podcast-masterclass.webm', { type: 'video/webm' }));
    };

    recorder.start(100);
    const start = performance.now();

    const draw = () => {
      const elapsed = performance.now() - start;
      const t = elapsed / 1000;
      const sceneIdx = Math.min(2, Math.floor(elapsed / 3000));
      const scene = scenes[sceneIdx];

      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, 1280, 720);

      // Animated studio backdrop bars
      for (let i = 0; i < 24; i++) {
        const barH = 40 + Math.abs(Math.sin(t * 3.5 + i * 0.45)) * 180;
        ctx.fillStyle = i % 3 === 0 ? 'rgba(245,158,11,0.32)' : 'rgba(255,255,255,0.08)';
        ctx.fillRect(140 + i * 42, 360 - barH / 2, 24, barH);
      }

      // Simulated left & right speakers
      ctx.fillStyle = '#18181b';
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(80, 140, 480, 440, 20);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.roundRect(720, 140, 480, 440, 20);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(scene.label, 640, 90);

      ctx.fillStyle = '#f59e0b';
      ctx.font = '600 24px sans-serif';
      ctx.fillText(scene.sub, 640, 648);

      ctx.fillStyle = '#a1a1aa';
      ctx.font = '600 20px monospace';
      ctx.fillText(`HOST A · ${t.toFixed(1)}s`, 320, 360);
      ctx.fillText(`GUEST B · ${t.toFixed(1)}s`, 960, 360);

      if (elapsed >= durationMs) {
        recorder.stop();
        return;
      }
      requestAnimationFrame(draw);
    };

    requestAnimationFrame(draw);
  });
}
