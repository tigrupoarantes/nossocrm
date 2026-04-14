/**
 * Post-processador HTML para landing pages geradas por IA.
 *
 * Garante que TODA landing page tenha os assets obrigatórios (design tokens,
 * fontes, Tailwind CDN, motion script, viewport meta) independente de a IA
 * ter gerado corretamente ou não. Funciona como safety net.
 */

// ---------------------------------------------------------------------------
// Constantes reutilizáveis (fonte de verdade para CSS/JS injetado)
// ---------------------------------------------------------------------------

export const GOOGLE_FONTS_HTML = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">`;

export const TAILWIND_CDN_HTML = `<script src="https://cdn.tailwindcss.com"><\/script>`;

export const VIEWPORT_META_HTML = `<meta name="viewport" content="width=device-width, initial-scale=1.0">`;

export const DESIGN_TOKENS_CSS = `<style id="crm-design-tokens">
  :root {
    /* Backgrounds */
    --color-bg: oklch(97% 0.005 90);
    --color-surface: oklch(99% 0.002 90);
    --color-muted: oklch(95% 0.008 90);
    --color-border: oklch(90% 0.01 90);
    --color-border-subtle: oklch(93% 0.008 90);

    /* Texto */
    --color-text-primary: oklch(25% 0.015 260);
    --color-text-secondary: oklch(45% 0.02 260);
    --color-text-muted: oklch(55% 0.025 260);
    --color-text-subtle: oklch(62% 0.025 260);

    /* Paleta primária */
    --color-primary-50: #f0f9ff;
    --color-primary-100: #e0f2fe;
    --color-primary-200: #bae6fd;
    --color-primary-500: #0ea5e9;
    --color-primary-600: #0284c7;
    --color-primary-700: #0369a1;
    --color-primary-800: #075985;
    --color-primary-900: #0c4a6e;

    /* Status */
    --color-success: oklch(65% 0.17 145);
    --color-success-bg: oklch(65% 0.17 145 / 0.1);
    --color-success-text: oklch(40% 0.15 145);
    --color-warning: oklch(75% 0.15 85);
    --color-warning-bg: oklch(75% 0.15 85 / 0.1);
    --color-error: oklch(62% 0.25 25);
    --color-info: oklch(60% 0.20 240);
    --color-orange: oklch(70% 0.18 55);

    /* Glass */
    --glass-bg: oklch(99% 0.002 90 / 0.8);
    --glass-border: oklch(90% 0.01 90 / 0.5);
    --glass-blur: 12px;

    /* Tipografia */
    --font-sans: 'Inter', sans-serif;
    --font-display: 'Space Grotesk', sans-serif;
    --font-serif: 'Cinzel', serif;
  }

  .dark {
    --color-bg: oklch(11% 0.025 260);
    --color-surface: oklch(15% 0.02 260);
    --color-muted: oklch(22% 0.015 260);
    --color-border: oklch(26% 0.012 260);
    --color-border-subtle: oklch(22% 0.01 260 / 0.6);
    --color-text-primary: oklch(98% 0.002 260);
    --color-text-secondary: oklch(83% 0.015 260);
    --color-text-muted: oklch(72% 0.02 260);
    --color-text-subtle: oklch(62% 0.025 260);
    --glass-bg: oklch(15% 0.02 260 / 0.75);
    --glass-border: oklch(100% 0 0 / 0.05);
  }

  html, body { background: var(--color-bg); color: var(--color-text-primary); font-family: var(--font-sans); }
  body { -webkit-font-smoothing: antialiased; }

  /* Tipografia em camadas */
  .font-display { font-family: var(--font-display); }
  .font-serif { font-family: var(--font-serif); }
  .h-hero { font-family: var(--font-display); font-size: clamp(40px, 6vw, 72px); font-weight: 700; line-height: 1.05; letter-spacing: -0.02em; }
  .h-section { font-family: var(--font-sans); font-size: clamp(32px, 4vw, 48px); font-weight: 700; line-height: 1.1; letter-spacing: -0.01em; }
  .h-sub { font-family: var(--font-sans); font-size: clamp(20px, 2vw, 24px); font-weight: 600; line-height: 1.3; }
  .t-eyebrow { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-primary-600); }
  .t-body { font-size: 17px; line-height: 1.6; color: var(--color-text-secondary); }
  .t-big-num { font-family: var(--font-display); font-size: clamp(56px, 8vw, 96px); font-weight: 700; line-height: 1; letter-spacing: -0.02em; color: var(--color-primary-600); }

  /* Botões */
  .btn-primary { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 16px 32px; min-height: 56px; background: var(--color-primary-600); color: white; font-weight: 600; font-size: 16px; border-radius: 12px; transition: transform .25s cubic-bezier(0.22,1,0.36,1), box-shadow .25s, background .2s; box-shadow: 0 8px 24px -8px oklch(60% 0.18 240 / 0.4); cursor: pointer; border: none; }
  .btn-primary:hover { background: var(--color-primary-700); transform: translateY(-2px); box-shadow: 0 12px 32px -8px oklch(60% 0.18 240 / 0.5); }
  .btn-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 16px 32px; min-height: 56px; background: transparent; color: var(--color-text-primary); font-weight: 600; font-size: 16px; border-radius: 12px; border: 1.5px solid var(--color-border); transition: all .2s; cursor: pointer; }
  .btn-secondary:hover { background: var(--color-muted); border-color: var(--color-text-muted); }

  /* Cards */
  .card { background: var(--color-surface); border: 1px solid var(--color-border-subtle); border-radius: 16px; padding: 32px; transition: transform .25s cubic-bezier(0.22,1,0.36,1), box-shadow .25s; }
  .card-lift:hover { transform: translateY(-4px); box-shadow: 0 24px 48px -16px oklch(0% 0 0 / 0.15); }

  /* Glass */
  .glass { background: var(--glass-bg); backdrop-filter: blur(var(--glass-blur)); -webkit-backdrop-filter: blur(var(--glass-blur)); border-bottom: 1px solid var(--glass-border); }

  /* Reveal on scroll */
  .reveal { opacity: 0; transform: translateY(24px); transition: opacity .7s cubic-bezier(0.22,1,0.36,1), transform .7s cubic-bezier(0.22,1,0.36,1); }
  .reveal.in { opacity: 1; transform: translateY(0); }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
    .reveal { opacity: 1 !important; transform: none !important; }
  }
</style>`;

export const MOTION_SCRIPT = `<script>
  // Reveal on scroll
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  // Counter animado em big numbers
  document.querySelectorAll('.counter').forEach(el => {
    const target = +el.dataset.target;
    const dur = +(el.dataset.duration || 1200);
    const suffix = el.dataset.suffix || '';
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.floor(eased * target).toLocaleString('pt-BR') + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    new IntersectionObserver(([e], obs) => {
      if (e.isIntersecting) { requestAnimationFrame(step); obs.disconnect(); }
    }, { threshold: 0.5 }).observe(el);
  });

  // FAQ accordion
  document.querySelectorAll('[data-faq-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('[data-faq-item]');
      if (item) item.classList.toggle('open');
    });
  });
<\/script>`;

// ---------------------------------------------------------------------------
// Post-processing functions
// ---------------------------------------------------------------------------

/** Injeta design tokens CSS se ausente */
function ensureDesignTokens(html: string): string {
  if (html.includes('crm-design-tokens') || html.includes('--color-primary-600')) return html;
  return html.includes('</head>')
    ? html.replace('</head>', DESIGN_TOKENS_CSS + '\n</head>')
    : html;
}

/** Injeta Google Fonts se ausente */
function ensureGoogleFonts(html: string): string {
  if (html.includes('fonts.googleapis.com') && html.includes('Space+Grotesk')) return html;
  return html.includes('</head>')
    ? html.replace('</head>', GOOGLE_FONTS_HTML + '\n</head>')
    : html;
}

/** Injeta Tailwind CDN se ausente */
function ensureTailwindCDN(html: string): string {
  if (html.includes('cdn.tailwindcss.com')) return html;
  return html.includes('</head>')
    ? html.replace('</head>', TAILWIND_CDN_HTML + '\n</head>')
    : html;
}

/** Injeta viewport meta se ausente */
function ensureViewportMeta(html: string): string {
  if (html.includes('viewport')) return html;
  return html.includes('</head>')
    ? html.replace('</head>', VIEWPORT_META_HTML + '\n</head>')
    : html;
}

/** Injeta motion script se ausente */
function ensureMotionScript(html: string): string {
  if (html.includes('IntersectionObserver') || html.includes('.reveal')) return html;
  return html.includes('</body>')
    ? html.replace('</body>', MOTION_SCRIPT + '\n</body>')
    : html;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Garante que o HTML de uma landing page tenha todos os assets obrigatórios.
 * Seguro para rodar múltiplas vezes (idempotente — checa antes de injetar).
 */
export function postProcessHtml(html: string): string {
  if (!html.trim()) return html;

  let result = html;
  result = ensureTailwindCDN(result);
  result = ensureGoogleFonts(result);
  result = ensureViewportMeta(result);
  result = ensureDesignTokens(result);
  result = ensureMotionScript(result);

  return result;
}
