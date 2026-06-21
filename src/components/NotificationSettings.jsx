import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, CheckCircle2, AlertTriangle } from "lucide-react";

export default function NotificationSettings() {
  const { user } = useAuth();
  const { isSupported, isSubscribed, permission, subscribe, unsubscribe } = usePushNotifications(user?.id);

  const hasVapid = !!import.meta.env.VITE_VAPID_PUBLIC_KEY;

  if (!isSupported) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-xl bg-charcoal-surface border border-charcoal-border">
        <BellOff className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-ink">Push Notifications</p>
          <p className="text-xs text-ink-muted mt-0.5">Not supported in this browser.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-charcoal-surface border border-charcoal-border">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Bell className="w-4 h-4 text-brand shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-ink">Push Notifications</p>
            <p className="text-xs text-ink-muted mt-0.5">
              Morning check-in reminder (7am) and supplement timing alerts.
            </p>
          </div>
        </div>
        {isSubscribed ? (
          <Button variant="ghost" size="sm" onClick={unsubscribe} className="h-7 px-3 text-xs text-bad hover:bg-bad/10 shrink-0">
            Disable
          </Button>
        ) : (
          <Button
            variant="volt"
            size="sm"
            onClick={subscribe}
            disabled={!hasVapid || permission === "denied"}
            className="h-7 px-3 text-xs shrink-0"
          >
            Enable
          </Button>
        )}
      </div>

      {isSubscribed && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-leaf">
          <CheckCircle2 className="w-3.5 h-3.5" /> Active, notifications enabled
        </div>
      )}

      {permission === "denied" && (
        <div className="mt-3 flex items-start gap-1.5 text-xs text-warn">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Blocked by browser. Reset permissions in browser settings to re-enable.
        </div>
      )}

      {!hasVapid && !isSubscribed && permission !== "denied" && (
        <div className="mt-3 text-xs text-ink-muted border-t border-charcoal-border pt-3">
          <p className="font-mono">VITE_VAPID_PUBLIC_KEY</p>
          <p className="mt-1">not set. Generate VAPID keys and add to your <code className="bg-charcoal-elevated px-1 rounded">.env</code> file to enable push.</p>
          <p className="mt-1 font-mono text-[10px]">npx web-push generate-vapid-keys</p>
        </div>
      )}
    </div>
  );
}
