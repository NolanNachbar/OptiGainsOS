import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { TutorialProvider } from './contexts/TutorialContext';
import ProtectedRoute from './components/ProtectedRoute';
import ProtectedAdminRoute from './components/ProtectedAdminRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import TutorialOverlay from './components/tutorial/TutorialOverlay';
import { LoadingScreen } from './components/ui/loading-spinner';
import { initializeML } from '@/ml/mlRecommender';
import { supabase } from '@/api/supabaseClient';

// Lazy load pages for better code splitting
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Workouts = lazy(() => import('./pages/Workouts'));
const Schedule = lazy(() => import('./pages/Schedule'));
const FoodTracker = lazy(() => import('./pages/FoodTracker'));
const CreateWorkout = lazy(() => import('./pages/CreateWorkout'));
const Profile = lazy(() => import('./pages/Profile'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const WorkoutDetail = lazy(() => import('./pages/WorkoutDetail'));
const QuickWorkout = lazy(() => import('./pages/QuickWorkout'));
const Admin = lazy(() => import('./pages/Admin'));
const PublicProfile = lazy(() => import('./pages/PublicProfile'));
const ProgramDetail = lazy(() => import('./pages/ProgramDetail'));
const ProgramBuilder = lazy(() => import('./pages/ProgramBuilder'));
const Social = lazy(() => import('./pages/Social'));
const StravaCallback = lazy(() => import('./pages/StravaCallback'));

const queryClient = new QueryClient();

const protectedRoutes = [
  { path: "/dashboard", name: "Dashboard", component: Dashboard },
  { path: "/workouts", name: "Workouts", component: Workouts },
  { path: "/program-builder", name: "ProgramBuilder", component: ProgramBuilder },
  { path: "/schedule", name: "Schedule", component: Schedule },
  { path: "/food-tracker", name: "FoodTracker", component: FoodTracker },
  { path: "/create-workout", name: "CreateWorkout", component: CreateWorkout },
  { path: "/profile", name: "Profile", component: Profile },
  { path: "/workout-detail", name: "WorkoutDetail", component: WorkoutDetail },
  { path: "/quick-workout", name: "QuickWorkout", component: QuickWorkout },
  { path: "/admin", name: "Admin", component: Admin },
  { path: "/social", name: "Social", component: Social },
];

function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Landing />;
}

function App() {
  // Initialize ML model after a 3 second delay so the app loads fully first.
  // Training is CPU-intensive -- delaying prevents freezing on startup.
  // Falls back to rule-based system automatically if anything fails.
  useEffect(() => {
    const timer = setTimeout(() => {
      initializeML(supabase)
        .then(status => {
          if (status.ready) {
            console.log(
              `[Sisyphus' Schedule ML] Ready — ${(status.accuracy * 100).toFixed(1)}% accuracy,`,
              `${status.examples} training examples`,
              `(${status.realData} real reactions + synthetic)`
            );
          } else {
            console.warn("[Sisyphus' Schedule ML] Initialization failed, using rule-based fallback:", status.error);
          }
        })
        .catch(() => {
          console.warn("[Sisyphus' Schedule ML] Failed to initialize, rule-based fallback active");
        });
    }, 3000); // wait 3s for app to fully load before training
    return () => clearTimeout(timer);
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Router basename={import.meta.env.BASE_URL}>
          <AuthProvider>
            <TutorialProvider>
              <Toaster position="top-center" richColors />
              <TutorialOverlay />
          <ErrorBoundary>
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<RootRoute />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                path="/strava-callback"
                element={
                  <ProtectedRoute>
                    <StravaCallback />
                  </ProtectedRoute>
                }
              />

            {/* Protected routes */}
            <Route path="/app" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <Onboarding />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile/:username"
              element={
                <Layout currentPageName="PublicProfile">
                  <ErrorBoundary>
                    <PublicProfile />
                  </ErrorBoundary>
                </Layout>
              }
            />
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
                        {name === 'Admin' ? (
                          <ProtectedAdminRoute>
                            <Page />
                          </ProtectedAdminRoute>
                        ) : (
                          <Page />
                        )}
                      </ErrorBoundary>
                    </Layout>
                  </ProtectedRoute>
                }
              />
            ))}
            </Routes>
          </Suspense>
          </ErrorBoundary>
            </TutorialProvider>
        </AuthProvider>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
