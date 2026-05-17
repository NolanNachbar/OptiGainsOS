import { Navigate } from 'react-router-dom';
import { useProfile } from '@/hooks/useUserQueries';
import { LoadingScreen } from '@/components/ui/loading-spinner';

export default function ProtectedAdminRoute({ children }) {
  const { profile, isLoading } = useProfile();

  if (isLoading) return <LoadingScreen />;
  if (!profile?.is_admin) return <Navigate to="/dashboard" replace />;

  return children;
}
