import { useTheme } from '@/contexts/ThemeContext';

export default function Logo({ className = "w-16 h-16", ...props }) {
  const { theme } = useTheme();

  const logoSrc = theme === 'dark'
    ? `${import.meta.env.BASE_URL}sisyphus-white.svg`
    : `${import.meta.env.BASE_URL}sisyphus-purple.svg`;

  return (
    <img
      src={logoSrc}
      alt="Sisyphus' Schedule Logo"
      className={className}
      {...props}
    />
  );
}
