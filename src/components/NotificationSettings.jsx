import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Card } from "@/components/ui";
import { Bell, BellOff, CheckCircle2, AlertTriangle } from "lucide-react";

export default function NotificationSettings() {
  const { user } = useAuth();
  const { isSupported, isSubscribed, permission, subscribe, unsubscribe } = usePushNotifications(user?.id);

  const hasVapid = !!import.meta.env.VITE_VAPID_PUBLIC_KEY;

  if (!isSupported) {
    return (
      <Card className="flex items-start gap-3 p-4">
        <BellOff className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
        <div>
          <p className="text-emph font-semibold text-ink">Push notifications</p>
          <p className="text-caption text-ink-muted mt-0.5">Not supported in this browser.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Bell className="w-4 h-4 text-brand shrink-0 mt-0.5" />
          <div>
            <p className="text-emph font-semibold text-ink">Push notifications</p>
            <p className="text-caption text-ink-muted mt-0.5">
              Check-in reminder at 7 am and supplement timing.
            </p>
          </div>
        </div>
        {isSubscribed ? (
          <Button variant="destructive" size="sm" onClick={unsubscribe} className="shrink-0">
            Disable
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={subscribe}
            disabled={!hasVapid || permission === "denied"}
            className="shrink-0"
          >
            Enable
          </Button>
        )}
      </div>

      {isSubscribed && (
        <div className="mt-3 flex items-center gap-1.5 text-caption text-leaf">
          <CheckCircle2 className="w-3.5 h-3.5" /> On
        </div>
      )}

      {permission === "denied" && (
        <div className="mt-3 flex items-start gap-1.5 text-caption text-ink-secondary">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Blocked by the browser. Reset the permission in browser settings.
        </div>
      )}

      {!hasVapid && !isSubscribed && permission !== "denied" && (
        <div className="mt-3 text-caption text-ink-muted border-t border-charcoal-border pt-3">
          <p className="font-mono">VITE_VAPID_PUBLIC_KEY</p>
          <p className="mt-1">not set. Generate VAPID keys and add them to your <code className="bg-charcoal-elevated px-1 rounded-control">.env</code> file to enable push.</p>
          <p className="mt-1 font-mono text-caption">npx web-push generate-vapid-keys</p>
        </div>
      )}
    </Card>
  );
}
