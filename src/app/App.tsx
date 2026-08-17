/**
 * X (Twitter) Clone — v2 Enhanced
 *
 * ── SUPABASE SETUP ──────────────────────────────────────────────────────────
 * 1. Create a project at https://supabase.com
 * 2. Run the SQL below in the Supabase SQL editor
 * 3. Create .env.local with:
 *      VITE_SUPABASE_URL=https://<ref>.supabase.co
 *      VITE_SUPABASE_ANON_KEY=<your-anon-key>
 * 4. npm install @supabase/supabase-js
 * 5. Swap mock state for Supabase queries (patterns shown in comments)
 *
 * ── SQL SCHEMA ───────────────────────────────────────────────────────────────
 * create extension if not exists "uuid-ossp";
 *
 * create table profiles (
 *   id            uuid primary key references auth.users on delete cascade,
 *   username      text unique not null,
 *   display_name  text not null,
 *   avatar_url    text,
 *   banner_url    text,
 *   bio           text,
 *   location      text,
 *   website       text,
 *   created_at    timestamptz default now()
 * );
 *
 * create table tweets (
 *   id         uuid primary key default uuid_generate_v4(),
 *   profile_id uuid references profiles on delete cascade not null,
 *   content    text check (char_length(content) <= 280) not null,
 *   image_url  text,
 *   parent_id  uuid references tweets on delete cascade,
 *   created_at timestamptz default now()
 * );
 *
 * create table likes (
 *   id         uuid primary key default uuid_generate_v4(),
 *   profile_id uuid references profiles on delete cascade not null,
 *   tweet_id   uuid references tweets  on delete cascade not null,
 *   created_at timestamptz default now(),
 *   unique (profile_id, tweet_id)
 * );
 *
 * create table follows (
 *   id           uuid primary key default uuid_generate_v4(),
 *   follower_id  uuid references profiles on delete cascade not null,
 *   following_id uuid references profiles on delete cascade not null,
 *   created_at   timestamptz default now(),
 *   unique (follower_id, following_id)
 * );
 *
 * -- RLS policies
 * alter table profiles enable row level security;
 * alter table tweets   enable row level security;
 * alter table likes    enable row level security;
 * alter table follows  enable row level security;
 *
 * create policy "public read profiles"  on profiles for select using (true);
 * create policy "own update profile"    on profiles for update using (auth.uid() = id);
 * create policy "public read tweets"    on tweets   for select using (true);
 * create policy "insert own tweet"      on tweets   for insert with check (auth.uid() = profile_id);
 * create policy "delete own tweet"      on tweets   for delete using (auth.uid() = profile_id);
 * create policy "public read likes"     on likes    for select using (true);
 * create policy "manage own likes"      on likes    for all   using (auth.uid() = profile_id);
 * create policy "public read follows"   on follows  for select using (true);
 * create policy "manage own follows"    on follows  for all   using (auth.uid() = follower_id);
 *
 * ── SUPABASE CLIENT EXAMPLE ──────────────────────────────────────────────────
 * // lib/supabase.ts
 * import { createClient } from "@supabase/supabase-js";
 * export const supabase = createClient(
 *   import.meta.env.VITE_SUPABASE_URL,
 *   import.meta.env.VITE_SUPABASE_ANON_KEY
 * );
 *
 * // Fetch feed
 * const { data } = await supabase
 *   .from("tweets")
 *   .select("*, profiles(*), likes(count)")
 *   .is("parent_id", null)
 *   .order("created_at", { ascending: false });
 *
 * // Real-time likes
 * supabase.channel("likes")
 *   .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, handler)
 *   .subscribe();
 */

import {
  useState, useCallback, useEffect, useRef,
  createContext, useContext, type ReactNode,
} from "react";
import { Toaster, toast } from "sonner";
import {
  Home, Search, Bell, Mail, Bookmark, User, MoreHorizontal,
  X, Image, Smile, MapPin, BarChart2, Heart, MessageCircle,
  Repeat2, Share, ArrowLeft, Calendar, Link as LinkIcon,
  Sun, Moon, LogOut, Hash, Pencil, Check, Camera,
  ChevronDown, Feather, AtSign, EyeOff, Globe,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  location?: string;
  website?: string;
  joinedDate: string;
  followersCount: number;
  followingCount: number;
  tweetsCount: number;
  isFollowing: boolean;
  isVerified?: boolean;
  bannerUrl?: string;
}

interface Tweet {
  id: string;
  authorId: string;
  author: UserProfile;
  content: string;
  imageUrl?: string;
  createdAt: string;
  likesCount: number;
  repliesCount: number;
  retweetsCount: number;
  viewsCount: number;
  liked: boolean;
  retweeted: boolean;
  parentId?: string;
}

type View = "feed" | "profile" | "tweet-detail" | "notifications" | "explore" | "bookmarks";
type AuthView = "landing" | "login" | "signup";
type FeedTab = "for-you" | "following";

// ─── Context ──────────────────────────────────────────────────────────────────

interface AppCtx {
  currentUser: UserProfile;
  isDark: boolean;
  toggleDark: () => void;
  view: View;
  selectedUser: UserProfile | null;
  selectedTweet: Tweet | null;
  tweets: Tweet[];
  users: UserProfile[];
  unreadNotifs: number;
  navTo: (v: View, user?: UserProfile | null, tweet?: Tweet | null) => void;
  likeTweet: (id: string) => void;
  retweetTweet: (id: string) => void;
  postTweet: (content: string, imageUrl?: string, parentId?: string) => void;
  deleteTweet: (id: string) => void;
  followUser: (userId: string) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  logout: () => void;
  openCompose: (parentId?: string, replyTo?: UserProfile) => void;
}

const Ctx = createContext<AppCtx | null>(null);
const useApp = () => useContext(Ctx)!;

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_USERS: UserProfile[] = [
  {
    id: "u1", username: "elonmusk", displayName: "Elon Musk", isVerified: true,
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=96&h=96&fit=crop&auto=format",
    bannerUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=700&h=233&fit=crop&auto=format",
    bio: "CEO of X & SpaceX. Technoking of Tesla. Building the future 🚀",
    location: "Austin, TX", website: "spacex.com", joinedDate: "March 2009",
    followersCount: 180_400_000, followingCount: 642, tweetsCount: 42_100, isFollowing: false,
  },
  {
    id: "u2", username: "sama", displayName: "Sam Altman", isVerified: true,
    avatarUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=96&h=96&fit=crop&auto=format",
    bannerUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=700&h=233&fit=crop&auto=format",
    bio: "CEO at OpenAI. Eternal optimist about technology and the future.",
    location: "San Francisco, CA", website: "openai.com", joinedDate: "January 2010",
    followersCount: 2_100_000, followingCount: 312, tweetsCount: 8_400, isFollowing: true,
  },
  {
    id: "u3", username: "karpathy", displayName: "Andrej Karpathy", isVerified: true,
    avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&h=96&fit=crop&auto=format",
    bannerUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=700&h=233&fit=crop&auto=format",
    bio: "AI researcher. Previously OpenAI & Tesla. Neural nets are beautiful.",
    location: "San Francisco", website: "karpathy.ai", joinedDate: "June 2013",
    followersCount: 842_000, followingCount: 198, tweetsCount: 5_200, isFollowing: false,
  },
  {
    id: "u4", username: "naval", displayName: "Naval", isVerified: false,
    avatarUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=96&h=96&fit=crop&auto=format",
    bannerUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=700&h=233&fit=crop&auto=format",
    bio: "Seek wealth, not money or status. AngelList founder. Philosopher.",
    location: "San Francisco, CA", website: "nav.al", joinedDate: "February 2009",
    followersCount: 1_900_000, followingCount: 57, tweetsCount: 12_300, isFollowing: true,
  },
  {
    id: "u5", username: "paulg", displayName: "Paul Graham", isVerified: false,
    avatarUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=96&h=96&fit=crop&auto=format",
    bannerUrl: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=700&h=233&fit=crop&auto=format",
    bio: "Co-founder of Y Combinator. Lisp programmer. Essay writer.",
    location: "Cambridge, MA", website: "paulgraham.com", joinedDate: "April 2009",
    followersCount: 1_600_000, followingCount: 389, tweetsCount: 18_200, isFollowing: false,
  },
  {
    id: "u6", username: "lexfridman", displayName: "Lex Fridman", isVerified: true,
    avatarUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=96&h=96&fit=crop&auto=format",
    bannerUrl: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=700&h=233&fit=crop&auto=format",
    bio: "AI researcher, podcaster, MIT. Conversations at the frontier of science.",
    location: "Boston, MA", website: "lexfridman.com", joinedDate: "August 2011",
    followersCount: 3_200_000, followingCount: 1_400, tweetsCount: 24_100, isFollowing: false,
  },
];

const SEED_USER: UserProfile = {
  id: "u0", username: "you", displayName: "Your Name", isVerified: false,
  avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=96&h=96&fit=crop&auto=format",
  bannerUrl: "https://images.unsplash.com/photo-1519125323398-675f0ddb6308?w=700&h=233&fit=crop&auto=format",
  bio: "Just joined X. Excited to be here! 👋",
  location: "New York", joinedDate: "August 2024",
  followersCount: 42, followingCount: 12, tweetsCount: 7, isFollowing: false,
};

const T = Date.now();
const SEED_TWEETS: Tweet[] = [
  {
    id: "t1", authorId: "u1", author: MOCK_USERS[0],
    content: "The future is multiplanetary. We need to become a spacefaring civilization before something wipes us out on Earth.\n\nThis is why SpaceX exists. Starship will carry humanity to Mars within this decade.",
    createdAt: new Date(T - 3_600_000 * 1.5).toISOString(),
    likesCount: 248_700, repliesCount: 12_400, retweetsCount: 34_200, viewsCount: 48_200_000,
    liked: false, retweeted: false,
  },
  {
    id: "t2", authorId: "u2", author: MOCK_USERS[1],
    content: "o3 is now available in the API. This is the most capable model we've ever shipped.\n\nThe performance on coding and reasoning benchmarks is genuinely staggering. We're entering a new era.",
    imageUrl: "https://images.unsplash.com/photo-1677442135968-6d89469c9fc3?w=600&h=320&fit=crop&auto=format",
    createdAt: new Date(T - 3_600_000 * 4).toISOString(),
    likesCount: 89_400, repliesCount: 4_200, retweetsCount: 18_700, viewsCount: 12_100_000,
    liked: true, retweeted: false,
  },
  {
    id: "t3", authorId: "u3", author: MOCK_USERS[2],
    content: "Neural networks are just matrix multiplications stacked on top of each other.\n\nOnce you truly internalize this, everything else follows naturally. The math is not that scary — the intuition is what takes time.",
    createdAt: new Date(T - 3_600_000 * 7).toISOString(),
    likesCount: 42_100, repliesCount: 1_840, retweetsCount: 8_900, viewsCount: 3_400_000,
    liked: false, retweeted: false,
  },
  {
    id: "t4", authorId: "u4", author: MOCK_USERS[3],
    content: "Seek wealth, not money or status.\n\nWealth is having assets that earn while you sleep. Money is how we transfer time and wealth. Status is your rank in the social hierarchy.\n\nYou are not going to get rich renting out your time.",
    createdAt: new Date(T - 3_600_000 * 11).toISOString(),
    likesCount: 127_000, repliesCount: 3_200, retweetsCount: 41_000, viewsCount: 8_900_000,
    liked: false, retweeted: true,
  },
  {
    id: "t5", authorId: "u5", author: MOCK_USERS[4],
    content: "The startups most likely to succeed are the ones where the founders build something they themselves desperately want to use — not something they think they can sell.",
    createdAt: new Date(T - 3_600_000 * 16).toISOString(),
    likesCount: 58_200, repliesCount: 2_100, retweetsCount: 14_400, viewsCount: 4_200_000,
    liked: false, retweeted: false,
  },
  {
    id: "t6", authorId: "u6", author: MOCK_USERS[5],
    content: "Just dropped my 3-hour conversation with Geoffrey Hinton. We talked about consciousness, intelligence, and why he left Google.\n\nOne of the most profound conversations of my career.",
    imageUrl: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=600&h=320&fit=crop&auto=format",
    createdAt: new Date(T - 3_600_000 * 22).toISOString(),
    likesCount: 71_200, repliesCount: 8_900, retweetsCount: 12_400, viewsCount: 9_100_000,
    liked: false, retweeted: false,
  },
  {
    id: "t7", authorId: "u1", author: MOCK_USERS[0],
    content: "X is the everything app. Banking, messaging, news, jobs — all in one place.\n\nWe're just getting started. The transformation is happening faster than anyone expected. 🚀",
    createdAt: new Date(T - 3_600_000 * 30).toISOString(),
    likesCount: 312_000, repliesCount: 22_100, retweetsCount: 47_800, viewsCount: 89_000_000,
    liked: false, retweeted: false,
  },
];

const TRENDING = [
  { cat: "Technology · Trending", tag: "#AI", count: "284K" },
  { cat: "Science · Trending", tag: "#Starship", count: "128K" },
  { cat: "Finance · Trending", tag: "#Bitcoin", count: "94.2K" },
  { cat: "Technology · Trending", tag: "#OpenAI", count: "76.1K" },
  { cat: "World · Trending", tag: "#ClimateAction", count: "52.4K" },
];

const NOTIF_SEED = [
  { id: 1, user: MOCK_USERS[0], action: "liked your post", time: "2h", emoji: "❤️", read: false },
  { id: 2, user: MOCK_USERS[1], action: "followed you", time: "4h", emoji: "👤", read: false },
  { id: 3, user: MOCK_USERS[2], action: "reposted your post", time: "6h", emoji: "🔁", read: true },
  { id: 4, user: MOCK_USERS[3], action: 'replied: "Totally agree!"', time: "8h", emoji: "💬", read: false },
  { id: 5, user: MOCK_USERS[4], action: "mentioned you", time: "1d", emoji: "📣", read: true },
  { id: 6, user: MOCK_USERS[5], action: "liked your reply", time: "2d", emoji: "❤️", read: true },
];

// ─── Utils ────────────────────────────────────────────────────────────────────

function relTime(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "now";
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  if (d < 604800) return `${Math.floor(d / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function longDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    hour: "numeric", minute: "2-digit",
    month: "long", day: "numeric", year: "numeric",
  });
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Primitives ───────────────────────────────────────────────────────────────

const XLogo = ({ cls = "w-7 h-7" }: { cls?: string }) => (
  <svg viewBox="0 0 24 24" className={`fill-current ${cls}`}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const Badge = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#1d9bf0" className="flex-shrink-0 inline">
    <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.648.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.773-1.046.904-1.681s.072-1.297-.164-1.903c.586-.274 1.084-.705 1.44-1.246.356-.54.555-1.17.572-1.817zm-6.423 3.99l-3.726 3.722-1.835-1.834-.009-.009-1.704-1.704 1.415-1.414 1.705 1.705 3.726-3.726 1.414 1.414-.986.846z" />
  </svg>
);

const Avt = ({
  user, size = 40, ring = false, onClick, className = "",
}: {
  user: UserProfile; size?: number; ring?: boolean; onClick?: () => void; className?: string;
}) => (
  <img
    src={user.avatarUrl}
    alt={user.displayName}
    style={{ width: size, height: size, minWidth: size }}
    className={`rounded-full object-cover cursor-pointer transition-opacity hover:opacity-85 flex-shrink-0 ${ring ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""} ${className}`}
    onClick={e => { e.stopPropagation(); onClick?.(); }}
  />
);

const FollowBtn = ({ user, compact = false }: { user: UserProfile; compact?: boolean }) => {
  const { followUser } = useApp();
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={e => { e.stopPropagation(); followUser(user.id); }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={`font-bold rounded-full transition-all text-sm flex-shrink-0 ${compact ? "px-3.5 py-1" : "px-4 py-1.5"} ${
        user.isFollowing
          ? hov
            ? "border border-red-500 text-red-500 bg-red-500/10"
            : "border border-border text-foreground"
          : "bg-foreground text-background hover:opacity-90"
      }`}
    >
      {user.isFollowing ? (hov ? "Unfollow" : "Following") : "Follow"}
    </button>
  );
};

// ─── Compose Modal ────────────────────────────────────────────────────────────

interface ComposeState { open: boolean; parentId?: string; replyTo?: UserProfile; }

const ComposeModal = ({
  state, onClose,
}: { state: ComposeState; onClose: () => void }) => {
  const { currentUser, postTweet, selectedTweet } = useApp();
  const [content, setContent] = useState("");
  const [imgUrl, setImgUrl] = useState("");
  const [imgInput, setImgInput] = useState(false);
  const [imgDraft, setImgDraft] = useState("");
  const [audience, setAudience] = useState<"everyone" | "followers">("everyone");
  const ref = useRef<HTMLTextAreaElement>(null);
  const MAX = 280;
  const left = MAX - content.length;
  const pct = Math.min((content.length / MAX) * 100, 100);
  const R = 9;
  const circ = 2 * Math.PI * R;

  useEffect(() => {
    if (state.open) {
      setContent(""); setImgUrl(""); setImgDraft(""); setImgInput(false);
      setTimeout(() => ref.current?.focus(), 50);
    }
  }, [state.open]);

  if (!state.open) return null;

  const submit = () => {
    if (!content.trim() || left < 0) return;
    postTweet(content.trim(), imgUrl || undefined, state.parentId);
    onClose();
  };

  const applyImg = () => {
    setImgUrl(imgDraft.trim());
    setImgInput(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] px-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-background w-full max-w-[600px] rounded-2xl shadow-2xl border border-border overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border">
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <button className="text-primary font-bold text-sm hover:bg-primary/10 px-4 py-1.5 rounded-full transition-colors">
            Drafts
          </button>
        </div>

        <div className="px-4 pt-4 pb-2">
          {/* Reply context */}
          {state.replyTo && (
            <p className="text-muted-foreground text-sm mb-3 ml-12">
              Replying to{" "}
              <span className="text-primary font-medium">@{state.replyTo.username}</span>
            </p>
          )}

          <div className="flex gap-3">
            <Avt user={currentUser} size={40} ring />

            <div className="flex-1 min-w-0">
              {/* Audience selector */}
              <button
                onClick={() => setAudience(a => a === "everyone" ? "followers" : "everyone")}
                className="mb-2 flex items-center gap-1 text-primary text-sm font-bold border border-primary/40 rounded-full px-3 py-0.5 hover:bg-primary/10 transition-colors"
              >
                {audience === "everyone" ? <Globe className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {audience === "everyone" ? "Everyone" : "Followers"}
                <ChevronDown className="w-3 h-3" />
              </button>

              <textarea
                ref={ref}
                value={content}
                onChange={e => setContent(e.target.value)}
                onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit(); }}
                placeholder={state.parentId ? "Post your reply…" : "What's happening?"}
                rows={state.parentId ? 2 : 4}
                className="w-full bg-transparent text-foreground text-xl placeholder:text-muted-foreground resize-none outline-none leading-relaxed"
              />

              {/* Image preview */}
              {imgUrl && (
                <div className="relative mt-2 rounded-2xl overflow-hidden border border-border">
                  <img src={imgUrl} alt="preview" className="w-full max-h-72 object-cover" />
                  <button
                    onClick={() => setImgUrl("")}
                    className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white rounded-full p-1.5 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Image URL input */}
              {imgInput && !imgUrl && (
                <div className="mt-2 flex gap-2">
                  <input
                    autoFocus
                    value={imgDraft}
                    onChange={e => setImgDraft(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && applyImg()}
                    placeholder="Paste image URL…"
                    className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button onClick={applyImg} className="bg-primary text-white px-3 py-1.5 rounded-lg text-sm font-bold">
                    Add
                  </button>
                  <button onClick={() => setImgInput(false)} className="text-muted-foreground hover:text-foreground px-2">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border mt-2">
          <div className="flex items-center gap-0.5 text-primary">
            {[
              { Icon: Image, action: () => setImgInput(i => !i), tip: "Add image URL" },
              { Icon: BarChart2, action: () => {}, tip: "Poll" },
              { Icon: Smile, action: () => {}, tip: "Emoji" },
              { Icon: MapPin, action: () => {}, tip: "Location" },
            ].map(({ Icon, action, tip }) => (
              <button
                key={tip}
                onClick={action}
                title={tip}
                className="p-2.5 rounded-full hover:bg-primary/10 transition-colors"
              >
                <Icon className="w-[18px] h-[18px]" />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {content.length > 0 && (
              <svg width="28" height="28" viewBox="0 0 28 28" className="flex-shrink-0 -rotate-90">
                <circle cx="14" cy="14" r={R + 1} fill="none" strokeWidth="2"
                  stroke="currentColor" className="text-muted opacity-25" />
                <circle cx="14" cy="14" r={R + 1} fill="none" strokeWidth="2"
                  stroke={left < 0 ? "#f4212e" : left <= 20 ? "#ffd400" : "#1d9bf0"}
                  strokeDasharray={circ}
                  strokeDashoffset={circ - (pct / 100) * circ}
                  strokeLinecap="round" />
                {left <= 20 && (
                  <text x="14" y="18" textAnchor="middle" fontSize="8" fontWeight="700"
                    fill={left < 0 ? "#f4212e" : "#71767b"} transform="rotate(90, 14, 14)">
                    {left}
                  </text>
                )}
              </svg>
            )}
            <div className="w-px h-6 bg-border" />
            <button
              onClick={submit}
              disabled={!content.trim() || left < 0}
              className="bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold px-5 py-2 rounded-full transition-colors text-[15px]"
            >
              {state.parentId ? "Reply" : "Post"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Tweet Card ───────────────────────────────────────────────────────────────

const ActBtn = ({
  icon: Icon, label, count, active, color, hoverBg, filled = false, onClick,
}: {
  icon: React.ElementType; label: string; count?: number; active?: boolean;
  color: string; hoverBg: string; filled?: boolean; onClick?: (e: React.MouseEvent) => void;
}) => (
  <button
    aria-label={label}
    onClick={onClick}
    className={`group flex items-center gap-1 transition-colors ${active ? color : `text-muted-foreground hover:${color}`}`}
  >
    <span className={`p-2 rounded-full transition-colors group-hover:${hoverBg}`}>
      <Icon className={`w-[18px] h-[18px] ${active && filled ? "fill-current" : ""}`} />
    </span>
    {count !== undefined && count > 0 && (
      <span className="text-sm tabular-nums leading-none">{fmt(count)}</span>
    )}
  </button>
);

const TweetCard = ({ tweet }: { tweet: Tweet }) => {
  const { likeTweet, retweetTweet, deleteTweet, currentUser, navTo, openCompose } = useApp();
  const isOwn = tweet.authorId === currentUser.id;
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // close menu on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menu && !menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menu]);

  return (
    <article
      className="flex gap-3 px-4 py-3 border-b border-border hover:bg-white/[0.015] cursor-pointer transition-colors group/card"
      onClick={() => navTo("tweet-detail", null, tweet)}
    >
      <div className="flex-shrink-0 pt-0.5">
        <Avt user={tweet.author} size={42} onClick={() => navTo("profile", tweet.author, null)} />
      </div>

      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-start justify-between gap-1">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span
              className="font-extrabold text-[15px] hover:underline cursor-pointer truncate max-w-[130px] sm:max-w-xs"
              onClick={e => { e.stopPropagation(); navTo("profile", tweet.author, null); }}
            >
              {tweet.author.displayName}
            </span>
            {tweet.author.isVerified && <Badge />}
            <span className="text-muted-foreground text-[15px] truncate">
              @{tweet.author.username}
            </span>
            <span className="text-muted-foreground text-[15px]">·</span>
            <span className="text-muted-foreground text-[15px] flex-shrink-0">{relTime(tweet.createdAt)}</span>
          </div>

          {/* More menu */}
          <div ref={menuRef} className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setMenu(m => !m)}
              className="p-1.5 rounded-full opacity-0 group-hover/card:opacity-100 hover:bg-primary/10 hover:text-primary transition-all text-muted-foreground"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menu && (
              <div className="absolute right-0 top-8 z-50 w-52 bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden">
                {isOwn && (
                  <button
                    onClick={() => { deleteTweet(tweet.id); setMenu(false); }}
                    className="flex items-center gap-3 w-full px-4 py-3.5 text-red-500 hover:bg-muted text-sm font-bold transition-colors"
                  >
                    <X className="w-4 h-4" /> Delete post
                  </button>
                )}
                <button className="flex items-center gap-3 w-full px-4 py-3.5 text-foreground hover:bg-muted text-sm font-bold transition-colors">
                  <AtSign className="w-4 h-4" /> Mention @{tweet.author.username}
                </button>
                <button className="flex items-center gap-3 w-full px-4 py-3.5 text-foreground hover:bg-muted text-sm font-bold transition-colors">
                  <EyeOff className="w-4 h-4" /> Not interested
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <p className="text-[15px] leading-[1.5] whitespace-pre-wrap break-words mt-0.5 text-foreground">
          {tweet.content}
        </p>

        {/* Image */}
        {tweet.imageUrl && (
          <div className="mt-3 rounded-2xl overflow-hidden border border-border bg-muted">
            <img
              src={tweet.imageUrl}
              alt="Tweet media"
              className="w-full max-h-80 object-cover"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        )}

        {/* Actions */}
        <div
          className="flex items-center justify-between mt-3 max-w-sm text-muted-foreground"
          onClick={e => e.stopPropagation()}
        >
          <ActBtn icon={MessageCircle} label="Reply" count={tweet.repliesCount}
            color="text-primary" hoverBg="bg-primary/10"
            onClick={e => { e.stopPropagation(); openCompose(tweet.id, tweet.author); }}
          />
          <ActBtn icon={Repeat2} label="Repost" count={tweet.retweetsCount} active={tweet.retweeted}
            color="text-green-500" hoverBg="bg-green-500/10"
            onClick={e => { e.stopPropagation(); retweetTweet(tweet.id); }}
          />
          <ActBtn icon={Heart} label="Like" count={tweet.likesCount} active={tweet.liked} filled
            color="text-pink-500" hoverBg="bg-pink-500/10"
            onClick={e => { e.stopPropagation(); likeTweet(tweet.id); }}
          />
          <ActBtn icon={BarChart2} label="Views" count={tweet.viewsCount}
            color="text-primary" hoverBg="bg-primary/10"
          />
          <ActBtn icon={Share} label="Share" color="text-primary" hoverBg="bg-primary/10" />
        </div>
      </div>
    </article>
  );
};

// ─── Inline Composer (feed header) ───────────────────────────────────────────

const InlineComposer = () => {
  const { currentUser, postTweet, openCompose } = useApp();
  const [active, setActive] = useState(false);
  const [content, setContent] = useState("");
  const MAX = 280;
  const left = MAX - content.length;

  const submit = () => {
    if (!content.trim() || left < 0) return;
    postTweet(content.trim());
    setContent("");
    setActive(false);
  };

  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex gap-3">
        <Avt user={currentUser} size={42} ring onClick={() => {}} className="mt-0.5" />
        <div className="flex-1 min-w-0">
          <textarea
            value={content}
            onChange={e => { setContent(e.target.value); setActive(true); }}
            onFocus={() => setActive(true)}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit(); }}
            placeholder="What's happening?"
            rows={active ? 3 : 1}
            className="w-full bg-transparent text-foreground text-xl placeholder:text-muted-foreground resize-none outline-none leading-relaxed pt-2"
          />

          {active && (
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
              <div className="flex items-center gap-0 text-primary">
                {[Image, BarChart2, Smile, MapPin].map((Icon, i) => (
                  <button key={i} className="p-2.5 rounded-full hover:bg-primary/10 transition-colors">
                    <Icon className="w-[18px] h-[18px]" />
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                {content.length > 0 && (
                  <span className={`text-sm tabular-nums font-medium ${left <= 20 ? (left < 0 ? "text-red-500" : "text-yellow-500") : "text-muted-foreground"}`}>
                    {left}
                  </span>
                )}
                <button
                  onClick={submit}
                  disabled={!content.trim() || left < 0}
                  className="bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold px-4 py-1.5 rounded-full transition-colors text-[15px]"
                >
                  Post
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quick-open full modal */}
        {!active && (
          <button
            onClick={() => openCompose()}
            className="self-center ml-auto bg-primary hover:bg-primary/90 text-white font-extrabold px-4 py-1.5 rounded-full transition-colors text-[15px] flex-shrink-0"
          >
            Post
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Left Sidebar ─────────────────────────────────────────────────────────────

const NAV = [
  { icon: Home,     label: "Home",          view: "feed" as View },
  { icon: Search,   label: "Explore",        view: "explore" as View },
  { icon: Bell,     label: "Notifications",  view: "notifications" as View },
  { icon: Mail,     label: "Messages",       view: "feed" as View },
  { icon: Bookmark, label: "Bookmarks",      view: "bookmarks" as View },
  { icon: User,     label: "Profile",        view: "profile" as View },
];

const LeftSidebar = ({ onComposeClick }: { onComposeClick: () => void }) => {
  const { view, navTo, currentUser, isDark, toggleDark, logout, unreadNotifs } = useApp();

  return (
    <aside className="sticky top-0 h-screen flex flex-col justify-between py-2 px-2 xl:px-4">
      <div>
        <div
          className="p-3 mb-2 rounded-full hover:bg-muted cursor-pointer w-fit transition-colors"
          onClick={() => navTo("feed")}
        >
          <XLogo cls="w-8 h-8" />
        </div>

        <nav className="space-y-0.5">
          {NAV.map(({ icon: Icon, label, view: v }) => {
            const active = view === v || (v === "profile" && view === "profile");
            const badge = v === "notifications" && unreadNotifs > 0;
            return (
              <button
                key={label}
                onClick={() => v === "profile" ? navTo("profile", currentUser, null) : navTo(v)}
                className={`relative flex items-center gap-4 px-3 py-3 rounded-full hover:bg-muted transition-colors w-full ${active ? "font-extrabold" : "font-normal"}`}
              >
                <span className="relative">
                  <Icon className={`w-[26px] h-[26px] flex-shrink-0 ${active ? "stroke-[2.5px]" : ""}`} />
                  {badge && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-primary rounded-full text-white text-[10px] font-extrabold flex items-center justify-center px-1">
                      {unreadNotifs}
                    </span>
                  )}
                </span>
                <span className="hidden xl:block text-[20px] leading-none">{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Post button */}
        <button
          onClick={onComposeClick}
          className="mt-4 bg-primary hover:bg-primary/90 text-white font-extrabold rounded-full transition-colors py-3 px-4 w-full hidden xl:flex items-center justify-center gap-2 text-[17px]"
        >
          <Feather className="w-5 h-5 xl:hidden" />
          <span>Post</span>
        </button>
        <button
          onClick={onComposeClick}
          className="mt-4 bg-primary hover:bg-primary/90 text-white font-extrabold rounded-full transition-colors p-3.5 xl:hidden block"
        >
          <Feather className="w-5 h-5" />
        </button>
      </div>

      {/* Footer */}
      <div className="pb-3 space-y-0.5">
        <button
          onClick={toggleDark}
          className="flex items-center gap-4 px-3 py-2.5 rounded-full hover:bg-muted transition-colors w-full text-muted-foreground hover:text-foreground"
        >
          {isDark ? <Sun className="w-[22px] h-[22px] flex-shrink-0" /> : <Moon className="w-[22px] h-[22px] flex-shrink-0" />}
          <span className="hidden xl:block text-[17px]">{isDark ? "Light mode" : "Dark mode"}</span>
        </button>

        <button
          onClick={() => { logout(); toast("Logged out."); }}
          className="flex items-center gap-4 px-3 py-2.5 rounded-full hover:bg-muted transition-colors w-full text-muted-foreground hover:text-foreground"
        >
          <LogOut className="w-[22px] h-[22px] flex-shrink-0" />
          <span className="hidden xl:block text-[17px]">Log out</span>
        </button>

        <button
          onClick={() => navTo("profile", currentUser, null)}
          className="flex items-center gap-3 px-3 py-2 rounded-full hover:bg-muted transition-colors w-full"
        >
          <Avt user={currentUser} size={38} />
          <div className="hidden xl:block text-left min-w-0 flex-1">
            <div className="font-extrabold text-sm truncate leading-tight">{currentUser.displayName}</div>
            <div className="text-muted-foreground text-sm truncate">@{currentUser.username}</div>
          </div>
          <MoreHorizontal className="hidden xl:block w-5 h-5 text-muted-foreground ml-auto flex-shrink-0" />
        </button>
      </div>
    </aside>
  );
};

// ─── Right Sidebar ────────────────────────────────────────────────────────────

const RightSidebar = () => {
  const { users, navTo, currentUser } = useApp();
  const [q, setQ] = useState("");
  const suggestions = users.filter(u => u.id !== currentUser.id).slice(0, 3);

  return (
    <aside className="sticky top-0 h-screen py-3 px-4 overflow-y-auto scrollbar-none space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground pointer-events-none" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search X"
          className="w-full bg-muted rounded-full pl-10 pr-4 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all placeholder:text-muted-foreground"
        />
      </div>

      {/* Trending */}
      <div className="bg-muted/40 rounded-2xl overflow-hidden border border-border/40">
        <h2 className="font-extrabold text-xl px-4 pt-4 pb-1">What&apos;s happening</h2>
        {TRENDING.map((t, i) => (
          <div key={i} className="px-4 py-3 hover:bg-muted cursor-pointer transition-colors border-t border-border/40 first:border-t-0">
            <div className="text-muted-foreground text-xs">{t.cat}</div>
            <div className="font-extrabold text-[15px] mt-0.5">{t.tag}</div>
            <div className="text-muted-foreground text-xs mt-0.5">{t.count} posts</div>
          </div>
        ))}
        <div className="border-t border-border/40">
          <button className="w-full text-left px-4 py-3.5 text-primary hover:bg-muted transition-colors text-[15px]">
            Show more
          </button>
        </div>
      </div>

      {/* Who to follow */}
      <div className="bg-muted/40 rounded-2xl overflow-hidden border border-border/40">
        <h2 className="font-extrabold text-xl px-4 pt-4 pb-1">Who to follow</h2>
        {suggestions.map(user => (
          <div
            key={user.id}
            className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors border-t border-border/40 first:border-t-0 cursor-pointer"
            onClick={() => navTo("profile", user, null)}
          >
            <Avt user={user} size={42} onClick={() => navTo("profile", user, null)} />
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-sm flex items-center gap-1 leading-tight">
                <span className="truncate">{user.displayName}</span>
                {user.isVerified && <Badge size={13} />}
              </div>
              <div className="text-muted-foreground text-xs truncate">@{user.username}</div>
            </div>
            <FollowBtn user={user} compact />
          </div>
        ))}
        <div className="border-t border-border/40">
          <button className="w-full text-left px-4 py-3.5 text-primary hover:bg-muted transition-colors text-[15px]">
            Show more
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground/60 px-1 leading-loose">
        Terms of Service · Privacy Policy · Cookie Policy ·<br />
        Accessibility · Ads info · More · © 2024 X Corp.
      </p>
    </aside>
  );
};

// ─── Mobile Bottom Nav ────────────────────────────────────────────────────────

const MobileNav = ({ onComposeClick }: { onComposeClick: () => void }) => {
  const { view, navTo, currentUser, unreadNotifs } = useApp();
  const items = [
    { icon: Home, v: "feed" as View },
    { icon: Search, v: "explore" as View },
    { icon: Bell, v: "notifications" as View, badge: unreadNotifs },
    { icon: Mail, v: "feed" as View },
  ];
  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-lg flex items-center justify-around py-1">
        {items.map(({ icon: Icon, v, badge }, i) => (
          <button key={i} onClick={() => navTo(v)} className="relative p-3 rounded-full transition-colors">
            <Icon className={`w-6 h-6 ${view === v ? "stroke-[2.5] text-foreground" : "text-muted-foreground"}`} />
            {badge != null && badge > 0 && (
              <span className="absolute top-2 right-2 min-w-[16px] h-4 bg-primary text-white text-[9px] font-extrabold rounded-full flex items-center justify-center px-0.5">
                {badge}
              </span>
            )}
          </button>
        ))}
        <button onClick={() => navTo("profile", currentUser, null)} className="p-2">
          <Avt user={currentUser} size={26} />
        </button>
      </nav>
      {/* FAB compose */}
      <button
        onClick={onComposeClick}
        className="md:hidden fixed bottom-[72px] right-4 z-40 bg-primary hover:bg-primary/90 text-white rounded-full p-4 shadow-xl transition-all active:scale-95"
      >
        <Feather className="w-5 h-5" />
      </button>
    </>
  );
};

// ─── Profile Edit Modal ───────────────────────────────────────────────────────

const EditProfileModal = ({ onClose }: { onClose: () => void }) => {
  const { currentUser, updateProfile } = useApp();
  const [form, setForm] = useState({
    displayName: currentUser.displayName,
    bio: currentUser.bio,
    location: currentUser.location ?? "",
    website: currentUser.website ?? "",
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = () => {
    updateProfile(form);
    toast.success("Profile updated!");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-background w-full max-w-[600px] rounded-2xl shadow-2xl border border-border overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background z-10">
          <div className="flex items-center gap-6">
            <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
              <X className="w-5 h-5" />
            </button>
            <span className="font-extrabold text-xl">Edit profile</span>
          </div>
          <button
            onClick={save}
            className="bg-foreground text-background font-extrabold px-4 py-1.5 rounded-full hover:opacity-90 transition-opacity text-sm"
          >
            Save
          </button>
        </div>

        {/* Banner */}
        <div className="h-36 bg-muted relative group cursor-pointer">
          {currentUser.bannerUrl && (
            <img src={currentUser.bannerUrl} alt="banner" className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="w-8 h-8 text-white" />
          </div>
        </div>

        {/* Avatar */}
        <div className="px-4 -mt-10 mb-4">
          <div className="relative w-20 h-20 group cursor-pointer">
            <img src={currentUser.avatarUrl} alt="avatar" className="w-20 h-20 rounded-full border-4 border-background object-cover" />
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        {/* Fields */}
        <div className="px-4 pb-6 space-y-4">
          {[
            { label: "Name", k: "displayName", max: 50 },
            { label: "Bio", k: "bio", max: 160, multi: true },
            { label: "Location", k: "location", max: 30 },
            { label: "Website", k: "website", max: 100 },
          ].map(({ label, k, max, multi }) => (
            <div key={k} className="relative border border-border rounded-md px-3 pt-5 pb-2 focus-within:border-primary transition-colors">
              <label className="absolute top-2 left-3 text-xs text-muted-foreground font-medium">{label}</label>
              {multi ? (
                <textarea
                  value={form[k as keyof typeof form]}
                  onChange={e => set(k, e.target.value)}
                  maxLength={max}
                  rows={3}
                  className="w-full bg-transparent outline-none resize-none text-[15px] text-foreground"
                />
              ) : (
                <input
                  value={form[k as keyof typeof form]}
                  onChange={e => set(k, e.target.value)}
                  maxLength={max}
                  className="w-full bg-transparent outline-none text-[15px] text-foreground"
                />
              )}
              <div className="text-right text-xs text-muted-foreground mt-1">
                {form[k as keyof typeof form].length} / {max}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Pages ────────────────────────────────────────────────────────────────────

const FeedPage = ({ onComposeClick }: { onComposeClick: () => void }) => {
  const { tweets, users } = useApp();
  const [tab, setTab] = useState<FeedTab>("for-you");
  const [newCount, setNewCount] = useState(0);

  // simulate new tweets arriving
  useEffect(() => {
    const t = setInterval(() => setNewCount(n => n + 1), 20_000);
    return () => clearInterval(t);
  }, []);

  const shown = tab === "following"
    ? tweets.filter(t => users.find(u => u.id === t.authorId)?.isFollowing)
    : tweets;

  return (
    <div>
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between px-4 pt-3 pb-0">
          <h1 className="font-extrabold text-xl">Home</h1>
          <button className="md:hidden p-1.5"><XLogo cls="w-5 h-5" /></button>
        </div>
        <div className="flex">
          {(["for-you", "following"] as FeedTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-4 text-[15px] hover:bg-muted/50 transition-colors relative ${tab === t ? "font-extrabold" : "text-muted-foreground font-medium"}`}
            >
              {t === "for-you" ? "For you" : "Following"}
              {tab === t && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-[3px] bg-primary rounded-full" />}
            </button>
          ))}
        </div>
      </div>

      {/* New tweets pill */}
      {newCount > 0 && (
        <div className="flex justify-center py-2 sticky top-[108px] z-10">
          <button
            onClick={() => setNewCount(0)}
            className="bg-primary text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg hover:bg-primary/90 transition-colors"
          >
            {newCount} new post{newCount > 1 ? "s" : ""}
          </button>
        </div>
      )}

      <InlineComposer />

      {shown.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center px-8">
          <Hash className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground text-lg">
            {tab === "following" ? "Follow accounts to see their posts here." : "No posts yet — be the first!"}
          </p>
        </div>
      ) : (
        shown.map(t => <TweetCard key={t.id} tweet={t} />)
      )}
    </div>
  );
};

const TweetDetailPage = () => {
  const { selectedTweet, tweets, navTo, likeTweet, retweetTweet, openCompose } = useApp();
  if (!selectedTweet) return null;

  const tw = selectedTweet;
  const replies = tweets.filter(t => t.parentId === tw.id);

  return (
    <div>
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border flex items-center gap-5 px-4 py-3">
        <button onClick={() => navTo("feed")} className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-extrabold text-xl">Post</h1>
      </div>

      {/* Full tweet */}
      <article className="px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-3 mb-3">
          <Avt user={tw.author} size={48} onClick={() => navTo("profile", tw.author, null)} />
          <div>
            <div className="font-extrabold text-[15px] flex items-center gap-1">
              {tw.author.displayName}
              {tw.author.isVerified && <Badge />}
            </div>
            <div className="text-muted-foreground text-[15px]">@{tw.author.username}</div>
          </div>
        </div>

        <p className="text-[20px] leading-[1.5] whitespace-pre-wrap break-words mb-4">{tw.content}</p>

        {tw.imageUrl && (
          <div className="rounded-2xl overflow-hidden border border-border mb-4">
            <img src={tw.imageUrl} alt="media" className="w-full object-cover max-h-[500px]" />
          </div>
        )}

        <p className="text-muted-foreground text-[15px] pb-4 border-b border-border">{longDate(tw.createdAt)}</p>

        <div className="flex gap-6 py-4 border-b border-border text-[15px]">
          {[
            [tw.retweetsCount, "Reposts"],
            [tw.likesCount, "Likes"],
            [tw.viewsCount, "Views"],
          ].map(([n, label]) => (
            <span key={label as string}>
              <span className="font-extrabold text-foreground">{fmt(n as number)}</span>{" "}
              <span className="text-muted-foreground">{label}</span>
            </span>
          ))}
        </div>

        <div className="flex items-center justify-around py-1 border-b border-border text-muted-foreground">
          {[
            { icon: MessageCircle, action: () => openCompose(tw.id, tw.author), active: false, col: "hover:text-primary hover:bg-primary/10" },
            { icon: Repeat2, action: () => retweetTweet(tw.id), active: tw.retweeted, col: tw.retweeted ? "text-green-500" : "hover:text-green-500 hover:bg-green-500/10" },
            { icon: Heart, action: () => likeTweet(tw.id), active: tw.liked, col: tw.liked ? "text-pink-500" : "hover:text-pink-500 hover:bg-pink-500/10", fill: tw.liked },
            { icon: BarChart2, action: () => {}, active: false, col: "hover:text-primary hover:bg-primary/10" },
            { icon: Share, action: () => {}, active: false, col: "hover:text-primary hover:bg-primary/10" },
          ].map(({ icon: Icon, action, col, fill }, i) => (
            <button key={i} onClick={action} className={`p-3 rounded-full transition-colors ${col}`}>
              <Icon className={`w-5 h-5 ${fill ? "fill-current" : ""}`} />
            </button>
          ))}
        </div>
      </article>

      {/* Reply prompt */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-border cursor-text hover:bg-muted/20 transition-colors"
        onClick={() => openCompose(tw.id, tw.author)}
      >
        <Avt user={SEED_USER} size={40} />
        <span className="text-muted-foreground text-[17px]">Post your reply…</span>
      </div>

      {/* Replies */}
      {replies.length > 0 ? (
        replies.map(r => <TweetCard key={r.id} tweet={r} />)
      ) : (
        <div className="py-16 flex flex-col items-center text-center px-8">
          <MessageCircle className="w-10 h-10 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">No replies yet. Be the first!</p>
        </div>
      )}
    </div>
  );
};

const ProfilePage = () => {
  const { selectedUser, currentUser, followUser, tweets, navTo } = useApp();
  const [tab, setTab] = useState<"posts" | "replies" | "likes">("posts");
  const [editOpen, setEditOpen] = useState(false);

  const user = selectedUser ?? currentUser;
  const isOwn = user.id === currentUser.id;
  const userTweets = tweets.filter(t => t.authorId === user.id);

  return (
    <div>
      {editOpen && <EditProfileModal onClose={() => setEditOpen(false)} />}

      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border flex items-center gap-5 px-4 py-3">
        <button onClick={() => navTo("feed")} className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="font-extrabold text-xl leading-tight truncate">{user.displayName}</h1>
          <p className="text-muted-foreground text-sm">{fmt(userTweets.length)} posts</p>
        </div>
      </div>

      {/* Banner */}
      <div className="h-36 sm:h-48 bg-muted">
        {user.bannerUrl && (
          <img src={user.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
        )}
      </div>

      {/* Avatar + CTA */}
      <div className="px-4 -mt-12 sm:-mt-16 flex justify-between items-end mb-3">
        <img
          src={user.avatarUrl}
          alt={user.displayName}
          className="w-24 h-24 sm:w-32 sm:h-32 rounded-full border-4 border-background object-cover"
        />
        {isOwn ? (
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-2 border border-border font-bold px-4 py-1.5 rounded-full hover:bg-muted transition-colors text-sm"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit profile
          </button>
        ) : (
          <FollowBtn user={user} />
        )}
      </div>

      {/* Bio block */}
      <div className="px-4 pb-4 border-b border-border">
        <h2 className="text-xl font-extrabold flex items-center gap-1.5 flex-wrap">
          {user.displayName}
          {user.isVerified && <Badge size={18} />}
        </h2>
        <p className="text-muted-foreground text-[15px] mb-2">@{user.username}</p>

        {user.bio && <p className="text-foreground text-[15px] leading-relaxed mb-3">{user.bio}</p>}

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-muted-foreground text-sm mb-4">
          {user.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 flex-shrink-0" />{user.location}
            </span>
          )}
          {user.website && (
            <span className="flex items-center gap-1.5">
              <LinkIcon className="w-4 h-4 flex-shrink-0" />
              <a href="#" onClick={e => e.preventDefault()} className="text-primary hover:underline">{user.website}</a>
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 flex-shrink-0" />Joined {user.joinedDate}
          </span>
        </div>

        <div className="flex gap-5 text-[15px]">
          <button className="hover:underline">
            <span className="font-extrabold">{fmt(user.followingCount)}</span>
            <span className="text-muted-foreground"> Following</span>
          </button>
          <button className="hover:underline">
            <span className="font-extrabold">{fmt(user.followersCount)}</span>
            <span className="text-muted-foreground"> Followers</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border sticky top-[57px] z-10 bg-background/90 backdrop-blur-sm">
        {(["posts", "replies", "likes"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-4 text-[15px] capitalize hover:bg-muted/50 transition-colors relative ${tab === t ? "font-extrabold" : "text-muted-foreground font-medium"}`}
          >
            {t}
            {tab === t && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-[3px] bg-primary rounded-full" />}
          </button>
        ))}
      </div>

      {tab === "posts" && (
        userTweets.length > 0 ? userTweets.map(t => <TweetCard key={t.id} tweet={t} />) : (
          <div className="py-16 text-center text-muted-foreground">No posts yet.</div>
        )
      )}
      {tab === "replies" && (
        <div className="py-16 flex flex-col items-center text-muted-foreground">
          <MessageCircle className="w-10 h-10 opacity-30 mb-4" />No replies yet.
        </div>
      )}
      {tab === "likes" && (
        <div className="py-16 flex flex-col items-center text-muted-foreground">
          <Heart className="w-10 h-10 opacity-30 mb-4" />No liked posts.
        </div>
      )}
    </div>
  );
};

const ExplorePage = () => {
  const [q, setQ] = useState("");
  return (
    <div>
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md px-4 py-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search X"
            className="w-full bg-muted rounded-full pl-10 pr-4 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <h2 className="font-extrabold text-xl px-4 pt-5 pb-3">Trending for you</h2>
      {TRENDING.map((t, i) => (
        <div key={i} className="flex items-center justify-between px-4 py-3.5 border-b border-border hover:bg-muted/30 cursor-pointer transition-colors">
          <div>
            <div className="text-muted-foreground text-xs mb-0.5">{t.cat}</div>
            <div className="font-extrabold text-[17px]">{t.tag}</div>
            <div className="text-muted-foreground text-sm mt-0.5">{t.count} posts</div>
          </div>
          <Hash className="w-5 h-5 text-muted-foreground" />
        </div>
      ))}
    </div>
  );
};

const NotificationsPage = () => {
  const { navTo } = useApp();
  const [notifs, setNotifs] = useState(NOTIF_SEED);
  const [tab, setTab] = useState<"all" | "mentions">("all");

  const markAll = () => setNotifs(n => n.map(x => ({ ...x, read: true })));

  return (
    <div>
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between px-4 pt-4 pb-0">
          <h1 className="font-extrabold text-xl">Notifications</h1>
          <button onClick={markAll} className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground" title="Mark all as read">
            <Check className="w-5 h-5" />
          </button>
        </div>
        <div className="flex">
          {(["all", "mentions"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-4 text-[15px] hover:bg-muted/50 transition-colors relative capitalize ${tab === t ? "font-extrabold" : "text-muted-foreground font-medium"}`}
            >
              {t}
              {tab === t && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-[3px] bg-primary rounded-full" />}
            </button>
          ))}
        </div>
      </div>

      {notifs
        .filter(n => tab === "all" || n.action.includes("mention"))
        .map(n => (
          <div
            key={n.id}
            className={`flex items-start gap-4 px-4 py-4 border-b border-border cursor-pointer transition-colors hover:bg-muted/20 ${!n.read ? "bg-primary/[0.03]" : ""}`}
            onClick={() => { setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x)); navTo("profile", n.user, null); }}
          >
            <div className="flex-shrink-0 text-2xl mt-0.5">{n.emoji}</div>
            <div className="flex-1 min-w-0">
              <Avt user={n.user} size={36} onClick={() => navTo("profile", n.user, null)} />
              <p className="text-foreground mt-2 text-[15px] leading-snug">
                <span className="font-extrabold">{n.user.displayName}</span>{" "}
                <span className="text-muted-foreground">{n.action}</span>
              </p>
              <span className="text-muted-foreground text-sm">{n.time}</span>
            </div>
            {!n.read && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
          </div>
        ))}
    </div>
  );
};

const BookmarksPage = () => (
  <div>
    <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border px-4 py-4">
      <h1 className="font-extrabold text-xl">Bookmarks</h1>
    </div>
    <div className="flex flex-col items-center py-20 px-8 text-center">
      <Bookmark className="w-14 h-14 text-muted-foreground/30 mb-4" />
      <h2 className="font-extrabold text-2xl mb-2">Save posts for later</h2>
      <p className="text-muted-foreground text-[15px] max-w-xs">
        Add posts to your Bookmarks to easily find them again in the future.
      </p>
    </div>
  </div>
);

// ─── Auth Page ────────────────────────────────────────────────────────────────

const AuthPage = ({ onLogin }: { onLogin: () => void }) => {
  const [av, setAv] = useState<AuthView>("landing");
  const [form, setForm] = useState({ email: "", password: "", username: "", name: "" });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const [loading, setLoading] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Supabase auth would go here:
    // const { error } = await supabase.auth.signInWithPassword({ email, password })
    setTimeout(() => { setLoading(false); onLogin(); }, 700);
  };

  if (av === "landing") return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Hero panel */}
      <div className="hidden lg:flex items-center justify-center relative overflow-hidden bg-[#1d9bf0]">
        <img
          src="https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=900&h=900&fit=crop&auto=format"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-[0.08]"
        />
        <XLogo cls="w-64 h-64 fill-white relative z-10" />
      </div>

      {/* Form panel */}
      <div className="flex flex-col items-start justify-center px-8 md:px-20 py-16 max-w-lg mx-auto lg:mx-0 w-full">
        <div className="mb-10">
          <XLogo cls="w-10 h-10 mb-10 lg:hidden" />
          <h1 className="text-5xl font-extrabold tracking-tight leading-[1.1] mb-3">
            Happening now
          </h1>
          <p className="text-muted-foreground text-lg">Join the conversation.</p>
        </div>

        <h2 className="text-2xl font-extrabold mb-6">Join today.</h2>
        <div className="w-full space-y-3 max-w-sm">
          <button
            onClick={() => setAv("signup")}
            className="w-full bg-primary hover:bg-primary/90 text-white font-extrabold py-3 rounded-full transition-colors text-[15px]"
          >
            Create account
          </button>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex-1 h-px bg-border" />or<div className="flex-1 h-px bg-border" />
          </div>
          <button
            onClick={() => setAv("login")}
            className="w-full border border-border font-extrabold py-3 rounded-full hover:bg-muted transition-colors text-[15px]"
          >
            Sign in
          </button>
        </div>
        <p className="text-muted-foreground text-sm mt-10">
          Already have an account?{" "}
          <button onClick={() => setAv("login")} className="text-primary hover:underline font-semibold">Sign in</button>
        </p>
      </div>
    </div>
  );

  const isLogin = av === "login";

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <XLogo cls="w-9 h-9 mx-auto mb-8" />
        <h1 className="text-[28px] font-extrabold text-center mb-8">
          {isLogin ? "Sign in to X" : "Create your account"}
        </h1>

        <form onSubmit={submit} className="space-y-4">
          {!isLogin && (
            <>
              <Field label="Name" value={form.name} onChange={v => set("name", v)} />
              <Field label="Username" value={form.username} onChange={v => set("username", v)} prefix="@" />
            </>
          )}
          <Field label="Email" type="email" value={form.email} onChange={v => set("email", v)} />
          <Field label="Password" type="password" value={form.password} onChange={v => set("password", v)} />

          <button
            type="submit"
            disabled={loading}
            className={`w-full font-extrabold py-3 rounded-full transition-all text-[15px] ${
              isLogin
                ? "bg-foreground text-background hover:opacity-90"
                : "bg-primary text-white hover:bg-primary/90"
            } disabled:opacity-50`}
          >
            {loading ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
          </button>

          {isLogin && (
            <button type="button" className="w-full border border-border font-bold py-3 rounded-full hover:bg-muted transition-colors text-muted-foreground text-[15px]">
              Forgot password?
            </button>
          )}
        </form>

        <p className="text-center text-[15px] text-muted-foreground mt-8">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => setAv(isLogin ? "signup" : "login")} className="text-primary hover:underline font-semibold">
            {isLogin ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
};

const Field = ({
  label, type = "text", value, onChange, prefix,
}: {
  label: string; type?: string; value: string;
  onChange: (v: string) => void; prefix?: string;
}) => (
  <div className="relative border border-border rounded-md focus-within:border-primary transition-colors px-3 pt-5 pb-2">
    <label className="absolute top-2 left-3 text-xs text-muted-foreground font-medium">{label}</label>
    <div className="flex items-center gap-1">
      {prefix && <span className="text-muted-foreground text-[15px]">{prefix}</span>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-transparent outline-none text-[15px] text-foreground"
      />
    </div>
  </div>
);

// ─── Main Layout ──────────────────────────────────────────────────────────────

const MainLayout = () => {
  const { view } = useApp();
  const [compose, setCompose] = useState<ComposeState>({ open: false });

  const openCompose = (parentId?: string, replyTo?: UserProfile) =>
    setCompose({ open: true, parentId, replyTo });

  return (
    <>
      <ComposeModal state={compose} onClose={() => setCompose({ open: false })} />

      <div className="min-h-screen">
        <div className="max-w-[1280px] mx-auto flex">
          {/* Left sidebar */}
          <div className="hidden md:flex flex-col border-r border-border sticky top-0 h-screen flex-shrink-0 w-[72px] xl:w-[280px]">
            <LeftSidebar onComposeClick={() => openCompose()} />
          </div>

          {/* Center */}
          <main className="flex-1 min-h-screen border-r border-border max-w-[600px] w-full pb-20 md:pb-0">
            {view === "feed"          && <FeedPage onComposeClick={() => openCompose()} />}
            {view === "tweet-detail"  && <TweetDetailPage />}
            {view === "profile"       && <ProfilePage />}
            {view === "explore"       && <ExplorePage />}
            {view === "notifications" && <NotificationsPage />}
            {view === "bookmarks"     && <BookmarksPage />}
          </main>

          {/* Right sidebar */}
          <div className="hidden xl:block flex-shrink-0 w-[350px]">
            <RightSidebar />
          </div>
        </div>
      </div>

      <MobileNav onComposeClick={() => openCompose()} />
    </>
  );
};

// ─── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [view, setView] = useState<View>("feed");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedTweet, setSelectedTweet] = useState<Tweet | null>(null);
  const [users, setUsers] = useState<UserProfile[]>(MOCK_USERS);
  const [tweets, setTweets] = useState<Tweet[]>(SEED_TWEETS);
  const [currentUser, setCurrentUser] = useState<UserProfile>(SEED_USER);
  const [unreadNotifs] = useState(NOTIF_SEED.filter(n => !n.read).length);
  const [composeOpen, setComposeOpen] = useState<ComposeState>({ open: false });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const navTo = useCallback((v: View, user?: UserProfile | null, tweet?: Tweet | null) => {
    setView(v);
    if (user !== undefined) setSelectedUser(user);
    if (tweet !== undefined) setSelectedTweet(tweet);
    window.scrollTo(0, 0);
  }, []);

  const likeTweet = useCallback((id: string) => {
    const flip = (t: Tweet): Tweet => {
      if (t.id !== id) return t;
      const liked = !t.liked;
      return { ...t, liked, likesCount: liked ? t.likesCount + 1 : t.likesCount - 1 };
    };
    setTweets(p => p.map(flip));
    setSelectedTweet(p => p ? flip(p) : null);
  }, []);

  const retweetTweet = useCallback((id: string) => {
    const flip = (t: Tweet): Tweet => {
      if (t.id !== id) return t;
      const retweeted = !t.retweeted;
      toast(retweeted ? "Reposted!" : "Repost removed.", { duration: 2000 });
      return { ...t, retweeted, retweetsCount: retweeted ? t.retweetsCount + 1 : t.retweetsCount - 1 };
    };
    setTweets(p => p.map(flip));
    setSelectedTweet(p => p ? flip(p) : null);
  }, []);

  const postTweet = useCallback((content: string, imageUrl?: string, parentId?: string) => {
    const newTweet: Tweet = {
      id: `t${Date.now()}`,
      authorId: currentUser.id,
      author: currentUser,
      content,
      imageUrl,
      createdAt: new Date().toISOString(),
      likesCount: 0, repliesCount: 0, retweetsCount: 0,
      viewsCount: Math.floor(Math.random() * 80 + 12),
      liked: false, retweeted: false, parentId,
    };
    if (parentId) {
      setTweets(p => [
        ...p.map(t => t.id === parentId ? { ...t, repliesCount: t.repliesCount + 1 } : t),
        newTweet,
      ]);
      toast.success("Reply posted!");
    } else {
      setTweets(p => [newTweet, ...p]);
      toast.success("Posted!");
    }
    setCurrentUser(u => ({ ...u, tweetsCount: u.tweetsCount + 1 }));
  }, [currentUser]);

  const deleteTweet = useCallback((id: string) => {
    setTweets(p => p.filter(t => t.id !== id));
    toast("Post deleted.", { duration: 2500 });
  }, []);

  const followUser = useCallback((userId: string) => {
    const flip = (u: UserProfile): UserProfile => {
      if (u.id !== userId) return u;
      const isFollowing = !u.isFollowing;
      toast(isFollowing ? `Following @${u.username}` : `Unfollowed @${u.username}`, { duration: 2000 });
      return { ...u, isFollowing, followersCount: isFollowing ? u.followersCount + 1 : u.followersCount - 1 };
    };
    setUsers(p => p.map(flip));
    setSelectedUser(p => p ? flip(p) : null);
  }, []);

  const updateProfile = useCallback((patch: Partial<UserProfile>) => {
    setCurrentUser(u => ({ ...u, ...patch }));
  }, []);

  const openCompose = useCallback((parentId?: string, replyTo?: UserProfile) => {
    setComposeOpen({ open: true, parentId, replyTo });
  }, []);

  const ctx: AppCtx = {
    currentUser, isDark, toggleDark: () => setIsDark(d => !d),
    view, selectedUser, selectedTweet, tweets, users, unreadNotifs,
    navTo, likeTweet, retweetTweet, postTweet, deleteTweet, followUser, updateProfile,
    logout: () => { setAuthed(false); toast("Signed out."); },
    openCompose,
  };

  return (
    <Ctx.Provider value={ctx}>
      <Toaster
        position="bottom-center"
        toastOptions={{
          className: "!bg-foreground !text-background !border-0 !rounded-xl !font-semibold !text-sm !shadow-xl",
        }}
      />
      {authed ? (
        <>
          <ComposeModal state={composeOpen} onClose={() => setComposeOpen({ open: false })} />
          <MainLayout />
        </>
      ) : (
        <AuthPage onLogin={() => setAuthed(true)} />
      )}
    </Ctx.Provider>
  );
}
