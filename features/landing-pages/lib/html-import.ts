/**
 * @fileoverview Utilitários para importar HTML externo (ex: Lovable) como
 * Landing Page do NossoCRM. A ideia é localizar o primeiro `<form>` do HTML
 * importado e injetar um handler `fetch` que submete para nosso webhook
 * `/api/p/[slug]/submit` autenticado por `x-api-key`.
 *
 * Operações são puramente em string — evitam DOMParser para rodar em
 * qualquer runtime (Node/Edge).
 */

/** Placeholder substituído no servidor no momento da persistência. */
export const SLUG_PLACEHOLDER = '__LP_SLUG__';

/** Resultado da análise do HTML importado. */
export interface ImportAnalysis {
  hasForm: boolean;
  hasDataImages: boolean;
  warnings: string[];
}

/**
 * Analisa o HTML importado e retorna sinalizadores para o usuário revisar
 * antes de publicar (forms, imagens embutidas em base64, etc).
 */
export function analyzeImportedHtml(html: string): ImportAnalysis {
  const warnings: string[] = [];
  const hasForm = /<form\b[^>]*>/i.test(html);
  const hasDataImages = /src\s*=\s*["']data:image\//i.test(html);

  if (!hasForm) {
    warnings.push(
      'Nenhum formulário encontrado no HTML. A LP será publicada, mas não capturará leads até você adicionar um <form> e reimportar.'
    );
  }
  if (hasDataImages) {
    warnings.push(
      'Detectadas imagens embutidas em base64 (data:image). Recomendamos substituir pelo upload de imagens para performance.'
    );
  }

  return { hasForm, hasDataImages, warnings };
}

/**
 * Garante que o primeiro `<form>` do HTML tenha `id="crm-capture-form"` para
 * ser referenciado pelo script injetado. Se já existe id, mantém.
 */
function ensureFormId(html: string): string {
  return html.replace(/<form\b([^>]*)>/i, (match, attrs: string) => {
    if (/\bid\s*=/.test(attrs)) return match;
    return `<form id="crm-capture-form"${attrs}>`;
  });
}

/**
 * Gera o script inline que captura o submit do form e envia para o webhook
 * do CRM com a API key da LP. O slug é substituído em tempo de render.
 */
function buildCaptureScript(apiKey: string): string {
  return `
<script>
(function () {
  try {
    var form = document.getElementById('crm-capture-form');
    if (!form) return;
    form.setAttribute('novalidate', 'novalidate');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var payload = {};
      fd.forEach(function (v, k) { payload[k] = typeof v === 'string' ? v : ''; });
      var submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      var originalText = submitBtn ? (submitBtn.innerText || submitBtn.value) : '';
      if (submitBtn) { submitBtn.disabled = true; if ('innerText' in submitBtn) submitBtn.innerText = 'Enviando...'; }
      fetch('/api/p/${SLUG_PLACEHOLDER}/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': '${apiKey}' },
        body: JSON.stringify(payload),
      })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (data) {
          if (data && data.redirectUrl) { window.location.href = data.redirectUrl; return; }
          form.innerHTML = '<div style="padding:32px;text-align:center;font-family:var(--font-sans,inherit);"><h3 style="font-size:20px;font-weight:700;margin-bottom:8px;">Obrigado!</h3><p>Recebemos seus dados. Em breve entraremos em contato.</p></div>';
        })
        .catch(function () {
          if (submitBtn) { submitBtn.disabled = false; if ('innerText' in submitBtn) submitBtn.innerText = originalText || 'Enviar'; }
          alert('Erro ao enviar. Tente novamente.');
        });
    });
  } catch (err) { console.error('[crm-capture] init error', err); }
})();
</script>`;
}

/**
 * Injeta no HTML o id do form + o script de captura antes de `</body>`.
 * Idempotente: se o script já foi injetado, não duplica.
 */
export function injectFormHandler(html: string, apiKey: string): string {
  let result = ensureFormId(html);

  // Evita duplicar o script se já foi injetado em outra rodada.
  if (result.includes('crm-capture-form') && result.includes('x-api-key')) {
    return result;
  }

  const script = buildCaptureScript(apiKey);
  if (result.includes('</body>')) {
    result = result.replace('</body>', `${script}\n</body>`);
  } else {
    result = `${result}\n${script}`;
  }
  return result;
}

/**
 * Substitui o placeholder de slug pela slug real da LP. Deve ser chamado
 * sempre que o HTML é entregue publicamente em `/p/[slug]`.
 */
export function resolveSlugPlaceholder(html: string, slug: string): string {
  if (!html.includes(SLUG_PLACEHOLDER)) return html;
  return html.split(SLUG_PLACEHOLDER).join(slug);
}

/**
 * Tenta normalizar nomes de campos comuns (`email`, `phone`, `name`) caso
 * o HTML importado use inputs sem atributo `name`. Não sobrescreve nomes
 * existentes — apenas atribui quando ausente e o tipo é conhecido.
 */
export function normalizeFieldNames(html: string): string {
  return html.replace(/<input\b([^>]*)>/gi, (match, attrs: string) => {
    if (/\bname\s*=/.test(attrs)) return match;
    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
    if (!typeMatch) return match;
    const type = typeMatch[1].toLowerCase();
    let guessedName: string | null = null;
    if (type === 'email') guessedName = 'email';
    else if (type === 'tel') guessedName = 'phone';
    if (!guessedName) return match;
    return `<input${attrs} name="${guessedName}">`;
  });
}
