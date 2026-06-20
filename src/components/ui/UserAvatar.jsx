import { deriveInitials } from "@/lib/initials";

const SIZES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-16 h-16 text-lg',
};

// `name` is the preferred initials source (a display name); `username` is kept as
// a fallback for legacy callers. Both run through the shared deriveInitials helper
// so the chrome avatar and the Profile card never disagree on the same user.
export function UserAvatar({ url, name, username, size = 'md', className = '' }) {
  const label = name || username;
  const initial = deriveInitials(label);

  const sizeClass = SIZES[size] || SIZES.md;

  if (url) {
    return (
      <img
        src={url}
        alt={label || 'User avatar'}
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
