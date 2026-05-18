import { lazy, Suspense } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MapPin, TrendingUp, Timer, Heart, Route } from "lucide-react";
import { ACTIVITY_TYPE_LABELS } from "@/lib/strava";

const StaticRouteMap = lazy(() => import("./StaticRouteMap"));

function fmt(meters) {
  if (!meters) return null;
  const mi = meters / 1609.34;
  return mi >= 0.1 ? `${mi.toFixed(2)} mi` : null;
}

function fmtTime(seconds) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export default function StravaMapModal({ session, onClose }) {
  if (!session) return null;

  const typeLabel = ACTIVITY_TYPE_LABELS[session.activity_type] || session.activity_type;
  const date = session.start_date
    ? new Date(session.start_date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <Dialog open={!!session} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Route className="w-4 h-4 text-orange-500" />
            {session.name}
          </DialogTitle>
          {date && <p className="text-xs text-[#555555] mt-0.5">{date}</p>}
        </DialogHeader>

        {session.map_polyline ? (
          <div className="rounded-xl overflow-hidden border border-[#2a2a2a] " style={{ isolation: "isolate" }}>
            <Suspense fallback={<div style={{ height: 270 }} className="bg-[#202020]  rounded-xl animate-pulse" />}>
              <StaticRouteMap polyline={session.map_polyline} mapKey={session.id} height={270} />
            </Suspense>
          </div>
        ) : (
          <div className="flex items-center justify-center h-40 bg-[#202020]  rounded-xl text-[#555555] text-sm">
            No route data available
          </div>
        )}

        <div className="flex items-center gap-3 px-1 text-xs text-[#555555] ">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Start</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Finish</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {fmt(session.distance_meters) && (
            <div className="bg-[#1a1a1a]  rounded-xl p-3">
              <div className="flex items-center gap-1 text-xs text-[#555555] mb-0.5"><MapPin className="w-3 h-3" />Distance</div>
              <p className="font-semibold text-white">{fmt(session.distance_meters)}</p>
            </div>
          )}
          {fmtTime(session.moving_time_seconds) && (
            <div className="bg-[#1a1a1a]  rounded-xl p-3">
              <div className="flex items-center gap-1 text-xs text-[#555555] mb-0.5"><Timer className="w-3 h-3" />Moving Time</div>
              <p className="font-semibold text-white">{fmtTime(session.moving_time_seconds)}</p>
            </div>
          )}
          {session.average_heartrate && (
            <div className="bg-[#1a1a1a]  rounded-xl p-3">
              <div className="flex items-center gap-1 text-xs text-[#555555] mb-0.5"><Heart className="w-3 h-3 text-[#f87171]" />Avg HR</div>
              <p className="font-semibold text-white">{Math.round(session.average_heartrate)} bpm</p>
            </div>
          )}
          {session.total_elevation_gain > 5 && (
            <div className="bg-[#1a1a1a]  rounded-xl p-3">
              <div className="flex items-center gap-1 text-xs text-[#555555] mb-0.5"><TrendingUp className="w-3 h-3" />Elevation</div>
              <p className="font-semibold text-white">{Math.round(session.total_elevation_gain * 3.281)} ft</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs capitalize">{typeLabel}</Badge>
          {session.calories && <span className="text-xs text-[#555555]">{Math.round(session.calories)} cal</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
