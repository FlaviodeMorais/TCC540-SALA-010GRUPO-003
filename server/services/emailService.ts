import { MailService } from '@sendgrid/mail';

// Configuração do serviço de e-mail com SendGrid
if (!process.env.SENDGRID_API_KEY) {
  console.error("⚠️ SENDGRID_API_KEY não configurada. O serviço de e-mail não funcionará corretamente.");
}

const mailService = new MailService();
// Garantir que a chave API seja uma string
const apiKey: string = process.env.SENDGRID_API_KEY || '';
mailService.setApiKey(apiKey);

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

/**
 * Envia um e-mail usando o serviço SendGrid
 * @param params Parâmetros do e-mail: destinatário, remetente, assunto, corpo
 * @returns Promise<boolean> Indica se o e-mail foi enviado com sucesso
 */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("⚠️ Tentativa de envio de e-mail sem SENDGRID_API_KEY configurada");
      return false;
    }

    const emailData = {
      to: params.to,
      from: params.from,
      subject: params.subject,
      text: params.text || '',
      html: params.html || ''
    } as const;
    
    await mailService.send(emailData);

    console.log(`✅ E-mail enviado com sucesso para ${params.to}`);
    return true;
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail via SendGrid:', error);
    return false;
  }
}

/**
 * Envia um alerta por e-mail sobre parâmetros fora dos limites aceitáveis
 * @param email E-mail do destinatário
 * @param senderEmail E-mail do remetente
 * @param parameter Nome do parâmetro (temperatura, nível, etc)
 * @param value Valor atual do parâmetro
 * @param min Valor mínimo aceitável
 * @param max Valor máximo aceitável
 * @returns Promise<boolean> Indica se o alerta foi enviado com sucesso
 */
export async function sendAlertEmail(
  email: string,
  senderEmail: string,
  parameter: string,
  value: number,
  min: number,
  max: number
): Promise<boolean> {
  const parameterName = parameter.charAt(0).toUpperCase() + parameter.slice(1);
  const subject = `🚨 Alerta do Sistema Aquapônico - ${parameterName} fora dos limites`;
  
  const text = `
    Olá,

    Seu sistema aquapônico detectou um valor de ${parameterName} fora dos limites aceitáveis.

    - ${parameterName} atual: ${value}
    - Limite mínimo: ${min}
    - Limite máximo: ${max}

    Recomendamos verificar o seu sistema assim que possível.

    Este é um e-mail automatizado, por favor não responda.
    Sistema de Monitoramento Aquapônico
  `;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
      <h2 style="color: #d9534f;">🚨 Alerta do Sistema Aquapônico</h2>
      <p>Seu sistema aquapônico detectou um valor de <strong>${parameterName}</strong> fora dos limites aceitáveis.</p>
      
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>${parameterName} atual:</strong> <span style="color: #d9534f; font-weight: bold;">${value}</span></p>
        <p><strong>Limite mínimo:</strong> ${min}</p>
        <p><strong>Limite máximo:</strong> ${max}</p>
      </div>
      
      <p>Recomendamos verificar o seu sistema assim que possível.</p>
      
      <p style="color: #777; font-size: 0.9em; margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px;">
        Este é um e-mail automatizado, por favor não responda.<br>
        <em>Sistema de Monitoramento Aquapônico</em>
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    from: senderEmail,
    subject,
    text,
    html
  });
}

/**
 * Envia um relatório diário por e-mail com as médias de parâmetros do sistema
 * @param email E-mail do destinatário
 * @param senderEmail E-mail do remetente
 * @param data Dados do relatório diário
 * @returns Promise<boolean> Indica se o relatório foi enviado com sucesso
 */
export async function sendDailyReport(
  email: string,
  senderEmail: string,
  data: {
    avgTemperature: number;
    avgLevel: number;
    pumpActiveTimeHours: number;
    heaterActiveTimeHours: number;
    date: string;
  }
): Promise<boolean> {
  const subject = `📊 Relatório Diário do Sistema Aquapônico - ${data.date}`;
  
  const text = `
    Olá,

    Segue o relatório diário do seu sistema aquapônico para ${data.date}:

    - Temperatura média: ${data.avgTemperature.toFixed(1)}°C
    - Nível médio: ${data.avgLevel.toFixed(1)}%
    - Tempo de atividade da bomba: ${data.pumpActiveTimeHours.toFixed(1)} horas
    - Tempo de atividade do aquecedor: ${data.heaterActiveTimeHours.toFixed(1)} horas

    Este é um e-mail automatizado, por favor não responda.
    Sistema de Monitoramento Aquapônico
  `;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
      <h2 style="color: #5bc0de;">📊 Relatório Diário do Sistema Aquapônico</h2>
      <p>Segue o relatório diário do seu sistema aquapônico para <strong>${data.date}</strong>:</p>
      
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Temperatura média:</strong> ${data.avgTemperature.toFixed(1)}°C</p>
        <p><strong>Nível médio:</strong> ${data.avgLevel.toFixed(1)}%</p>
        <p><strong>Tempo de atividade da bomba:</strong> ${data.pumpActiveTimeHours.toFixed(1)} horas</p>
        <p><strong>Tempo de atividade do aquecedor:</strong> ${data.heaterActiveTimeHours.toFixed(1)} horas</p>
      </div>
      
      <p style="color: #777; font-size: 0.9em; margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px;">
        Este é um e-mail automatizado, por favor não responda.<br>
        <em>Sistema de Monitoramento Aquapônico</em>
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    from: senderEmail,
    subject,
    text,
    html
  });
}