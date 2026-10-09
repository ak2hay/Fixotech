const channel = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const preset = {
  theme: {
    extend: {
      colors: {
        canvas: channel("canvas"),
        surface: channel("surface"),
        line: channel("line"),
        fg: channel("fg"),
        muted: channel("muted"),
        subtle: channel("subtle"),
        sidebar: { DEFAULT: channel("sidebar"), fg: channel("sidebar-fg"), muted: channel("sidebar-muted"), hover: channel("sidebar-hover") },
        accent: { DEFAULT: channel("accent"), fg: channel("accent-fg"), soft: channel("accent-soft"), strong: channel("accent-strong") },
        success: { DEFAULT: channel("success"), soft: channel("success-soft") },
        warning: { DEFAULT: channel("warning"), soft: channel("warning-soft") },
        danger: { DEFAULT: channel("danger"), soft: channel("danger-soft") },
        info: { DEFAULT: channel("info"), soft: channel("info-soft") },
        ink: channel("sidebar"),
        ivory: channel("canvas"),
        brass: channel("accent"),
        pine: channel("success"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { DEFAULT: "6px", md: "6px", lg: "8px", xl: "12px" },
      boxShadow: {
        card: "0 1px 2px rgb(16 24 40 / 0.04), 0 1px 3px rgb(16 24 40 / 0.04)",
        pop: "0 12px 32px -8px rgb(16 24 40 / 0.18), 0 4px 8px -4px rgb(16 24 40 / 0.08)",
      },
      fontSize: { "2xs": ["11px", "16px"] as [string, string] },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-in": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "slide-in": "slide-in 200ms ease-out",
      },
    },
  },
};

export default preset;
