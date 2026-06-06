import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useProfile } from "@/hooks/useUserQueries";
import { Home, Dumbbell, PlusSquare, BarChart3, Cpu, User, UtensilsCrossed, Brain, CalendarDays } from "lucide-react";
import CalculatorsModal from "@/components/CalculatorsModal";
import WeighInModal from "@/components/WeighInModal";
import { UserAvatar } from "@/components/ui/UserAvatar";
import FloatingActionButton from "@/components/ui/FloatingActionButton";
import Logo from "@/components/Logo";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QuickCapture from "@/components/QuickCapture";

const navigationItems = [
  { title: "Home", url: "/dashboard", icon: Home },
  { title: "Fuel", url: "/fuel", icon: UtensilsCrossed },
  { title: "Train", url: "/train", icon: Dumbbell },
  { title: "Insights", url: "/insights", icon: BarChart3 },
];

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const { profile } = useProfile();
  const [showCalculators, setShowCalculators] = useState(false);
  const [showWeighIn, setShowWeighIn] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const mobileHeaderRef = useRef(null);

  useEffect(() => {
    const updateHeaderHeight = () => {
      const desktopNav = document.querySelector('[data-desktop-nav]');
      const mobileHeader = mobileHeaderRef.current;

      let height = 0;
      if (desktopNav && getComputedStyle(desktopNav).display !== 'none') {
        height = desktopNav.getBoundingClientRect().height;
      } else if (mobileHeader && getComputedStyle(mobileHeader).display !== 'none') {
        height = mobileHeader.getBoundingClientRect().height;
      }

      document.documentElement.style.setProperty('--layout-header-height', `${height}px`);
    };

    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, []);

  const pageDisplayName = {
    Dashboard: "Home",
    Fuel: "Fuel",
    Train: "Train",
    Insights: "Insights",
    Workouts: "Train",
    FoodTracker: "Fuel",
    Schedule: "Schedule",
    WeeklySchedule: "Schedule",
    Mind: "Mind",
    Career: "Career",
    Profile: "Profile",
    WorkoutDetail: "Workout",
    QuickWorkout: "Quick Workout",
    CreateWorkout: "Create Workout",
    ProgramDetail: "Program",
    ProgramBuilder: "Program Builder",
  }[currentPageName] || currentPageName || "Home";

  return (
    <>
      <div className="min-h-screen flex flex-col w-full bg-[#09090e]">
        {/* Desktop top navbar */}
        <header data-desktop-nav className="hidden lg:flex sticky top-0 z-[60] glass-elevated items-center px-5 h-14 gap-1">
          <Link to="/dashboard" className="flex items-center gap-2.5 mr-7">
            <Logo className="w-8 h-8" />
            <span className="text-brand font-bold text-[15px] tracking-tight uppercase">OptiGainsOS</span>
          </Link>

          <div className="flex items-center gap-0.5 flex-1">
            {navigationItems.map((item) => {
              const isActive = location.pathname === item.url ||
                (item.url === '/fuel' && ['/fuel', '/food-tracker', '/supplements', '/log'].some(p => location.pathname.startsWith(p))) ||
                (item.url === '/train' && ['/train', '/workouts', '/program-builder', '/create-workout', '/quick-workout', '/weekly-schedule', '/schedule', '/workout-detail', '/program/'].some(p => location.pathname.startsWith(p))) ||
                (item.url === '/insights' && ['/insights', '/progress', '/athlete-state', '/brief-history', '/mind', '/career'].some(p => location.pathname.startsWith(p)));
              return (
                <Link
                  key={item.title}
                  to={item.url}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13.5px] font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-brand/[8%] text-brand font-semibold'
                      : 'text-slate-400 hover:bg-charcoal-elevated hover:text-white'
                  }`}
                >
                  <item.icon className="w-[15px] h-[15px]" />
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            <Link to="/profile">
              <UserAvatar
                url={profile?.avatar_url}
                username={profile?.username}
                size="sm"
                className="w-8 h-8 text-xs border border-charcoal-border"
              />
            </Link>
          </div>
        </header>

        {/* Mobile top header */}
        <header
          ref={mobileHeaderRef}
          data-mobile-header
          className="glass-elevated px-4 py-3 sticky top-0 z-[9998] flex items-center gap-3 lg:hidden"
        >
          <Link to="/dashboard">
            <Logo className="w-10 h-10" />
          </Link>
          <h1 className="text-lg font-bold flex-1 text-white">{pageDisplayName}</h1>
          <Link to="/profile">
            <UserAvatar
              url={profile?.avatar_url}
              username={profile?.username}
              size="sm"
              className="w-8 h-8 text-xs ring-2 ring-offset-1 ring-transparent"
            />
          </Link>
        </header>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-h-0 lg:pb-0 bg-[#09090e]" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
          <div className="flex-1 min-h-0 bg-[#09090e]">{children}</div>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="glass-elevated z-[9999] lg:hidden"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          paddingBottom: 'env(safe-area-inset-bottom)',
          transform: 'translateZ(0)',
        }}
      >
        <div className="flex items-center justify-around px-2 py-1">
          {navigationItems.map((item) => {
            const isActive = location.pathname === item.url ||
              (item.url === '/fuel' && ['/fuel', '/food-tracker', '/supplements', '/log'].some(p => location.pathname.startsWith(p))) ||
              (item.url === '/train' && ['/train', '/workouts', '/program-builder', '/create-workout', '/quick-workout', '/weekly-schedule', '/schedule', '/workout-detail', '/program/'].some(p => location.pathname.startsWith(p))) ||
              (item.url === '/insights' && ['/insights', '/progress', '/athlete-state', '/brief-history', '/mind', '/career'].some(p => location.pathname.startsWith(p)));
            return (
              <Link
                key={item.title}
                to={item.url}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 min-w-0 flex-1 transition-colors ${
                  isActive ? "text-brand" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <item.icon className={`w-6 h-6 ${isActive ? "stroke-[2.5]" : ""}`} />
                <span className={`text-xs font-medium ${isActive ? "text-brand" : "text-slate-500"}`}>
                  {item.title}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {!['/profile', '/onboarding', '/create-workout', '/quick-workout', '/program-builder'].some(p => location.pathname.startsWith(p)) && (
        <FloatingActionButton
          onWeighIn={() => setShowWeighIn(true)}
          onCalculators={() => setShowCalculators(true)}
          onStreamNote={() => setShowNoteModal(true)}
        />
      )}

      <WeighInModal open={showWeighIn} onOpenChange={setShowWeighIn} />
      <CalculatorsModal
        isOpen={showCalculators}
        onClose={() => setShowCalculators(false)}
        weightUnit={profile?.weight_unit || "lbs"}
      />
      <Dialog open={showNoteModal} onOpenChange={setShowNoteModal}>
        <DialogContent className="max-w-md bg-charcoal-surface border-charcoal-border text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Stream Note to Second Brain</DialogTitle>
          </DialogHeader>
          <div className="pt-2">
            <QuickCapture
              domain="general"
              placeholder="Stream a note to Second Brain..."
              onCapture={() => setShowNoteModal(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
