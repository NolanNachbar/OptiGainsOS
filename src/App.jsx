import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import ErrorBoundary from '@/components/ErrorBoundary';
import Layout from '@/components/Layout';
import { LoadingScreen } from '@/components/ui/loading-spinner';


const Login = lazy(() => import('./pages/Login'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Today = lazy(() => import('./pages/Today'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
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
  { path: "/dashboard", name: "Dashboard", component: Dashboard },
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
          ? { bottom: 'calc(var(--dock-clearance, 80px) + env(safe-area-inset-bottom))' }
          : { top: 'calc(var(--layout-header-height, 0px) + env(safe-area-inset-top) + 12px)' }
      }
      closeButton
      toastOptions={{
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
                  <Route path="/login" element={<Login />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/app" element={<Navigate to="/today" replace />} />
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
