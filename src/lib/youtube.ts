const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export interface CuratedVideo {
  videoId: string;
  title: string;
  duration: string;
  genre: string;
}

export const CURATED_CINEMA_VIDEOS: CuratedVideo[] = [
  {
    videoId: 'eRsGyueVLvQ',
    title: 'Sintel — Open Cinema Short Film',
    duration: '14:48',
    genre: 'Fantasy'
  },
  {
    videoId: 'R6MlUcmOul8',
    title: 'Tears of Steel — Sci-Fi Feature Short',
    duration: '12:14',
    genre: 'Sci-Fi'
  },
  {
    videoId: 'WhWc3b3KhnY',
    title: 'Spring — Atmospheric Animated Film',
    duration: '07:44',
    genre: 'Animation'
  },
  {
    videoId: 'UXqq0ZvbOnk',
    title: 'Charge — Action Short Film (4K)',
    duration: '04:01',
    genre: 'Action'
  },
  {
    videoId: 'mN0zPOpADL4',
    title: 'Agent 327: Operation Barbershop',
    duration: '03:51',
    genre: 'Thriller'
  }
];

export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (VIDEO_ID_REGEX.test(trimmed)) return trimmed;

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id && VIDEO_ID_REGEX.test(id) ? id : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const vParam = url.searchParams.get('v');
      if (vParam && VIDEO_ID_REGEX.test(vParam)) return vParam;

      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0])) {
        return VIDEO_ID_REGEX.test(parts[1]) ? parts[1] : null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function getYouTubeThumbnail(videoId: string): string {
  if (!VIDEO_ID_REGEX.test(videoId)) {
    return '/src/assets/images/cinehall_hero_backdrop_1795595809364.jpg';
  }
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export interface VideoMetadataResult {
  videoId: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  embeddableWarning?: boolean;
}

export async function fetchYouTubeMetadata(videoId: string): Promise<VideoMetadataResult> {
  const fallback: VideoMetadataResult = {
    videoId,
    title: `YouTube Video (${videoId})`,
    author: 'YouTube',
    thumbnailUrl: getYouTubeThumbnail(videoId)
  };

  if (!VIDEO_ID_REGEX.test(videoId)) return fallback;

  try {
    const response = await fetch(`/api/youtube/oembed?videoId=${encodeURIComponent(videoId)}`);
    if (!response.ok) return fallback;
    const data = (await response.json()) as VideoMetadataResult;
    return {
      videoId,
      title: data.title || fallback.title,
      author: data.author || 'YouTube',
      thumbnailUrl: data.thumbnailUrl || fallback.thumbnailUrl,
      embeddableWarning: data.embeddableWarning
    };
  } catch {
    return fallback;
  }
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) return `${hrs}:${pad(mins)}:${pad(secs)}`;
  return `${pad(mins)}:${pad(secs)}`;
}
