/**
 * @fileoverview Abstração de canais de comunicação
 *
 * Ponto de entrada único para envio de mensagens.
 * Resolve automaticamente o canal preferido do contato.
 */

export { sendEmail, sendAutomationEmail, testSmtpConnection } from './email';
export type { SmtpConfig, SendEmailParams } from './email';

export { sendWhatsApp, sendAutomationWhatsApp, testTwilioCredentials } from './whatsapp';
export type { TwilioConfig, SendWhatsAppParams } from './whatsapp';

export {
  sendWahaMessage,
  sendAutomationWaha,
  testWahaConnection,
  getWahaSessionStatus,
  getWahaQrCode,
  toChatId,
} from './waha';
export type {
  WahaConfig,
  SendWahaParams,
  WahaSendResult,
  WahaSessionStatus,
  WahaSessionInfo,
  WahaQrCode,
  AutomationWahaParams,
} from './waha';
