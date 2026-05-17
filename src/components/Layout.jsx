import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useProfile } from "@/hooks/useUserQueries";
import { Home, Dumbbell, Calendar, UtensilsCrossed, Users } from "lucide-react";
import { useNotificationCount } from "@/hooks/useSocialQueries";
import CalculatorsModal from "@/components/CalculatorsModal";
import WeighInModal from "@/components/WeighInModal";
import { UserAvatar } from "@/components/ui/UserAvatar";
import FloatingActionButton from "@/components/ui/FloatingActionButton";
import { useTutorial } from "@/hooks/useTutorial";
import Logo from "@/components/Logo";
import { useStravaAutoSync } from "@/hooks/useStravaAutoSync";

const navigationItems = [
  { title: "Home", url: "/dashboard", icon: Home },
  { title: "Workouts", url: "/workouts", icon: Dumbbell },
  { title: "Schedule", url: "/schedule", icon: Calendar },
  { title: "Food", url: "/food-tracker", icon: UtensilsCrossed },
  { title: "Social", url: "/social", icon: Users, hasBadge: true, mobileHidden: true },
];

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const { profile } = useProfile();
  useStravaAutoSync();
  const [showCalculators, setShowCalculators] = useState(false);
  const [showWeighIn, setShowWeighIn] = useState(false);
  const { data: notificationCount = 0 } = useNotificationCount();
  const mobileHeaderRef = useRef(null);
  const { nextStep, isActive: tutorialActive, currentStepData } = useTutorial();

  // Measure visible header/nav height so sticky sub-headers can position below it
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
    Workouts: "Workouts",
    FoodTracker: "Food Tracker",
    Schedule: "Schedule",
    Social: "Social",
    Profile: "Profile",
    PublicProfile: "Profile",
    WorkoutDetail: "Workout",
    QuickWorkout: "Quick Workout",
    CreateWorkout: "Create Workout",
    ProgramDetail: "Program",
    ProgramBuilder: "Program Builder",
  }[currentPageName] || currentPageName || "Home";

  return (
    <>
      <div className="min-h-screen flex flex-col w-full bg-[#121212]">
        {/* Desktop top navbar */}
        <header data-desktop-nav className="hidden lg:flex sticky top-0 z-[60] bg-[#1a1a1a] border-b border-[#2a2a2a] items-center px-5 h-14 gap-1">
          <Link to="/dashboard" className="flex items-center gap-2.5 mr-7">
            <Logo className="w-8 h-8" />
            <span className="text-[#ccff00] font-bold text-[15px] tracking-tight">Vektor</span>
          </Link>

          <div className="flex items-center gap-0.5 flex-1">
            {navigationItems.map((item) => {
              const isActive = location.pathname === item.url;
              return (
                <Link
                  key={item.title}
                  to={item.url}
                  data-tutorial={
                    item.title === 'Schedule' ? 'schedule-nav' :
                    item.title === 'Home' ? 'home-nav' :
                    undefined
                  }
                  onClick={() => {
                    if (tutorialActive && currentStepData?.id === 'schedule' && item.title === 'Schedule') nextStep();
                    if (tutorialActive && currentStepData?.id === 'navigate-back' && item.title === 'Home') nextStep();
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13.5px] font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-[rgba(204,255,0,0.08)] text-[#ccff00]'
                      : 'text-[#a0a0a0] hover:bg-[#242424] hover:text-white'
                  }`}
                >
                  <div className="relative">
                    <item.icon className="w-[15px] h-[15px]" />
                    {item.hasBadge && notificationCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-danger-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                        {notificationCount > 9 ? '9+' : notificationCount}
                      </span>
                    )}
                  </div>
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
                className="w-8 h-8 text-xs border border-[#2a2a2a]"
              />
            </Link>
          </div>
        </header>

        {/* Mobile top header */}
        <header
          ref={mobileHeaderRef}
          data-mobile-header
          className="bg-charcoal-surface/90 backdrop-blur-sm border-b border-charcoal-border px-4 py-3 sticky top-0 z-[9998] flex items-center gap-3 lg:hidden"
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
        <main className="flex-1 flex flex-col min-h-0 lg:pb-0 bg-[#121212]" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
          <div className="flex-1 min-h-0 bg-[#121212]">{children}</div>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="bg-charcoal-surface border-t border-charcoal-border z-[9999] lg:hidden"
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
          {navigationItems.filter(item => !item.mobileHidden).map((item) => {
            const isActive = location.pathname === item.url;
            const isHomeButton = item.title === "Home";
            const isScheduleButton = item.title === "Schedule";
            return (
              <Link
                key={item.title}
                to={item.url}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 min-w-0 flex-1 transition-colors ${
                  isActive ? "text-[#ccff00]" : "text-[#555555]"
                }`}
                data-tutorial={
                  isHomeButton ? "home-nav" :
                  isScheduleButton ? "schedule-nav" :
                  undefined
                }
                onClick={() => {
                  if (tutorialActive && currentStepData?.id === 'navigate-back' && item.title === 'Home') {
                    nextStep();
                  }
                  if (tutorialActive && currentStepData?.id === 'schedule' && item.title === 'Schedule') {
                    nextStep();
                  }
                }}
              >
                <div className="relative">
                  <item.icon
                    className={`w-6 h-6 ${isActive ? "stroke-[2.5]" : ""}`}
                  />
                  {item.hasBadge && notificationCount > 0 && (
                    <span className="absolute -top-1 -right-1.5 w-4 h-4 bg-danger-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                      {notificationCount > 9 ? "9+" : notificationCount}
                    </span>
                  )}
                </div>
                <span
                  className={`text-xs font-medium ${
                    isActive ? "text-[#ccff00]" : "text-[#555555]"
                  }`}
                >
                  {item.title}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Floating Action Button */}
      <FloatingActionButton
        onWeighIn={() => setShowWeighIn(true)}
        onCalculators={() => setShowCalculators(true)}
      />

      <WeighInModal
        open={showWeighIn}
        onOpenChange={setShowWeighIn}
      />

      <CalculatorsModal
        isOpen={showCalculators}
        onClose={() => setShowCalculators(false)}
        weightUnit={profile?.weight_unit || "lbs"}
      />
    </>
  );
}
