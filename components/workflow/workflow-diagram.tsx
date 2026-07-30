const steps = [
  {
    id: "capture",
    title: "Capture feeds",
    detail: "Playwright reads LinkedIn and X from your logged-in profile.",
  },
  {
    id: "classify",
    title: "Classify batch",
    detail: "Haiku labels items. Weak noise stays dossier-only.",
  },
  {
    id: "dossier",
    title: "Update dossiers",
    detail: "Signals save to company files with sources and excerpts.",
  },
  {
    id: "score",
    title: "Score companies",
    detail: "Deterministic score_company math sets urgency.",
  },
  {
    id: "ping",
    title: "Ping or wait",
    detail: "WhatsApp digest only when thresholds clear. Else stay quiet.",
  },
];

export function WorkflowDiagram() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface px-4 py-8 md:px-8 md:py-10">
      <svg
        className="mx-auto hidden w-full max-w-4xl md:block"
        viewBox="0 0 920 220"
        role="img"
        aria-label="Nightly workflow from capture to ping"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#0c7a52" />
          </marker>
        </defs>

        {steps.map((step, index) => {
          const x = 40 + index * 175;
          return (
            <g key={step.id} className="animate-step-in" style={{ animationDelay: `${index * 110}ms` }}>
              <rect
                x={x}
                y={48}
                width={140}
                height={88}
                rx={14}
                fill="#f3f6f4"
                stroke="#9aada2"
                strokeWidth="1.5"
              />
              <circle cx={x + 24} cy={72} r={6} fill="#0c7a52" className="animate-pulse-dot" />
              <text
                x={x + 38}
                y={76}
                fill="#0e1814"
                fontSize="13"
                fontFamily="Syne, sans-serif"
                fontWeight="600"
              >
                {step.title}
              </text>
              <foreignObject x={x + 14} y={90} width={112} height={40}>
                <p className="m-0 text-[11px] leading-4 text-ink-muted">
                  {step.detail}
                </p>
              </foreignObject>
              {index < steps.length - 1 ? (
                <line
                  x1={x + 140}
                  y1={92}
                  x2={x + 175}
                  y2={92}
                  stroke="#0c7a52"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                  markerEnd="url(#arrow)"
                  className="animate-flow"
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      <ol className="mx-auto flex max-w-xl flex-col gap-4 md:hidden">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className="animate-step-in relative border-l-2 border-signal pl-4"
            style={{ animationDelay: `${index * 90}ms` }}
          >
            <p className="font-mono text-[11px] tracking-[0.16em] text-signal-deep uppercase">
              Step {index + 1}
            </p>
            <p className="mt-1 font-display text-lg font-semibold text-ink">
              {step.title}
            </p>
            <p className="mt-1 text-sm leading-6 text-ink-muted">{step.detail}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
