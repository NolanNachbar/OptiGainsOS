import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import ErrorBoundary from '@/components/ErrorBoundary';
import Layout from '@/components/Layout';
import { LoadingScreen } from '@/components/ui/loading-spinner';

// ── Per-type toast lifetimes ──────────────────────────────────────────────
// Sonner 2.0.7 only exposes a FLAT default duration on <Toaster> (toastOptions
// .duration is one number for every type; see the Toaster comment below). The
// system wants a split: passive success/info are read-and-forget so they should
// auto-dismiss quickly (~3s), while error/CTA toasts demand a response and keep
// the longer 8s lifetime (the <Toaster> default). Rather than touch ~70 success
// call sites, we patch the two PASSIVE variants of the imported toast singleton
// once at module load to inject the short default — but ONLY when the caller did
// not already pass an explicit duration, so any intentional override still wins.
// error/warning/message/promise are left untouched and inherit the 8s default.
const PASSIVE_TOAST_MS = 3000;
['success', 'info'].forEach((variant) => {
  const original = toast[variant].bind(toast);
  toast[variant] = (message, data) =>
    original(
      message,
      data?.duration == null ? { ...data, duration: PASSIVE_TOAST_MS } : data
    );
});


const Login = lazy(() => import('./pages/Login'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Today = lazy(() => import('./pages/Today'));
const FoodTracker = lazy(() => import('./pages/FoodTracker'));
const CreateWorkout = lazy(() => import('./pages/CreateWorkout'));
const Profile = lazy(() => import('./pages/Profile'));
const WorkoutDetail = lazy(() => import('./pages/WorkoutDetail'));
const QuickWorkout = lazy(() => import('./pages/QuickWorkout'));
const ProgramDetail = lazy(() => import('./pages/ProgramDetail'));
const ProgramBuilder = lazy(() => import('./pages/ProgramBuilder'));
const RecoveryDetail = lazy(() => import('./pages/RecoveryDetail'));
const Mind = lazy(() => import('./pages/Mind'));
const Career = lazy(() => import('./pages/Career'));
const BriefHistory = lazy(() => import('./pages/BriefHistory'));
const WeeklySchedule = lazy(() => import('./pages/WeeklySchedule'));
const AthleteState = lazy(() => import('./pages/AthleteState'));
const PhysiqueTracker = lazy(() => import('./pages/PhysiqueTracker'));
const Fuel = lazy(() => import('./pages/Fuel'));
const Train = lazy(() => import('./pages/Train'));
const Insights = lazy(() => import('./pages/Insights'));

const queryClient = new QueryClient();

const protectedRoutes = [
  { path: "/today", name: "Today", component: Today },
  { path: "/fuel", name: "Fuel", component: Fuel },
  { path: "/train", name: "Train", component: Train },
  { path: "/insights", name: "Insights", component: Insights },
  { path: "/weekly-schedule", name: "WeeklySchedule", component: WeeklySchedule },
  { path: "/program-builder", name: "ProgramBuilder", component: ProgramBuilder },
  { path: "/food-tracker", name: "FoodTracker", component: FoodTracker },
  { path: "/create-workout", name: "CreateWorkout", component: CreateWorkout },
  { path: "/profile", name: "Profile", component: Profile },
  { path: "/workout-detail", name: "WorkoutDetail", component: WorkoutDetail },
  { path: "/quick-workout", name: "QuickWorkout", component: QuickWorkout },
  { path: "/recovery", name: "Recovery", component: RecoveryDetail },
  { path: "/mind", name: "Mind", component: Mind },
  // IA-ORPHAN: /career is routable but unreachable from any nav surface (no dock
  // tab, no sub-nav entry). Routing decision owned here; placement decision lives
  // in Layout's dock/IA — surface it under the Analyze/Insights sub-nav group (or
  // a dedicated nav group) so it stops being dead-by-navigation. Kept registered
  // so the chosen nav link resolves the moment Layout adds it.
  { path: "/career", name: "Career", component: Career },
  { path: "/brief-history", name: "BriefHistory", component: BriefHistory },
  { path: "/athlete-state", name: "AthleteState", component: AthleteState },
  { path: "/physique", name: "Physique", component: PhysiqueTracker },
];

// Global toast surface. Theme is synced to the app theme so Sonner emits the
// matching (dark/light) CSS vars and the .og-toast glass overrides hold. On
// mobile the toast drops to the thumb zone (bottom-center) instead of colliding
// with header content; desktop keeps top-center. The vertical offset references
// --layout-header-height with a 0 fallback — auth routes (Login) render no
// Layout, so a literal header height would push a dead gap; the var resolves to
// 0 there (defaulted in index.css) and to the real header height once Layout
// mounts. closeButton is forced always-visible via classNames so success and
// error toasts stay symmetric.
function AppToaster() {
  const { theme } = useTheme();
  // Mobile is the product (390px): land the toast in the thumb zone
  // (bottom-center) so it never overlaps header content. Desktop keeps the
  // conventional top-center.
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <Toaster
      theme={theme}
      position={isMobile ? 'bottom-center' : 'top-center'}
      offset={
        isMobile
          ? // BLOCKER fix: --dock-clearance (80px) is the clearance budget for
            // IN-FLOW content, measured from the dock's top edge — using it as a
            // toast offset parked the ~50px pill body ON TOP of the floating dock.
            // The toast is FLOATED chrome, so it must clear the dock's full
            // footprint from the bottom edge: --dock-total-height (12px gap + 56px
            // body + 12px breathing) plus the safe-area inset. This puts the pill's
            // bottom edge ≥ ~96px, fully above the dock.
            { bottom: 'calc(var(--dock-total-height, 80px) + 16px + env(safe-area-inset-bottom))' }
          : { top: 'calc(var(--layout-header-height, 0px) + env(safe-area-inset-top) + 12px)' }
      }
      closeButton
      toastOptions={{
        // This flat default is the ACTIONABLE lifetime: error / CTA toasts are
        // the ones a user must read and respond to, so they keep the longer
        // 8000ms — a shorter window could auto-dismiss an error before a thumb
        // reached the bottom-sheet close button. The persistent close button
        // (always-visible via .og-toast__close) lets a reader dismiss early, so
        // erring long is safe.
        //
        // Sonner 2.0.7 has no per-TYPE duration at the Toaster level (this
        // ToastOptions.duration is one flat number). The passive-vs-actionable
        // split is delivered by the toast.success / toast.info singleton patch at
        // the top of this file, which injects the short PASSIVE_TOAST_MS (~3s)
        // default; everything else inherits this longer actionable default.
        duration: 8000,
        classNames: {
          toast: 'og-toast',
          error: 'og-toast--error',
          closeButton: 'og-toast__close',
        },
      }}
    />
  );
}

function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/today" replace />;
  return <Navigate to="/login" replace />;
}

// Guards the sign-in form: an already-authenticated session has no business
// re-seeing the form, so bounce it to where it was headed (returnTo, set by
// ProtectedRoute / Login's own location.state convention) or the canonical home.
// Mirrors RootRoute's loading/auth gate.
function LoginRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (user) {
    const returnTo = location.state?.returnTo || '/today';
    return <Navigate to={returnTo} replace />;
  }
  return <Login />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Router basename={import.meta.env.BASE_URL}>
          <AuthProvider>
            <AppToaster />
            <ErrorBoundary>
              <Suspense fallback={<LoadingScreen />}>
                <Routes>
                  <Route path="/" element={<RootRoute />} />
                  <Route path="/login" element={<LoginRoute />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/app" element={<Navigate to="/today" replace />} />
                  {/* Dashboard retired — Today is the single canonical home. Its
                      two unique features (MorningCheckin readiness form + Today's
                      Actions todo list) were ported into Today.jsx, and the old
                      src/pages/Dashboard.jsx was deleted (it had no importer and
                      was never lazy-loaded here, so it was dead weight). This
                      redirect is the only thing /dashboard resolves to now. */}
                  <Route path="/dashboard" element={<Navigate to="/today" replace />} />
                  {/* LogHub + Supplements consolidated into Fuel's Body tab */}
                  <Route path="/log" element={<Navigate to="/fuel?tab=body" replace />} />
                  <Route path="/supplements" element={<Navigate to="/fuel?tab=body" replace />} />
                  {/* Legacy Schedule page retired — WeeklySchedule is canonical */}
                  <Route path="/schedule" element={<Navigate to="/weekly-schedule" replace />} />
                  {/* Standalone Workouts page merged into the Train hub */}
                  <Route path="/workouts" element={<Navigate to="/train?tab=library" replace />} />
                  <Route
                    path="/program/:id"
                    element={
                      <Layout currentPageName="ProgramDetail">
                        <ErrorBoundary>
                          <ProgramDetail />
                        </ErrorBoundary>
                      </Layout>
                    }
                  />
                  {protectedRoutes.map(({ path, name, component: Page }) => (
                    <Route
                      key={path}
                      path={path}
                      element={
                        <ProtectedRoute>
                          <Layout currentPageName={name}>
                            <ErrorBoundary>
                              <Page />
                            </ErrorBoundary>
                          </Layout>
                        </ProtectedRoute>
                      }
                    />
                  ))}
                  {/* No unmatched path should white-screen — bounce to Today. */}
                  <Route path="*" element={<Navigate to="/today" replace />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </AuthProvider>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
