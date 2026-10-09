const PATHS: Record<string, React.ReactNode> = {
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="1" /><path d="m3 7 9 6 9-6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  download: <><path d="M12 4v11m-5-5 5 5 5-5" /><path d="M4 19h16" /></>,
  file: <><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  pin: <><path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  cart: <><path d="M3 4h2l2.5 11h11L21 7H6.2" /><circle cx="9" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></>,
  linkedin: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7" /></>,
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5v.01" /></>,
  youtube: <><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9 5 3-5 3z" /></>,
  twitter: <path d="M4 4l16 16M20 4 4 20" />,
};

export function Icon({ name, className = "h-5 w-5" }: { name: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
