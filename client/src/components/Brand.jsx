// budget.md márkaelemek: ikon (zöld lekerekített négyzet, „b.” jel) és szóvédjegy
export function BrandMark({ className = '' }) {
  return (
    <svg className={`brand-mark ${className}`} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" />
      <path d="M22 15v34" fill="none" strokeWidth="6" strokeLinecap="round" />
      <circle cx="31.5" cy="38.5" r="10" fill="none" strokeWidth="6" />
      <circle className="dot" cx="48.5" cy="46" r="4" />
    </svg>
  );
}

export function Wordmark({ className = '' }) {
  return <span className={`wordmark ${className}`}>budget<span>.md</span></span>;
}
