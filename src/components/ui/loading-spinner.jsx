
export function LoadingSpinner({ size = 'default', className = '' }) {
  const sizeClasses = {
    small: 'h-4 w-4',
    default: 'h-12 w-12',
    large: 'h-16 w-16',
  };

  return (
    <div
      className={`animate-spin rounded-full border-b-2 border-[#ccff00] ${sizeClasses[size]} ${className}`}
    />
  );
}

export function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#1a1a1a]">
      <LoadingSpinner />
    </div>
  );
}

export function LoadingSpinnerInline() {
  return <LoadingSpinner size="small" className="border-white" />;
}
