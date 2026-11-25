import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  Calendar,
  ChevronRight,
  Clock,
  Film,
  Globe,
  Home,
  Lock,
  LogIn,
  LogOut,
  Plus,
  Search,
  Sparkles,
  Ticket,
  Trash2,
  User as UserIcon,
  Users,
  X
} from 'lucide-react';
import { getYouTubeThumbnail } from '../lib/youtube';
import {
  AUDITORIUM_SEATS,
  type CinemaRoom,
  type HomeTab,
  type OnlinePresenceUser,
  type RecentRoom,
  type RoomNotification,
  type UserProfile,
  type WatchParty
} from '../types/cinema';
import { Avatar } from './Avatar';

const HERO_SLIDES = [
  {
    kicker: 'Your Virtual Room',
    highlight: 'YVR',
    subtitle: 'With Friends',
    caption: 'Synchronized YouTube & web screenings inside your private cinema auditorium'
  },
  {
    kicker: 'Live Cinema Seats',
    highlight: 'YVR',
    subtitle: 'Landscape Hall',
    caption: 'See friends seated in crimson velvet chairs facing the giant screen'
  },
  {
    kicker: 'Live Reactions',
    highlight: 'CHAT',
    subtitle: 'Watch & Chat',
    caption: 'Type with your phone or built-in keyboard and send live seat reactions'
  }
];

interface HomeViewProps {
  user: UserProfile | null;
  authLoading: boolean;
  activeTab: HomeTab;
  onChangeTab: (tab: HomeTab) => void;
  publicRooms: CinemaRoom[];
  myRooms: CinemaRoom[];
  recentRooms: RecentRoom[];
  watchParties: WatchParty[];
  roomOnlineCounts: Record<string, number>;
  onlineUsers: OnlinePresenceUser[];
  notifications: RoomNotification[];
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenCreateRoom: () => void;
  onOpenJoinCode: () => void;
  onOpenScheduleParty: () => void;
  onJoinRoomCode: (code: string) => void;
  onDeleteWatchParty: (partyId: string) => void;
  onUpdateProfile: (updates: {
    displayName?: string;
    preferredSeat?: string;
    notificationsEnabled?: boolean;
    autoLandscape?: boolean;
  }) => Promise<void>;
}

export function HomeView({
  user,
  authLoading,
  activeTab,
  onChangeTab,
  publicRooms,
  myRooms,
  recentRooms,
  watchParties,
  roomOnlineCounts,
  onlineUsers,
  notifications,
  onSignIn,
  onSignOut,
  onOpenCreateRoom,
  onOpenJoinCode,
  onOpenScheduleParty,
  onJoinRoomCode,
  onDeleteWatchParty,
  onUpdateProfile
}: HomeViewProps) {
  const [heroIdx, setHeroIdx] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [roomFilter, setRoomFilter] = useState<'all' | 'mine' | 'public'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [profileName, setProfileName] = useState(user?.displayName || '');
  const [profileSaved, setProfileSaved] = useState(false);

  const hero = HERO_SLIDES[heroIdx];

  // Combine unique rooms for "Your Rooms" & "Rooms" directory
  const combinedRoomMap = new Map<string, CinemaRoom>();
  myRooms.forEach((r) => combinedRoomMap.set(r.code, r));
  publicRooms.forEach((r) => {
    if (!combinedRoomMap.has(r.code)) combinedRoomMap.set(r.code, r);
  });

  const filteredRooms = Array.from(combinedRoomMap.values()).filter((room) => {
    if (roomFilter === 'mine' && !myRooms.some((m) => m.code === room.code)) return false;
    if (roomFilter === 'public' && !room.isPublic) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        room.name.toLowerCase().includes(q) ||
        room.code.toLowerCase().includes(q) ||
        room.currentVideoTitle.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    await onUpdateProfile({ displayName: profileName || user.displayName });
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const navItems: { id: HomeTab; label: string; icon: typeof Home }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'rooms', label: 'Rooms', icon: Film },
    { id: 'activity', label: 'Activity', icon: Bell },
    { id: 'profile', label: 'Profile', icon: UserIcon }
  ];

  return (
    <div className="min-h-screen bg-[#070506] text-[#F5EFEA] pb-24 lg:pb-10">
      {/* Subtle top ambient burgundy glow */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-72 opacity-50"
        style={{
          background:
            'radial-gradient(ellipse 75% 60% at 50% -15%, rgba(158, 27, 50, 0.34), transparent 72%)'
        }}
      />

      {/* Top App Bar */}
      <header className="sticky top-0 z-30 cinema-glass border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand Zone */}
          <button
            type="button"
            onClick={() => onChangeTab('home')}
            className="flex items-center gap-3 text-left cursor-pointer shrink-0"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#C8233F] to-[#6E0E21] flex items-center justify-center shadow-[0_4px_16px_rgba(190,28,60,0.4)]">
              <Ticket className="w-5 h-5 text-white -rotate-12" />
            </div>
            <div className="leading-tight">
              <span className="block text-base sm:text-lg font-bold font-display tracking-tight text-white whitespace-nowrap">
                CineHall
              </span>
              <span className="block text-[11px] text-[#9E8F8A] whitespace-nowrap">
                Watch Together · Your Virtual Room (YVR)
              </span>
            </div>
          </button>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-[#A99B96]">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeTab(item.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === item.id
                    ? 'text-white border-b-2 border-[#C8233F]'
                    : 'hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowNotifications(true)}
              aria-label="Notifications"
              className="relative w-10 h-10 rounded-full hover:bg-white/8 flex items-center justify-center text-[#DCD0CC] transition-colors cursor-pointer"
            >
              <Bell className="w-5 h-5" />
              {notifications.length > 0 && (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[#C8233F]" />
              )}
            </button>

            {authLoading ? (
              <div className="w-9 h-9 rounded-full bg-white/10 animate-pulse" />
            ) : user ? (
              <button
                type="button"
                onClick={() => onChangeTab('profile')}
                className="cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E5C17B]"
                aria-label="Open profile"
              >
                <Avatar src={user.photoURL} name={user.displayName} size="sm" isOnline />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSignIn}
                className="h-9 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-medium text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 text-[#E5C17B]" />
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6">
        {activeTab === 'home' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            {/* Left / Primary Column (Hero + Primary CTAs) */}
            <div className="lg:col-span-7 space-y-4">
              {/* Cinematic PVR Hero Banner */}
              <div className="relative rounded-3xl overflow-hidden border border-[#E5C17B]/15 shadow-[0_20px_60px_rgba(0,0,0,0.75)] aspect-[16/10] sm:aspect-[16/9]">
                <img
                  src="/src/assets/images/cinehall_hero_backdrop_1795595809364.jpg"
                  alt="CineHall Your Virtual Room auditorium with velvet curtains and popcorn"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-[#070506]/90" />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'radial-gradient(circle at 50% 42%, rgba(229,193,123,0.16), transparent 58%)'
                  }}
                />

                <div className="relative h-full flex flex-col items-center justify-between py-6 sm:py-8 px-6 text-center">
                  <div className="h-2" />
                  <motion.div
                    key={heroIdx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-1 max-w-md"
                  >
                    <p className="text-sm sm:text-base font-medium text-[#F5EFEA]/90 tracking-wide">
                      {hero.kicker}
                    </p>
                    <h1 className="text-5xl sm:text-6xl font-extrabold font-display tracking-wider champagne-text drop-shadow-[0_4px_24px_rgba(229,193,123,0.3)]">
                      {hero.highlight}
                    </h1>
                    <p className="text-base sm:text-lg font-medium text-[#F5EFEA]">
                      {hero.subtitle}
                    </p>
                    <p className="hidden sm:block text-xs text-[#CFC2BE]/80 pt-1 text-balance">
                      {hero.caption}
                    </p>
                  </motion.div>

                  {/* Carousel Indicators */}
                  <div className="flex items-center gap-2">
                    {HERO_SLIDES.map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        aria-label={`Slide ${idx + 1}`}
                        onClick={() => setHeroIdx(idx)}
                        className={`h-1.5 rounded-full transition-all cursor-pointer ${
                          heroIdx === idx ? 'w-5 bg-[#F5EFEA]' : 'w-1.5 bg-white/35 hover:bg-white/60'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Primary & Secondary CTAs (matching reference image) */}
              <div className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
                <button
                  type="button"
                  onClick={onOpenCreateRoom}
                  className="w-full h-13 rounded-2xl cinema-cta-gradient text-white font-semibold text-sm sm:text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                  Create Room
                </button>

                <button
                  type="button"
                  onClick={onOpenJoinCode}
                  className="w-full h-13 rounded-2xl bg-[#191114] hover:bg-[#23171B] border border-white/12 text-[#F5EFEA] font-medium text-sm sm:text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Ticket className="w-4 h-4 text-[#E5C17B]" />
                  Join with Code
                </button>
              </div>

              {/* Sign-in Prompt Banner if Guest */}
              {!authLoading && !user && (
                <div className="rounded-2xl bg-[#150C10] border border-[#E5C17B]/20 p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#F5EFEA]">Sign in with Google to host or save rooms</p>
                    <p className="text-xs text-[#A89A95] mt-0.5">
                      Sync seats, watch queues, and watch parties across your devices.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="px-4 h-10 rounded-xl bg-[#E5C17B] hover:bg-[#F3DBA8] text-[#140B0E] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Continue
                  </button>
                </div>
              )}

              {/* Upcoming Watch Parties */}
              <section className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold font-display text-[#F5EFEA]">Upcoming Watch Parties</h2>
                  <button
                    type="button"
                    onClick={onOpenScheduleParty}
                    className="text-xs font-medium text-[#E5C17B] hover:text-[#F3DBA8] flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Schedule
                  </button>
                </div>

                {watchParties.length === 0 ? (
                  <div className="rounded-2xl bg-[#120A0D] border border-white/[0.07] p-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-[#D8CCC8]">No scheduled screenings yet</p>
                      <p className="text-xs text-[#8F7F7A] mt-0.5">Schedule a premiere and invite friends with a room code.</p>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenScheduleParty}
                      className="px-3.5 h-9 rounded-xl bg-white/8 hover:bg-white/12 text-xs font-medium text-[#F5EFEA] whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Plan Night
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {watchParties.slice(0, 3).map((party) => {
                      const showDate = new Date(party.scheduledFor);
                      const formatted = Number.isNaN(showDate.getTime())
                        ? party.scheduledFor
                        : showDate.toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          });
                      return (
                        <div
                          key={party.id}
                          className="flex items-center gap-3 p-3 rounded-2xl bg-[#130B0E] border border-white/[0.07]"
                        >
                          <img
                            src={getYouTubeThumbnail(party.videoId)}
                            alt={party.videoTitle}
                            referrerPolicy="no-referrer"
                            className="w-18 h-12 rounded-xl object-cover shrink-0 bg-black"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[#F5EFEA] truncate">{party.title}</p>
                            <p className="text-xs text-[#9E8F8A] truncate">
                              {formatted} · Host {party.hostName}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onJoinRoomCode(party.roomCode)}
                            className="px-3.5 h-9 rounded-xl bg-[#9E1B32]/25 hover:bg-[#9E1B32]/40 border border-[#9E1B32]/40 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Join
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Recently Watched Videos */}
              {recentRooms.length > 0 && (
                <section className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold font-display text-[#F5EFEA]">Recently Watched Videos</h2>
                    <span className="text-xs text-[#8F7F7A] tabular-nums">{recentRooms.length} recent</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {recentRooms.slice(0, 6).map((item) => (
                      <button
                        key={`watched-${item.code}`}
                        type="button"
                        onClick={() => onJoinRoomCode(item.code)}
                        className="group rounded-2xl overflow-hidden bg-[#130B0E] border border-white/[0.07] hover:border-[#E5C17B]/35 text-left transition-colors cursor-pointer"
                      >
                        <div className="relative aspect-video w-full bg-black overflow-hidden">
                          <img
                            src={getYouTubeThumbnail(item.lastVideoId)}
                            alt={item.lastVideoTitle}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                          <span className="absolute bottom-1.5 right-1.5 text-[10px] font-mono text-[#F3DBA8] bg-black/70 px-1.5 py-0.5 rounded">
                            {item.code}
                          </span>
                        </div>
                        <div className="p-2.5">
                          <p className="text-xs font-medium text-[#F5EFEA] truncate">{item.lastVideoTitle}</p>
                          <p className="text-[10px] text-[#9E8F8A] truncate mt-0.5">{item.name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Right / Secondary Column (Your Rooms + Online Now) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Your Rooms / Recently Joined Rooms */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold font-display text-[#F5EFEA]">Your Rooms</h2>
                  <button
                    type="button"
                    onClick={() => onChangeTab('rooms')}
                    className="text-xs text-[#A89A95] hover:text-white flex items-center gap-0.5 cursor-pointer"
                  >
                    See All
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {recentRooms.length === 0 && publicRooms.length === 0 ? (
                  <div className="rounded-2xl bg-[#120A0D] border border-white/[0.07] p-6 text-center space-y-2">
                    <Film className="w-7 h-7 text-[#8F7F7A] mx-auto" />
                    <p className="text-sm font-medium text-[#D8CCC8]">No active cinema halls yet</p>
                    <p className="text-xs text-[#8F7F7A]">Create your first virtual YVR room or enter a friend’s code.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {(recentRooms.length > 0
                      ? recentRooms.slice(0, 4).map((r) => ({
                          code: r.code,
                          name: r.name,
                          videoId: r.lastVideoId,
                          isPublic: r.isPublic
                        }))
                      : publicRooms.slice(0, 4).map((r) => ({
                          code: r.code,
                          name: r.name,
                          videoId: r.currentVideoId,
                          isPublic: r.isPublic
                        }))
                    ).map((room) => {
                      const onlineCount = roomOnlineCounts[room.code] || 0;
                      return (
                        <div
                          key={room.code}
                          className="flex items-center gap-3 p-3 rounded-2xl bg-[#140B0E] border border-white/[0.08] hover:border-white/15 transition-colors"
                        >
                          <img
                            src={getYouTubeThumbnail(room.videoId)}
                            alt={room.name}
                            referrerPolicy="no-referrer"
                            className="w-20 h-13 rounded-xl object-cover shrink-0 bg-black"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[#F5EFEA] truncate">{room.name}</p>
                            <p className="text-xs text-[#9E8F8A] flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[#E5C17B]">{room.code}</span>
                              <span>·</span>
                              <span className="tabular-nums">
                                {onlineCount > 0 ? `${onlineCount} Online` : room.isPublic ? 'Public' : 'Private'}
                              </span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onJoinRoomCode(room.code)}
                            className="px-4 h-9 rounded-full cinema-cta-gradient text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Join
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Online Friends / Viewers Connected Right Now */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold font-display text-[#F5EFEA]">Online in CineHall</h2>
                  <span className="text-xs text-[#9E8F8A] tabular-nums">{onlineUsers.length} active</span>
                </div>

                {onlineUsers.length === 0 ? (
                  <div className="rounded-2xl bg-[#120A0D] border border-white/[0.07] p-5 text-center space-y-1.5">
                    <Users className="w-6 h-6 text-[#8F7F7A] mx-auto" />
                    <p className="text-xs text-[#9E8F8A]">Sign in and open a room to see friends online in real time.</p>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-[#130B0E] border border-white/[0.07] p-4 space-y-3">
                    <div className="flex items-center gap-3 overflow-x-auto pb-1">
                      {onlineUsers.map((person) => (
                        <div key={person.uid} className="flex flex-col items-center gap-1.5 shrink-0 w-16 text-center">
                          <Avatar src={person.photoURL} name={person.displayName} size="md" isOnline />
                          <span className="text-[11px] font-medium text-[#E5DAD6] truncate w-full">
                            {person.uid === user?.uid ? 'You' : person.displayName.split(' ')[0]}
                          </span>
                          <span className="text-[10px] text-[#8E7F7A] truncate w-full">
                            {person.roomName || 'Lobby'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* ==================== ROOMS DIRECTORY TAB ==================== */}
        {activeTab === 'rooms' && (
          <div className="space-y-5 max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold font-display text-white">Cinema Halls</h1>
                <p className="text-xs text-[#9E8F8A]">Join a public hall or return to your private watch rooms</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenJoinCode}
                  className="h-10 px-4 rounded-xl bg-white/8 hover:bg-white/12 text-xs font-medium text-white cursor-pointer"
                >
                  Enter Code
                </button>
                <button
                  type="button"
                  onClick={onOpenCreateRoom}
                  className="h-10 px-4 rounded-xl cinema-cta-gradient text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  New Room
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#8E7F7A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by room name, code, or video..."
                  className="w-full h-11 rounded-xl bg-[#150C10] border border-white/10 pl-10 pr-4 text-sm text-white placeholder:text-[#7E6F6B] focus:outline-none focus:border-[#E5C17B]/50"
                />
              </div>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#150C10] border border-white/8 self-start">
                {(['all', 'mine', 'public'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setRoomFilter(f)}
                    className={`px-3.5 h-9 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      roomFilter === f ? 'bg-[#9E1B32] text-white' : 'text-[#A89A95] hover:text-white'
                    }`}
                  >
                    {f === 'all' ? 'All Halls' : f === 'mine' ? 'My Rooms' : 'Public'}
                  </button>
                ))}
              </div>
            </div>

            {filteredRooms.length === 0 ? (
              <div className="rounded-3xl bg-[#120A0D] border border-white/8 p-10 text-center space-y-3">
                <Film className="w-8 h-8 text-[#8E7F7A] mx-auto" />
                <p className="text-sm font-medium text-[#DCD0CC]">No matching cinema rooms found</p>
                <button
                  type="button"
                  onClick={onOpenCreateRoom}
                  className="px-5 h-10 rounded-xl cinema-cta-gradient text-white text-xs font-semibold cursor-pointer"
                >
                  Create a New Hall
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredRooms.map((room) => {
                  const liveCount = roomOnlineCounts[room.code] || 0;
                  return (
                    <div
                      key={room.code}
                      className="rounded-2xl bg-[#140B0E] border border-white/[0.08] overflow-hidden flex flex-col"
                    >
                      <div className="relative aspect-video bg-black">
                        <img
                          src={getYouTubeThumbnail(room.currentVideoId)}
                          alt={room.currentVideoTitle}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#140B0E] via-transparent to-black/35" />
                        <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-xs text-white/90">
                          <span className="font-mono text-[#F3DBA8]">{room.code}</span>
                          <span className="tabular-nums">
                            {liveCount > 0 ? `${liveCount} watching now` : `${room.memberUids.length} members`}
                          </span>
                        </div>
                      </div>
                      <div className="p-4 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{room.name}</p>
                          <p className="text-xs text-[#9E8F8A] truncate flex items-center gap-1.5 mt-0.5">
                            {room.isPublic ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                            <span>Host: {room.hostName}</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onJoinRoomCode(room.code)}
                          className="px-4 h-9 rounded-xl cinema-cta-gradient text-white text-xs font-semibold shrink-0 cursor-pointer"
                        >
                          Enter
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================== ACTIVITY TAB ==================== */}
        {activeTab === 'activity' && (
          <div className="space-y-6 max-w-3xl mx-auto">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold font-display text-white">Activity & Showtimes</h1>
                <p className="text-xs text-[#9E8F8A]">Live room notifications and upcoming watch parties</p>
              </div>
              <button
                type="button"
                onClick={onOpenScheduleParty}
                className="h-10 px-4 rounded-xl cinema-cta-gradient text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Calendar className="w-4 h-4" />
                Schedule
              </button>
            </div>

            <section className="space-y-2.5">
              <h2 className="text-sm font-semibold text-[#E5C17B]">Scheduled Watch Parties</h2>
              {watchParties.length === 0 ? (
                <div className="rounded-2xl bg-[#130B0E] border border-white/8 p-5 text-xs text-[#9E8F8A]">
                  No upcoming watch parties scheduled yet.
                </div>
              ) : (
                watchParties.map((party) => (
                  <div
                    key={party.id}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#140B0E] border border-white/8"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{party.title}</p>
                      <p className="text-xs text-[#9E8F8A] mt-0.5">
                        {party.videoTitle} · Room <span className="font-mono text-[#E5C17B]">{party.roomCode}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onJoinRoomCode(party.roomCode)}
                        className="px-3.5 h-9 rounded-xl bg-[#9E1B32] text-white text-xs font-semibold cursor-pointer"
                      >
                        Join
                      </button>
                      {user?.uid === party.hostId && (
                        <button
                          type="button"
                          onClick={() => onDeleteWatchParty(party.id)}
                          aria-label="Delete watch party"
                          className="w-9 h-9 rounded-xl bg-white/5 hover:bg-rose-500/20 text-[#A89A95] hover:text-rose-300 flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className="space-y-2.5">
              <h2 className="text-sm font-semibold text-[#E5C17B]">Live Session Log</h2>
              {notifications.length === 0 ? (
                <div className="rounded-2xl bg-[#130B0E] border border-white/8 p-5 text-xs text-[#9E8F8A]">
                  Room joins, host changes, and cinema alerts will appear here in real time.
                </div>
              ) : (
                <div className="space-y-2">
                  {notifications.map((ntf) => (
                    <div
                      key={ntf.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-[#140B0E] border border-white/[0.06]"
                    >
                      <span className="text-xs text-[#E5DAD6]">{ntf.message}</span>
                      <span className="text-[11px] font-mono tabular-nums text-[#857671] shrink-0 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(ntf.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ==================== PROFILE TAB ==================== */}
        {activeTab === 'profile' && (
          <div className="max-w-xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold font-display text-white">Cinema Profile</h1>

            {!user ? (
              <div className="rounded-3xl bg-[#140B0E] border border-white/10 p-7 text-center space-y-4">
                <Sparkles className="w-8 h-8 text-[#E5C17B] mx-auto" />
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold font-display">Sign in to CineHall</h2>
                  <p className="text-xs text-[#9E8F8A]">
                    Use your Google account to create private YVR rooms, pick your signature seat, and save recent rooms.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onSignIn}
                  className="w-full h-12 rounded-xl cinema-cta-gradient text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  Sign in with Google
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-3xl bg-[#140B0E] border border-white/10 p-5 flex items-center gap-4">
                  <Avatar src={user.photoURL} name={user.displayName} size="lg" isOnline />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-white truncate">{user.displayName}</p>
                    <p className="text-xs text-[#9E8F8A] truncate">{user.email}</p>
                    <p className="text-xs text-[#E5C17B] mt-1 font-mono">Favorite Seat: {user.preferredSeat}</p>
                  </div>
                </div>

                <form onSubmit={handleSaveProfile} className="rounded-3xl bg-[#140B0E] border border-white/10 p-5 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-[#9E8F8A]">Display Name</label>
                    <input
                      type="text"
                      maxLength={60}
                      value={profileName || user.displayName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full h-11 rounded-xl bg-[#1D1216] border border-white/10 px-3.5 text-sm text-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-[#9E8F8A]">Preferred Default Seat</label>
                    <select
                      value={user.preferredSeat}
                      onChange={(e) => void onUpdateProfile({ preferredSeat: e.target.value })}
                      className="w-full h-11 rounded-xl bg-[#1D1216] border border-white/10 px-3.5 text-sm text-white font-mono"
                    >
                      {AUDITORIUM_SEATS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id} — {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <div>
                      <p className="text-sm font-medium text-white">Auto Landscape Cinema</p>
                      <p className="text-xs text-[#8E7F7A]">Request landscape lock on Enter Cinema</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onUpdateProfile({ autoLandscape: !user.autoLandscape })}
                      className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                        user.autoLandscape !== false ? 'bg-[#9E1B32]' : 'bg-white/15'
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                          user.autoLandscape !== false ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="w-full h-11 rounded-xl cinema-cta-gradient text-white text-sm font-semibold cursor-pointer"
                  >
                    {profileSaved ? 'Saved Preferences' : 'Save Profile'}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={onSignOut}
                  className="w-full h-11 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-[#D8CCC8] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (matching reference image) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 cinema-glass border-t border-white/[0.08] pb-safe">
        <div className="max-w-md mx-auto grid grid-cols-4 h-16 items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeTab(item.id)}
                className={`flex flex-col items-center justify-center gap-1 h-full cursor-pointer transition-colors ${
                  active ? 'text-[#E11D48]' : 'text-[#8F807B] hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Notifications Drawer */}
      <AnimatePresence>
        {showNotifications && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setShowNotifications(false)}
          >
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#120A0D] border border-white/10 p-5 space-y-4 max-h-[75vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold font-display text-white">Notifications</h3>
                <button
                  type="button"
                  onClick={() => setShowNotifications(false)}
                  aria-label="Close notifications"
                  className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-[#CFC2BE] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {notifications.length === 0 ? (
                <p className="text-xs text-[#8E7F7A] py-6 text-center">No recent cinema notifications.</p>
              ) : (
                <div className="space-y-2">
                  {notifications.map((n) => (
                    <div key={n.id} className="p-3 rounded-xl bg-white/[0.04] border border-white/6 text-xs text-[#E5DAD6]">
                      {n.message}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
