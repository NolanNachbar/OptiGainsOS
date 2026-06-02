import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import { LoadingScreen } from './components/ui/loading-spinner';

const Login = lazy(() => import('./pages/Login'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Workouts = lazy(() => import('./pages/Workouts'));
const Schedule = lazy(() => import('./pages/Schedule'));
const FoodTracker = lazy(() => import('./pages/FoodTracker'));
const CreateWorkout = lazy(() => import('./pages/CreateWorkout'));
const Profile = lazy(() => import('./pages/Profile'));
const WorkoutDetail = lazy(() => import('./pages/WorkoutDetail'));
const QuickWorkout = lazy(() => import('./pages/QuickWorkout'));
const ProgramDetail = lazy(() => import('./pages/ProgramDetail'));
const ProgramBuilder = lazy(() => import('./pages/ProgramBuilder'));
const StravaCallback = lazy(() => import('./pages/StravaCallback'));
const Mind = lazy(() => import('./pages/Mind'));
const Career = lazy(() => import('./pages/Career'));

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
  { path: "/mind", name: "Mind", component: Mind },
  { path: "/career", name: "Career", component: Career },
];

function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/login" replace />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Router basename={import.meta.env.BASE_URL}>
          <AuthProvider>
            <Toaster position="top-center" richColors />
            <ErrorBoundary>
              <Suspense fallback={<LoadingScreen />}>
                <Routes>
                  <Route path="/" element={<RootRoute />} />
                  <Route path="/login" element={<Login />} />
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
                  <Route path="/app" element={<Navigate to="/dashboard" replace />} />
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
