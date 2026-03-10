/**
 * Templates de e-mail para automações do Funil de Qualificação.
 */

interface TemplateVars {
  contactName: string;
  dealTitle?: string;
  [key: string]: string | undefined;
}

interface RenderedEmail {
  subject: string;
  html: string;
}

const BASE_STYLE = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  max-width: 600px;
  margin: 0 auto;
  color: #1e293b;
`;

function wrapHtml(content: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="background:#f8fafc;padding:32px 16px;">
  <div style="${BASE_STYLE}">
    <div style="background:#fff;border-radius:12px;padding:40px;border:1px solid #e2e8f0;">
      ${content}
    </div>
    <p style="text-align:center;font-size:12px;color:#94a3b8;margin-top:24px;">
      Você está recebendo este e-mail pois é um contato em nossa base.
      Responda este e-mail para entrar em contato diretamente.
    </p>
  </div>
</body>
</html>`;
}

const TEMPLATES: Record<string, (vars: TemplateVars) => RenderedEmail> = {
  'primeiro-contato': ({ contactName }) => ({
    subject: `Olá ${contactName}, temos uma proposta para você`,
    html: wrapHtml(`
      <h2 style="font-size:22px;font-weight:700;color:#0f172a;margin:0 0 16px;">
        Olá, ${contactName}!
      </h2>
      <p style="font-size:16px;line-height:1.6;color:#475569;margin:0 0 16px;">
        Espero que esteja bem! Gostaria de apresentar nossa solução e entender
        como podemos colaborar com o crescimento do seu negócio.
      </p>
      <p style="font-size:16px;line-height:1.6;color:#475569;margin:0 0 24px;">
        Podemos agendar uma conversa rápida de 15 minutos? Basta responder
        este e-mail com sua disponibilidade.
      </p>
      <a href="mailto:" style="
        display:inline-block;
        background:#6366f1;
        color:#fff;
        padding:12px 24px;
        border-radius:8px;
        text-decoration:none;
        font-weight:600;
        font-size:15px;
      ">Responder agora</a>
    `),
  }),

  'follow-up': ({ contactName }) => ({
    subject: `${contactName}, ainda podemos ajudar você`,
    html: wrapHtml(`
      <h2 style="font-size:22px;font-weight:700;color:#0f172a;margin:0 0 16px;">
        ${contactName}, passando para verificar!
      </h2>
      <p style="font-size:16px;line-height:1.6;color:#475569;margin:0 0 16px;">
        Notamos que ainda não tivemos a chance de conversar. Entendemos que
        sua agenda é corrida — por isso, estou aqui para facilitar ao máximo.
      </p>
      <p style="font-size:16px;line-height:1.6;color:#475569;margin:0 0 24px;">
        Se houver um momento melhor, é só me dizer. Podemos também trocar
        informações por e-mail se preferir.
      </p>
      <a href="mailto:" style="
        display:inline-block;
        background:#6366f1;
        color:#fff;
        padding:12px 24px;
        border-radius:8px;
        text-decoration:none;
        font-weight:600;
        font-size:15px;
      ">Entrar em contato</a>
    `),
  }),
};

export function renderEmailTemplate(templateId: string, vars: TemplateVars): RenderedEmail {
  const template = TEMPLATES[templateId];
  if (!template) throw new Error(`Email template not found: ${templateId}`);
  return template(vars);
}

export { TEMPLATES as EMAIL_TEMPLATES };
