export function Skeleton({ className = "", ...props }) {
  return (
    <div
      className={`animate-pulse bg-[#2a2a2a] rounded-lg ${className}`}
      {...props}
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="p-4 md:p-6 bg-[#1a1a1a] min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 text-center">
          <Skeleton className="h-8 w-72 mx-auto mb-2" />
          <Skeleton className="h-4 w-56 mx-auto" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Skeleton className="h-44 rounded-xl" />
          <div className="space-y-4">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>
        <Skeleton className="h-28 rounded-xl mb-8" />
        <Skeleton className="h-6 w-48 mb-4" />
        <Skeleton className="h-10 w-full rounded-lg mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function WorkoutsSkeleton() {
  return (
    <div className="p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <Skeleton className="h-7 w-32 mb-2" />
        <Skeleton className="h-4 w-48 mb-6" />
        <Skeleton className="h-10 w-64 rounded-lg mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="p-4 md:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Skeleton className="w-20 h-20 rounded-full" />
          <div>
            <Skeleton className="h-6 w-40 mb-2" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <Skeleton className="h-10 w-72 rounded-lg mb-6" />
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i}>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-10 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
