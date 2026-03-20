/**
 * Brand mark for laura — monochrome, geometric (neutral in light/dark via currentColor).
 */
export function LauraMark({ className }: { className?: string }) {
  return (
    <svg
      className={`text-zinc-800 dark:text-zinc-100 ${className ?? ''}`}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Soft frame */}
      <rect
        x="3.5"
        y="3.5"
        width="25"
        height="25"
        rx="7"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity={0.38}
      />
      {/* Triangle graph: outline + three nodes */}
      <path
        d="M16 9.5 10.2 20.25h11.6L16 9.5z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        opacity={0.42}
      />
      <circle cx="16" cy="9.5" r="2.4" fill="currentColor" />
      <circle cx="10.2" cy="20.25" r="2.4" fill="currentColor" opacity={0.88} />
      <circle cx="21.8" cy="20.25" r="2.4" fill="currentColor" opacity={0.88} />
    </svg>
  );
}
