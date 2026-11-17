export type LayoutTemplateId =
  | 'auto_reframe'
  | 'split_screen'
  | 'blurred_cinema'
  | 'podcast_focus'
  | 'clean_minimal';

export type SubtitleStyleId =
  | 'bold_impact'
  | 'clean_editorial'
  | 'karaoke_pill'
  | 'minimal_mono'
  | 'neon_kinetic';

export type TargetPlatform = 'both' | 'youtube_shorts' | 'instagram_reels';

export interface SubtitleCue {
  id: string;
  start: number; // relative seconds within the clip (0 .. duration)
  end: number;
  text: string;
  emphasisWord?: string;
}

export interface ClipScores {
  overall: number;
  hookStrength: number;
  retentionPacing: number;
  shareability: number;
}

export interface GeneratedClip {
  id: string;
  title: string;
  hookHeadline: string;
  startTime: number; // seconds in source video
  endTime: number; // seconds in source video
  duration: number;
  scores: ClipScores;
  recommendedTemplate: LayoutTemplateId;
  recommendedSubtitleStyle: SubtitleStyleId;
  recommendedPlatform: TargetPlatform;
  socialCaption: string;
  hashtags: string[];
  reasoning: string;
  subtitles: SubtitleCue[];
}

export interface VideoSourceMeta {
  sourceType: 'upload' | 'youtube' | 'livestream';
  title: string;
  author?: string;
  thumbnailUrl?: string;
  youtubeVideoId?: string;
  sourceUrl?: string;
  localVideoUrl?: string; // Object URL for uploaded / captured video
  durationSeconds: number;
  hasRealTranscript: boolean;
}

export interface ConnectedAccount {
  connected: boolean;
  provider: 'youtube' | 'instagram';
  displayName?: string;
  handle?: string;
  avatarUrl?: string;
  accountType?: string;
  connectedAt?: string;
  configured: boolean;
  callbackUrl: string;
  missingVars?: string[];
}

export interface AccountsState {
  youtube: ConnectedAccount;
  instagram: ConnectedAccount;
}

export interface PublishJob {
  id: string;
  clipId: string;
  clipTitle: string;
  platform: 'youtube_shorts' | 'instagram_reels';
  status: 'scheduled' | 'publishing' | 'published' | 'failed';
  scheduledFor?: string;
  publishedUrl?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface ClipCustomization {
  template: LayoutTemplateId;
  subtitleStyle: SubtitleStyleId;
  platformTarget: TargetPlatform;
  subtitleYPercent: number; // 55 - 88
  subtitleScale: number; // 0.8 - 1.4
  showHookBanner: boolean;
  showSafeZones: boolean;
}
