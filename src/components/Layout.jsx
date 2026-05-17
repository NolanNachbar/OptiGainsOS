import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useProfile } from "@/hooks/useUserQueries";
import { Home, Dumbbell, Calendar, UtensilsCrossed, Users, TrendingUp } from "lucide-react";
import { useNotificationCount } from "@/hooks/useSocialQueries";
import CalculatorsModal from "@/components/CalculatorsModal";
import WeighInModal from "@/components/WeighInModal";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import FloatingActionButton from "@/components/ui/FloatingActionButton";
import { useTutorial } from "@/hooks/useTutorial";
import Logo from "@/components/Logo";
import { useStravaAutoSync } from "@/hooks/useStravaAutoSync";
import {
  ActionBar,
  ActionBarContent,
  ActionBarMenu,
  ActionBarMenuButton,
  ActionBarMenuItem,
  ActionBarHeader,
} from "@/components/ui/sidebar";

const navigationItems = [
  { title: "Home", url: "/dashboard", icon: Home },
  { title: "Workouts", url: "/workouts", icon: Dumbbell },
  { title: "Schedule", url: "/schedule", icon: Calendar },
  { title: "Food", url: "/food-tracker", icon: UtensilsCrossed },
  { title: "Progress", url: "/progress", icon: TrendingUp },
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
    Progress: "Progress",
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
      <div className="min-h-screen flex flex-col w-full bg-slate-50 dark:bg-slate-950">
        {/* Desktop nav — matches main branch ActionBar, hidden on mobile */}
        <div data-desktop-nav className="hidden lg:block sticky top-0 z-[60]">
          <ActionBar className="border-r border-slate-200 dark:border-slate-700 dark:bg-slate-900 z-50">
            <ActionBarHeader className="p-6 flex items-center justify-between">
              <Link to="/dashboard" className="flex items-center gap-3">
                <Logo className="w-20 h-20" />
              </Link>
            </ActionBarHeader>

            <Link to="/dashboard" className="hidden min-[1400px]:flex items-center px-6 py-4 gap-2">
              <h1 className="text-xl font-bold text-primary-700 dark:text-white whitespace-nowrap">Sisyphus' Schedule</h1>
            </Link>

            <ActionBarContent className="flex items-center gap-1 flex-1 ml-auto justify-end">
              <ActionBarMenu className="flex gap-1">
                {navigationItems.map((item) => (
                  <ActionBarMenuItem key={item.title} className="flex">
                    <ActionBarMenuButton
                      asChild
                      className={`hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-primary-700 transition-all duration-200 rounded-lg px-3 py-2 ${
                        location.pathname === item.url ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700' : 'dark:text-slate-200'
                      }`}
                    >
                      <Link
                        to={item.url}
                        className="flex items-center gap-3"
                        data-tutorial={
                          item.title === 'Schedule' ? 'schedule-nav' :
                          item.title === 'Home' ? 'home-nav' :
                          undefined
                        }
                        onClick={() => {
                          if (tutorialActive && currentStepData?.id === 'schedule' && item.title === 'Schedule') {
                            nextStep();
                          }
                          if (tutorialActive && currentStepData?.id === 'navigate-back' && item.title === 'Home') {
                            nextStep();
                          }
                        }}
                      >
                        <div className="relative">
                          <item.icon className="w-5 h-5" />
                          {item.hasBadge && notificationCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-danger-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                              {notificationCount > 9 ? '9+' : notificationCount}
                            </span>
                          )}
                        </div>
                        <span className="font-medium">{item.title}</span>
                      </Link>
                    </ActionBarMenuButton>
                  </ActionBarMenuItem>
                ))}

                {/* Theme toggle */}
                <ActionBarMenuItem className="flex">
                  <ThemeToggle />
                </ActionBarMenuItem>

                {/* Profile avatar nav item */}
                <ActionBarMenuItem className="flex">
                  <ActionBarMenuButton
                    asChild
                    className={`hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 rounded-lg px-3 py-2 ${
                      location.pathname === '/profile' ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                    }`}
                  >
                    <Link to="/profile" className="flex items-center gap-3">
                      <UserAvatar
                        url={profile?.avatar_url}
                        username={profile?.username}
                        size="sm"
                        className="w-6 h-6 text-xs ring-2 ring-offset-1 ring-transparent hover:ring-primary-400 transition-all"
                      />
                    </Link>
                  </ActionBarMenuButton>
                </ActionBarMenuItem>
              </ActionBarMenu>
            </ActionBarContent>
          </ActionBar>
        </div>

        {/* Mobile top header */}
        <header
          ref={mobileHeaderRef}
          data-mobile-header
          className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 px-4 py-3 sticky top-0 z-[9998] flex items-center gap-3 lg:hidden"
        >
          <Link to="/dashboard">
            <Logo className="w-10 h-10" />
          </Link>
          <h1 className="text-lg font-bold flex-1 text-slate-900 dark:text-slate-50">{pageDisplayName}</h1>
          <ThemeToggle />
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
        <main className="flex-1 flex flex-col min-h-0 lg:pb-0 bg-slate-50 dark:bg-slate-950 transition-colors duration-300" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
          <div className="flex-1 min-h-0 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">{children}</div>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 z-[9999] lg:hidden"
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
                  isActive ? "text-primary-600" : "text-slate-400 dark:text-slate-500"
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
                    isActive ? "text-primary-600" : "text-slate-400"
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
