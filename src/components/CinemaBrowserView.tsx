import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Film,
  Globe,
  Home,
  Loader2,
  Play,
  RotateCw,
  Search,
  Sparkles,
  Tv
} from 'lucide-react';
import { extractYouTubeVideoId, fetchYouTubeMetadata } from '../lib/youtube';

interface BrowserSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

interface QuickBookmark {
  title: string;
  subtitle: string;
  url: string;
  accent: string;
}

const QUICK_BOOKMARKS: QuickBookmark[] = [
  {
    title: 'Bing Search',
    subtitle: 'Live web search',
    url: 'https://www.bing.com',
    accent: 'from-sky-500/25 to-blue-600/10 border-sky-400/25'
  },
  {
    title: 'Wikipedia',
    subtitle: 'Free encyclopedia',
    url: 'https://en.m.wikipedia.org/wiki/Main_Page',
    accent: 'from-amber-400/20 to-amber-700/10 border-[#E5C17B]/25'
  },
  {
    title: 'Archive Movies',
    subtitle: 'Free classic films',
    url: 'https://archive.org/details/movies',
    accent: 'from-rose-500/25 to-rose-900/10 border-rose-400/25'
  },
  {
    title: 'Vimeo Watch',
    subtitle: 'Curated short films',
    url: 'https://vimeo.com/watch',
    accent: 'from-cyan-500/25 to-teal-900/10 border-cyan-400/25'
  }
];

function normalizeSafeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return null;

  const hasProtocol = /^https?:\/\//i.test(trimmed);
  const looksLikeDomain = !/\s/.test(trimmed) && /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(trimmed);

  if (!hasProtocol && !looksLikeDomain) {
    return null;
  }

  try {
    const parsed = new URL(hasProtocol ? trimmed : `https://${trimmed}`);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

interface HistoryEntry {
  mode: 'home' | 'search' | 'web';
  url: string;
  query: string;
}

interface CinemaBrowserViewProps {
  browserUrl: string;
  browserQuery: string;
  isHost: boolean;
  focusMode: boolean;
  onNavigate: (url: string, query: string) => void;
  onSwitchToYouTube: (videoId?: string, title?: string) => void;
  onStageTap: () => void;
}

export function CinemaBrowserView({
  browserUrl,
  browserQuery,
  isHost,
  focusMode,
  onNavigate,
  onSwitchToYouTube,
  onStageTap
}: CinemaBrowserViewProps) {
  const [addressInput, setAddressInput] = useState(browserUrl || browserQuery || '');
  const [viewMode, setViewMode] = useState<'home' | 'search' | 'web'>(() =>
    browserUrl ? 'web' : browserQuery ? 'search' : 'home'
  );
  const [activeUrl, setActiveUrl] = useState(browserUrl);
  const [activeQuery, setActiveQuery] = useState(browserQuery);
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeLoading, setIframeLoading] = useState(false);

  const [searchResults, setSearchResults] = useState<BrowserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryEntry[]>([
    {
      mode: browserUrl ? 'web' : browserQuery ? 'search' : 'home',
      url: browserUrl,
      query: browserQuery
    }
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [detectedYouTubeId, setDetectedYouTubeId] = useState<string | null>(null);
  const [switchingYt, setSwitchingYt] = useState(false);

  const lastSyncedRef = useRef({ url: browserUrl, query: browserQuery });

  const runSearch = useCallback(async (query: string) => {
    const clean = query.trim();
    if (!clean) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/browser/search?q=${encodeURIComponent(clean)}`);
      if (!res.ok) throw new Error('Search service temporarily unavailable.');
      const data = (await res.json()) as { results?: BrowserSearchResult[] };
      setSearchResults(Array.isArray(data.results) ? data.results : []);
    } catch {
      setSearchResults([]);
      setSearchError('Could not load instant results. Try Live Bing Web below.');
    } finally {
      setSearching(false);
    }
  }, []);

  // Sync incoming host navigations for all room viewers
  useEffect(() => {
    const prev = lastSyncedRef.current;
    if (prev.url === browserUrl && prev.query === browserQuery) return;
    lastSyncedRef.current = { url: browserUrl, query: browserQuery };

    if (browserUrl) {
      const safe = normalizeSafeHttpUrl(browserUrl);
      if (safe) {
        setActiveUrl(safe);
        setActiveQuery(browserQuery);
        setAddressInput(safe);
        setViewMode('web');
        setIframeLoading(true);
        setDetectedYouTubeId(extractYouTubeVideoId(safe));
      }
    } else if (browserQuery) {
      setActiveUrl('');
      setActiveQuery(browserQuery);
      setAddressInput(browserQuery);
      setViewMode('search');
      setDetectedYouTubeId(null);
      void runSearch(browserQuery);
    } else {
      setActiveUrl('');
      setActiveQuery('');
      setAddressInput('');
      setViewMode('home');
      setDetectedYouTubeId(null);
    }
  }, [browserUrl, browserQuery, runSearch]);

  // Initial search fetch if room opened directly on a query
  useEffect(() => {
    if (!browserUrl && browserQuery) {
      void runSearch(browserQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushHistory = (entry: HistoryEntry) => {
    setHistory((prev) => {
      const next = [...prev.slice(0, historyIndex + 1), entry].slice(-25);
      setHistoryIndex(next.length - 1);
      return next;
    });
  };

  const openWebUrl = (rawUrl: string, queryContext = '') => {
    const safe = normalizeSafeHttpUrl(rawUrl);
    if (!safe) return;
    const ytId = extractYouTubeVideoId(safe);
    setDetectedYouTubeId(ytId);
    setActiveUrl(safe);
    setActiveQuery(queryContext);
    setAddressInput(safe);
    setViewMode('web');
    setIframeLoading(true);
    pushHistory({ mode: 'web', url: safe, query: queryContext });
    lastSyncedRef.current = { url: safe, query: queryContext };
    if (isHost) {
      onNavigate(safe, queryContext);
    }
  };

  const performSearch = (rawQuery: string) => {
    const q = rawQuery.trim();
    if (!q) return;
    setDetectedYouTubeId(null);
    setActiveUrl('');
    setActiveQuery(q);
    setAddressInput(q);
    setViewMode('search');
    pushHistory({ mode: 'search', url: '', query: q });
    lastSyncedRef.current = { url: '', query: q };
    if (isHost) {
      onNavigate('', q);
    }
    void runSearch(q);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = addressInput.trim();
    if (!raw) return;

    const ytId = extractYouTubeVideoId(raw);
    if (ytId && /youtu\.?be/i.test(raw)) {
      setDetectedYouTubeId(ytId);
      void handlePlayDetectedYouTube(ytId);
      return;
    }

    const safeUrl = normalizeSafeHttpUrl(raw);
    if (safeUrl) {
      openWebUrl(safeUrl, '');
    } else {
      performSearch(raw);
    }
  };

  const handlePlayDetectedYouTube = async (videoId: string) => {
    setSwitchingYt(true);
    try {
      const meta = await fetchYouTubeMetadata(videoId);
      onSwitchToYouTube(meta.videoId, meta.title);
    } catch {
      onSwitchToYouTube(videoId, `YouTube Video (${videoId})`);
    } finally {
      setSwitchingYt(false);
    }
  };

  const handleGoHome = () => {
    setActiveUrl('');
    setActiveQuery('');
    setAddressInput('');
    setViewMode('home');
    setDetectedYouTubeId(null);
    pushHistory({ mode: 'home', url: '', query: '' });
    lastSyncedRef.current = { url: '', query: '' };
    if (isHost) {
      onNavigate('', '');
    }
  };

  const handleBack = () => {
    if (historyIndex <= 0) return;
    const prevIdx = historyIndex - 1;
    const target = history[prevIdx];
    setHistoryIndex(prevIdx);
    setViewMode(target.mode);
    setActiveUrl(target.url);
    setActiveQuery(target.query);
    setAddressInput(target.url || target.query);
    setDetectedYouTubeId(target.url ? extractYouTubeVideoId(target.url) : null);
    if (target.mode === 'search' && target.query) {
      void runSearch(target.query);
    }
    if (isHost) {
      onNavigate(target.url, target.query);
    }
  };

  const handleForward = () => {
    if (historyIndex >= history.length - 1) return;
    const nextIdx = historyIndex + 1;
    const target = history[nextIdx];
    setHistoryIndex(nextIdx);
    setViewMode(target.mode);
    setActiveUrl(target.url);
    setActiveQuery(target.query);
    setAddressInput(target.url || target.query);
    setDetectedYouTubeId(target.url ? extractYouTubeVideoId(target.url) : null);
    if (target.mode === 'search' && target.query) {
      void runSearch(target.query);
    }
    if (isHost) {
      onNavigate(target.url, target.query);
    }
  };

  const handleReload = () => {
    if (viewMode === 'web' && activeUrl) {
      setIframeLoading(true);
      setIframeKey((k) => k + 1);
    } else if (viewMode === 'search' && activeQuery) {
      void runSearch(activeQuery);
    }
  };

  const isSyncedWithHost =
    (browserUrl || '') === (activeUrl || '') && (browserQuery || '') === (activeQuery || '');

  return (
    <div
      onClick={onStageTap}
      className="relative w-full h-full rounded-xl overflow-hidden bg-[#0A0608] border border-white/12 shadow-[0_0_90px_rgba(0,0,0,0.92),0_0_32px_rgba(158,27,50,0.22)] flex flex-col select-none"
    >
      {/* Top Cinema Browser Navigation Chrome (Hidden in Focus Mode) */}
      {!focusMode && (
        <div className="px-2 sm:px-3 py-1.5 bg-[#120A0D]/95 border-b border-white/10 flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={handleBack}
              disabled={historyIndex <= 0}
              aria-label="Browser Back"
              className="w-7 h-7 rounded-lg hover:bg-white/10 disabled:opacity-30 flex items-center justify-center text-[#E5DAD6] cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleForward}
              disabled={historyIndex >= history.length - 1}
              aria-label="Browser Forward"
              className="w-7 h-7 rounded-lg hover:bg-white/10 disabled:opacity-30 flex items-center justify-center text-[#E5DAD6] cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleReload}
              aria-label="Reload page"
              className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-[#E5DAD6] cursor-pointer"
            >
              <RotateCw className={`w-3.5 h-3.5 ${iframeLoading || searching ? 'animate-spin text-[#E5C17B]' : ''}`} />
            </button>
            <button
              type="button"
              onClick={handleGoHome}
              aria-label="Browser Home"
              className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-[#E5DAD6] cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search / URL Omnibox */}
          <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-1 min-w-0">
            <div className="flex-1 flex items-center gap-1.5 h-8 rounded-lg bg-black/55 border border-white/12 focus-within:border-[#E5C17B]/70 px-2.5 min-w-0">
              <Search className="w-3.5 h-3.5 text-[#9E8F8A] shrink-0" />
              <input
                type="text"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                placeholder="Search anything or enter website URL..."
                className="flex-1 bg-transparent text-base sm:text-xs text-white placeholder:text-[#847570] focus:outline-none min-w-0"
              />
            </div>
            <button
              type="submit"
              className="px-2.5 h-8 rounded-lg cinema-cta-gradient text-white text-[11px] font-semibold shrink-0 cursor-pointer"
            >
              Go
            </button>
          </form>

          {/* Toggle between Web View and Search Results when both exist */}
          {viewMode === 'web' && activeQuery && (
            <button
              type="button"
              onClick={() => setViewMode('search')}
              className="hidden sm:flex px-2.5 h-7 rounded-lg bg-white/8 hover:bg-white/15 text-[10px] font-medium text-[#E5C17B] items-center gap-1 shrink-0 cursor-pointer"
            >
              <Search className="w-3 h-3" />
              Results
            </button>
          )}

          {/* Guest Sync Return Button */}
          {!isHost && !isSyncedWithHost && (browserUrl || browserQuery) && (
            <button
              type="button"
              onClick={() => {
                if (browserUrl) {
                  openWebUrl(browserUrl, browserQuery);
                } else if (browserQuery) {
                  performSearch(browserQuery);
                }
              }}
              className="px-2 h-7 rounded-lg bg-[#E5C17B]/20 border border-[#E5C17B]/40 text-[10px] font-semibold text-[#F3DBA8] shrink-0 cursor-pointer"
            >
              Sync Host
            </button>
          )}
        </div>
      )}

      {/* Optional YouTube link detection banner */}
      {!focusMode && detectedYouTubeId && (
        <div className="px-3 py-1.5 bg-[#9E1B32]/25 border-b border-[#C8233F]/35 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-[#F5EFEA] truncate">
            YouTube video detected — switch to synced Cinema Player for best playback!
          </span>
          <button
            type="button"
            disabled={switchingYt}
            onClick={() => void handlePlayDetectedYouTube(detectedYouTubeId)}
            className="px-2.5 h-6 rounded-md bg-[#C8233F] hover:bg-[#DF2C4B] text-white text-[10px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
          >
            {switchingYt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-white" />}
            Play on YouTube
          </button>
        </div>
      )}

      {/* === BROWSER VIEWPORT CONTENT === */}
      <div className="relative flex-1 min-h-0 overflow-hidden bg-[#090507]">
        {/* 1. BROWSER HOME PAGE */}
        {viewMode === 'home' && (
          <div className="w-full h-full overflow-y-auto touch-scroll p-4 sm:p-6 flex flex-col items-center justify-center">
            <div className="w-full max-w-lg space-y-4 sm:space-y-5">
              <div className="text-center space-y-1">
                <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[#E5C17B] font-semibold">
                  <Globe className="w-3.5 h-3.5" />
                  CineHall Built-In Browser
                </div>
                <h2 className="text-lg sm:text-2xl font-bold font-display text-white">
                  Search &amp; Watch Anything Together
                </h2>
                <p className="text-[11px] sm:text-xs text-[#9E8F8A]">
                  Search the web, open websites, or paste any link directly on the cinema screen.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 h-10 sm:h-11 rounded-xl bg-[#160D10] border border-white/12 focus-within:border-[#E5C17B]/70 px-3">
                  <Search className="w-4 h-4 text-[#E5C17B] shrink-0" />
                  <input
                    type="text"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    placeholder="Search movies, news, Wikipedia, or enter URL..."
                    className="flex-1 bg-transparent text-base sm:text-sm text-white placeholder:text-[#7E6F6B] focus:outline-none min-w-0"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 h-10 sm:h-11 rounded-xl cinema-cta-gradient text-white text-xs sm:text-sm font-semibold cursor-pointer shrink-0"
                >
                  Search
                </button>
              </form>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {QUICK_BOOKMARKS.map((site) => (
                  <button
                    key={site.title}
                    type="button"
                    onClick={() => openWebUrl(site.url, '')}
                    className={`rounded-xl bg-gradient-to-br ${site.accent} border p-2.5 text-left hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer`}
                  >
                    <p className="text-xs font-semibold text-white truncate">{site.title}</p>
                    <p className="text-[10px] text-[#C8BBB7] truncate mt-0.5">{site.subtitle}</p>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => onSwitchToYouTube()}
                  className="text-[11px] text-[#CFC2BE] hover:text-[#E5C17B] flex items-center gap-1.5 cursor-pointer"
                >
                  <Tv className="w-3.5 h-3.5 text-[#FF3B3B]" />
                  Switch back to YouTube Cinema
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. SEARCH RESULTS VIEW */}
        {viewMode === 'search' && (
          <div className="w-full h-full overflow-y-auto touch-scroll p-3 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/10">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-white truncate">
                  Results for &ldquo;{activeQuery}&rdquo;
                </p>
                <p className="text-[10px] text-[#9E8F8A]">
                  {isHost ? 'Synced across your cinema room' : 'Browsing in Cinema Browser'}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  openWebUrl(`https://www.bing.com/search?q=${encodeURIComponent(activeQuery)}`, activeQuery)
                }
                className="px-3 h-7 rounded-lg bg-[#E5C17B]/18 hover:bg-[#E5C17B]/28 border border-[#E5C17B]/40 text-[#F3DBA8] text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Globe className="w-3.5 h-3.5" />
                Open Live Bing Web
              </button>
            </div>

            {searching ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-[#B7A9A4]">
                <Loader2 className="w-5 h-5 animate-spin text-[#E5C17B]" />
                Searching the web...
              </div>
            ) : (
              <div className="space-y-2">
                {searchError && (
                  <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-xl px-3 py-2">
                    {searchError}
                  </p>
                )}

                {searchResults.length === 0 ? (
                  <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-5 text-center space-y-2.5">
                    <Sparkles className="w-5 h-5 text-[#E5C17B] mx-auto" />
                    <p className="text-xs text-[#D8CCC8]">
                      No instant summaries found for &ldquo;{activeQuery}&rdquo;. Open Live Bing Web right inside the cinema screen!
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        openWebUrl(`https://www.bing.com/search?q=${encodeURIComponent(activeQuery)}`, activeQuery)
                      }
                      className="px-4 h-8 rounded-lg cinema-cta-gradient text-white text-xs font-semibold cursor-pointer"
                    >
                      Search on Live Bing Web
                    </button>
                  </div>
                ) : (
                  searchResults.map((item, idx) => (
                    <button
                      key={`${item.url}-${idx}`}
                      type="button"
                      onClick={() => openWebUrl(item.url, activeQuery)}
                      className="w-full text-left rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/8 hover:border-[#E5C17B]/40 p-3 transition-colors cursor-pointer space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs sm:text-sm font-semibold text-[#F3DBA8] truncate">
                          {item.title}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/8 text-[#B7A9A4] shrink-0">
                          {item.source}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#CFC2BE] line-clamp-2 leading-relaxed">{item.snippet}</p>
                      <p className="text-[10px] text-emerald-300/80 font-mono truncate flex items-center gap-1">
                        <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        {item.url}
                      </p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* 3. LIVE EMBEDDED WEB VIEW */}
        {viewMode === 'web' && activeUrl && (
          <div className="relative w-full h-full bg-white">
            {iframeLoading && (
              <div className="absolute top-0 inset-x-0 h-0.5 bg-white/10 z-20 overflow-hidden">
                <div className="h-full w-1/2 bg-[#E5C17B] animate-pulse" />
              </div>
            )}

            <iframe
              key={`${activeUrl}-${iframeKey}`}
              src={activeUrl}
              title="CineHall Cinema Browser"
              onLoad={() => setIframeLoading(false)}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
              referrerPolicy="no-referrer"
              allowFullScreen
              className="w-full h-full border-0 bg-white"
            />

            {/* Unobtrusive fallback pill in case a third-party website blocks framing */}
            {!focusMode && (
              <div className="absolute bottom-2 right-2 z-20 flex items-center gap-1.5">
                {activeQuery && (
                  <button
                    type="button"
                    onClick={() => setViewMode('search')}
                    className="px-2.5 h-6 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-[10px] text-[#F5EFEA] hover:border-[#E5C17B]/50 cursor-pointer"
                  >
                    Back to Results
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openWebUrl(`https://www.bing.com/search?q=${encodeURIComponent(activeQuery || activeUrl)}`, activeQuery)}
                  className="px-2.5 h-6 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-[10px] text-[#E5C17B] hover:border-[#E5C17B]/50 flex items-center gap-1 cursor-pointer"
                >
                  <Film className="w-2.5 h-2.5" />
                  Site blank? Open Bing
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
