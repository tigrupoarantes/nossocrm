import type { LandingPageField } from '@/types';

// =============================================================================
// System Prompt para geração de Landing Pages com IA
// =============================================================================

export const LANDING_PAGE_SYSTEM_PROMPT = `Você é um especialista em design de landing pages de alta conversão.

TAREFA: Gere o HTML COMPLETO de uma landing page profissional.

REGRAS TÉCNICAS OBRIGATÓRIAS:
1. HTML auto-contido (um único arquivo, sem dependências externas exceto CDNs)
2. Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
3. Google Fonts via <link> no <head>
4. Mobile-first, 100% responsivo (testar em 375px e 1440px)
5. Imagens: usar URLs do Unsplash (https://images.unsplash.com/...)
6. Formulário de captura pré-configurado (ver FORMULÁRIO abaixo)
7. Retornar APENAS o HTML, sem markdown, sem explicações, sem code fences

SEÇÕES OBRIGATÓRIAS (nesta ordem):
1. <header> com logo/nome da empresa e navegação âncora
2. Hero section com headline impactante, subtítulo e CTA principal
3. Benefícios/Features (3-6 itens com ícones SVG inline)
4. Social proof (depoimentos com foto, nome e cargo)
5. Formulário de captura com campos configurados
6. FAQ (3-5 perguntas frequentes com accordion simples em JS)
7. <footer> com informações legais e links

ESTILO VISUAL:
- Moderno, clean, profissional
- Gradients sutis (não exagerar)
- Sombras suaves (shadow-lg, shadow-xl)
- Bordas arredondadas (rounded-xl, rounded-2xl)
- Microinterações CSS (hover:scale-105, transition-all duration-300)
- Contraste WCAG AA mínimo
- Lazy loading em imagens: loading="lazy"

FORMULÁRIO DE CAPTURA:
O formulário deve usar este JavaScript exato:

<form id="lead-form" class="space-y-4">
  {{FORM_FIELDS_HTML}}
  <button type="submit" id="submit-btn" class="w-full bg-blue-600 text-white py-3 px-6 rounded-xl font-semibold hover:bg-blue-700 transition-all duration-300">
    {{CTA_TEXT}}
  </button>
  <p id="form-status" class="text-sm text-center hidden"></p>
</form>

<script>
document.getElementById('lead-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  const status = document.getElementById('form-status');
  const formData = new FormData(this);
  const data = Object.fromEntries(formData.entries());

  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const res = await fetch('{{WEBHOOK_URL}}', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': '{{API_KEY}}'
      },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      {{REDIRECT_OR_MESSAGE}}
    } else {
      status.textContent = 'Erro ao enviar. Tente novamente.';
      status.className = 'text-sm text-center text-red-500';
      status.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = '{{CTA_TEXT}}';
    }
  } catch (err) {
    status.textContent = 'Erro de conexão. Tente novamente.';
    status.className = 'text-sm text-center text-red-500';
    status.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = '{{CTA_TEXT}}';
  }
});
</script>

DADOS DA ORGANIZAÇÃO:
- Nome: {{ORG_NAME}}

SEO:
Incluir no <head>:
- <title>, <meta name="description">
- Open Graph tags (og:title, og:description, og:image, og:url)
- viewport meta tag
- charset utf-8`;

// =============================================================================
// Helpers para montar o prompt final
// =============================================================================

function buildFormFieldsHtml(fields: LandingPageField[]): string {
  if (fields.length === 0) {
    return `<input type="text" name="name" placeholder="Seu nome completo" required
      class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
    <input type="email" name="email" placeholder="Seu e-mail" required
      class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
    <input type="tel" name="phone" placeholder="Seu telefone / WhatsApp"
      class="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />`;
  }

  return fields.map(f => {
    const baseClass = 'w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500';
    const req = f.required ? ' required' : '';
    const ph = f.placeholder ? ` placeholder="${f.placeholder}"` : '';

    if (f.type === 'textarea') {
      return `<textarea name="${f.name}"${ph}${req} rows="3"
        class="${baseClass} resize-none"></textarea>`;
    }
    if (f.type === 'select' && f.options?.length) {
      const options = f.options.map(o => `<option value="${o}">${o}</option>`).join('\n');
      return `<select name="${f.name}"${req} class="${baseClass}">
        <option value="">${f.label}</option>
        ${options}
      </select>`;
    }
    return `<input type="${f.type}" name="${f.name}"${ph}${req}
      class="${baseClass}" />`;
  }).join('\n    ');
}

export interface BuildPromptParams {
  userPrompt: string;
  orgName: string;
  webhookUrl: string;
  apiKey: string;
  formFields?: LandingPageField[];
  thankYouMessage?: string;
  thankYouRedirectUrl?: string | null;
}

export function buildLandingPagePrompt(params: BuildPromptParams): string {
  const {
    userPrompt,
    orgName,
    webhookUrl,
    apiKey,
    formFields = [],
    thankYouMessage = 'Obrigado! Entraremos em contato em breve.',
    thankYouRedirectUrl,
  } = params;

  const redirectOrMessage = thankYouRedirectUrl
    ? `window.location.href = '${thankYouRedirectUrl}';`
    : `this.innerHTML = '<p class="text-center text-green-600 font-semibold text-lg py-8">${thankYouMessage}</p>';`;

  const formFieldsHtml = buildFormFieldsHtml(formFields);

  const system = LANDING_PAGE_SYSTEM_PROMPT
    .replace(/\{\{ORG_NAME\}\}/g, orgName)
    .replace(/\{\{WEBHOOK_URL\}\}/g, webhookUrl)
    .replace(/\{\{API_KEY\}\}/g, apiKey)
    .replace(/\{\{FORM_FIELDS_HTML\}\}/g, formFieldsHtml)
    .replace(/\{\{REDIRECT_OR_MESSAGE\}\}/g, redirectOrMessage)
    .replace(/\{\{CTA_TEXT\}\}/g, 'Quero saber mais');

  return system + '\n\n---\n\nDESCRIÇÃO DA LANDING PAGE:\n' + userPrompt;
}
