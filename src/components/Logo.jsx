export default function Logo({ className = "w-16 h-16", ...props }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}vektor-logo.png`}
      className={className}
      alt="Vektor"
      {...props}
    />
  );
}
