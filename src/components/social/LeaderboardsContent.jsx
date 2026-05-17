import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { useLeaderboard, useUserExerciseNames } from "@/hooks/useSocialQueries";
import { useProfile } from "@/hooks/useUserQueries";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trophy, Dumbbell, Crown, Medal, User, QrCode, Copy, Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const TIME_PERIODS = [
  { value: 'all', label: 'All Time' },
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
];

export function LeaderboardsContent() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedExercise, setSelectedExercise] = useState("");
  const [timePeriod, setTimePeriod] = useState("all");
  const [showQR, setShowQR] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const { profile } = useProfile();
  const { data: exerciseNames = [] } = useUserExerciseNames();
  const { data: leaderboard = [], isLoading } = useLeaderboard(selectedExercise, timePeriod);

  const profileUrl = profile?.username
    ? `${window.location.origin}${import.meta.env.BASE_URL}profile/${profile.username}`
    : null;

  const handleCopy = () => {
    if (!profileUrl) return;
    navigator.clipboard.writeText(profileUrl);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  };

  return (
    <>
      <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] shadow-md overflow-hidden">
        <div className="p-4 space-y-3">

          {/* Header */}
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a0a0a0] text-center">Ranks</p>

          {/* Divider */}
          <div className="border-t border-[#2a2a2a]" />

          {/* Exercise selector */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[#a0a0a0] mb-1.5 block">
              Exercise Parameter
            </label>
            <Select value={selectedExercise} onValueChange={setSelectedExercise}>
              <SelectTrigger className="w-full text-sm h-9">
                <SelectValue placeholder="Select an exercise" />
              </SelectTrigger>
              <SelectContent>
                {exerciseNames.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time period pills */}
          <div className="flex rounded-lg overflow-hidden border border-[#2a2a2a]">
            {TIME_PERIODS.map((tp, i) => (
              <button
                key={tp.value}
                onClick={() => setTimePeriod(tp.value)}
                className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors ${
                  i > 0 ? "border-l border-[#2a2a2a]" : ""
                } ${
                  timePeriod === tp.value
                    ? "bg-primary-500 text-black font-bold"
                    : "text-[#a0a0a0] hover:text-[#a0a0a0] dark:hover:text-slate-300 hover:bg-[#242424]"
                }`}
              >
                {tp.label}
              </button>
            ))}
          </div>

          {/* Results */}
          {!selectedExercise ? (
            <div className="py-5 text-center space-y-1">
              <Dumbbell className="w-6 h-6 text-slate-300 dark:text-[#a0a0a0] mx-auto mb-2" />
              <p className="text-xs text-[#a0a0a0]">Select an exercise to see the leaderboard</p>
              <p className="text-[11px] text-slate-300 dark:text-[#a0a0a0]">Exercises are pulled from your workout history</p>
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : leaderboard.length === 0 ? (
            <div className="py-6 text-center">
              <Trophy className="w-7 h-7 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-[#a0a0a0]">No data yet for {selectedExercise}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {leaderboard.map((entry, index) => (
                <LeaderboardRow
                  key={entry.user_id}
                  entry={entry}
                  rank={index + 1}
                  isCurrentUser={entry.user_id === user.id}
                />
              ))}
            </div>
          )}

        </div>
      </div>

      {/* Profile actions card */}
      {profile?.username && (
        <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] shadow-md mt-3">
          <div className="p-3 flex gap-2">
            <button
              onClick={() => navigate(`/profile/${profile.username}`)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-[#2a2a2a] text-xs font-semibold text-[#a0a0a0] hover:bg-[#242424] transition-colors"
            >
              <User className="w-3.5 h-3.5" />
              Public Profile
            </button>
            <button
              onClick={() => setShowQR(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-[#2a2a2a] text-xs font-semibold text-[#a0a0a0] hover:bg-[#242424] transition-colors"
            >
              <QrCode className="w-3.5 h-3.5" />
              Share
            </button>
          </div>
        </div>
      )}

      {/* QR share modal */}
      {profile?.username && (
        <Dialog open={showQR} onOpenChange={setShowQR}>
          <DialogContent className="sm:max-w-xs">
            <DialogHeader>
              <DialogTitle>Share Your Profile</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 pt-2">
              <div className="p-3 bg-white rounded-xl shadow-inner border border-slate-100">
                <QRCodeSVG value={profileUrl} size={200} level="M" marginSize={0} />
              </div>
              <p className="text-xs text-[#a0a0a0] text-center">
                Scan to view <span className="font-semibold text-[#a0a0a0]">@{profile.username}</span>'s profile
              </p>
              <button
                onClick={handleCopy}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-[#2a2a2a] text-sm font-medium text-[#a0a0a0] hover:bg-[#242424] transition-colors"
              >
                {urlCopied ? (
                  <><Check className="w-4 h-4 text-green-500" />Copied!</>
                ) : (
                  <><Copy className="w-4 h-4" />Copy Link</>
                )}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function LeaderboardRow({ entry, rank, isCurrentUser }) {
  const isFirst = rank === 1;

  const rankColors = { 1: 'text-amber-500', 2: 'text-[#a0a0a0]', 3: 'text-amber-700' };
  const RankIcon = rank === 1 ? Crown : rank <= 3 ? Medal : null;

  return (
    <Link
      to={`/profile/${entry.username}`}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors group ${
        isFirst
          ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40"
          : isCurrentUser
          ? "bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800/40"
          : "hover:bg-[#242424]"
      }`}
    >
      {/* Rank icon / YOU badge */}
      <div className="w-6 shrink-0 flex items-center justify-center">
        {isCurrentUser ? (
          <span className="text-[11px] font-bold bg-primary-500 text-black font-bold px-1 py-0.5 rounded">YOU</span>
        ) : RankIcon ? (
          <RankIcon className={`w-4 h-4 ${rankColors[rank]}`} />
        ) : (
          <span className={`text-xs font-bold ${isCurrentUser ? 'text-primary-500' : 'text-[#a0a0a0]'}`}>
            {String(rank).padStart(2, '0')}
          </span>
        )}
      </div>

      {/* Name + weight */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate text-left ${
          isFirst ? 'text-amber-700 text-amber-400' : 'text-white'
        }`}>
          {entry.display_name || entry.username}
        </p>
        <p className="text-[11px] text-[#a0a0a0] text-left">{entry.max_weight} lbs</p>
      </div>

      {/* Rank number */}
      <span className={`text-xs font-bold shrink-0 ${
        isFirst ? 'text-amber-500' : isCurrentUser ? 'text-primary-500' : 'text-slate-300 dark:text-[#a0a0a0]'
      }`}>
        #{rank}
      </span>
    </Link>
  );
}
