const SIZES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-16 h-16 text-lg',
};

export function UserAvatar({ url, username, size = 'md', className = '' }) {
  const initial = username
    ? username[0].toUpperCase()
    : '?';

  const sizeClass = SIZES[size] || SIZES.md;

  if (url) {
    return (
      <img
        src={url}
        alt={username || 'User avatar'}
        className={`${sizeClass} rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-charcoal-elevated flex items-center justify-center shrink-0 ${className}`}
    >
      <span className="text-ink font-bold">{initial}</span>
    </div>
  );
}
