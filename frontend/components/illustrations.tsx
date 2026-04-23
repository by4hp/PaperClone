// Lightweight inline SVG illustrations. Hand-crafted in the same flat,
// open-source style popularized by undraw.co / storyset — single-color base
// + an accent so the whole illustration retints with the brand palette via
// `currentColor`.

type Props = { className?: string };

/** Graduation cap perched on a rolled paper scroll. */
export function ScrollCapIllustration({ className }: Props) {
  return (
    <svg
      viewBox="0 0 160 130"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="试卷与毕业帽插画"
      className={className}
    >
      <defs>
        <linearGradient id="scroll-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#EEF3FE" />
          <stop offset="1" stopColor="#DCE6FB" />
        </linearGradient>
        <linearGradient id="scroll-paper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#EAF0FC" />
        </linearGradient>
        <linearGradient id="cap" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5C7DE6" />
          <stop offset="1" stopColor="#3850BE" />
        </linearGradient>
        <linearGradient id="cap-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4965DB" />
          <stop offset="1" stopColor="#2A3D94" />
        </linearGradient>
      </defs>

      {/* Soft round backdrop */}
      <circle cx="80" cy="68" r="58" fill="url(#scroll-bg)" />

      {/* Scroll bottom curl */}
      <path
        d="M28 96 Q28 84 40 84 H120 Q132 84 132 96 V100 Q132 112 120 112 H40 Q28 112 28 100 Z"
        fill="#C8D5F6"
      />
      <ellipse cx="34" cy="98" rx="6" ry="14" fill="#A9BEF4" />
      <ellipse cx="126" cy="98" rx="6" ry="14" fill="#A9BEF4" />

      {/* Scroll paper face */}
      <path
        d="M40 32 H120 Q126 32 126 38 V92 Q126 98 120 98 H40 Q34 98 34 92 V38 Q34 32 40 32 Z"
        fill="url(#scroll-paper)"
        stroke="#CFDBFA"
        strokeWidth="1.2"
      />
      {/* Scroll text lines */}
      <g fill="#A9BEF4">
        <rect x="46" y="44" width="44" height="3.5" rx="1.75" />
        <rect x="46" y="54" width="68" height="3" rx="1.5" />
        <rect x="46" y="62" width="58" height="3" rx="1.5" />
        <rect x="46" y="70" width="64" height="3" rx="1.5" />
        <rect x="46" y="78" width="36" height="3" rx="1.5" />
      </g>

      {/* Top scroll curl */}
      <path
        d="M28 32 Q28 22 40 22 H120 Q132 22 132 32 V36 Q132 44 120 44 H40 Q28 44 28 36 Z"
        fill="#DCE6FB"
      />
      <ellipse cx="34" cy="33" rx="6" ry="11" fill="#BCD0F7" />
      <ellipse cx="126" cy="33" rx="6" ry="11" fill="#BCD0F7" />

      {/* Graduation cap */}
      <g transform="translate(54 -6) rotate(-6 30 28)">
        {/* mortar board */}
        <path
          d="M8 28 L36 18 L64 28 L36 38 Z"
          fill="url(#cap)"
        />
        {/* cap base */}
        <path
          d="M22 32 V42 Q22 48 36 48 Q50 48 50 42 V32 L36 38 Z"
          fill="url(#cap-side)"
        />
        {/* tassel */}
        <path
          d="M58 28 V42"
          stroke="#FBBF24"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="58" cy="44" r="2.6" fill="#FBBF24" />
        {/* button */}
        <circle cx="36" cy="28" r="1.6" fill="#FFFFFF" />
      </g>

      {/* Sparkle accents */}
      <g fill="#5C7DE6">
        <circle cx="22" cy="56" r="2" />
        <circle cx="138" cy="74" r="2" />
        <circle cx="120" cy="22" r="1.5" />
      </g>
    </svg>
  );
}
