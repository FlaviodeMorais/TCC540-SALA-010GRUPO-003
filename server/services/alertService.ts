/**
 * Serviço de Alertas
 * Verifica se os parâmetros do sistema estão dentro dos limites e envia alertas quando necessário
 */

import { sendAlertEmail } from './emailService';
import { storage } from '../storage';

// Configurações de limites para alertas
interface AlertConfig {
  enabled: boolean;
  email: string;
  senderEmail: string;
  temperature: {
    enabled: boolean;
    min: number;
    max: number;
    lastAlertSent?: number; // timestamp do último alerta enviado
  };
  level: {
    enabled: boolean;
    min: number;
    max: number;
    lastAlertSent?: number; // timestamp do último alerta enviado
  };
  // Intervalo mínimo entre alertas do mesmo tipo (em milissegundos)
  // Para evitar spam de alertas, por padrão 30 minutos
  alertInterval: number;
}

// Configuração padrão
let alertConfig: AlertConfig = {
  enabled: false,
  email: '',
  senderEmail: 'sistema-aquaponico@example.com',
  temperature: {
    enabled: true,
    min: 20,
    max: 30,
    lastAlertSent: 0
  },
  level: {
    enabled: true,
    min: 50,
    max: 80,
    lastAlertSent: 0
  },
  alertInterval: 30 * 60 * 1000 // 30 minutos
};

/**
 * Inicializa o serviço de alertas com as configurações salvas
 */
export async function initAlertService() {
  try {
    // Carregar as configurações salvas no banco de dados
    const settings = await storage.getSettings();
    
    if (settings.alert_config) {
      try {
        const savedConfig = JSON.parse(settings.alert_config);
        alertConfig = {
          ...alertConfig,
          ...savedConfig
        };
        console.log('✅ Configurações de alertas carregadas com sucesso');
      } catch (error) {
        console.error('⚠️ Erro ao parsear configurações de alertas:', error);
      }
    } else {
      console.log('ℹ️ Configurações de alertas não encontradas, usando padrão');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Erro ao inicializar serviço de alertas:', error);
    return false;
  }
}

/**
 * Atualiza a configuração de alertas
 * @param newConfig Nova configuração
 * @returns Configuração atualizada
 */
export async function updateAlertConfig(newConfig: Partial<AlertConfig>): Promise<AlertConfig> {
  try {
    // Atualizar a configuração mantendo os valores não especificados
    alertConfig = {
      ...alertConfig,
      ...newConfig,
      temperature: {
        ...alertConfig.temperature,
        ...newConfig.temperature
      },
      level: {
        ...alertConfig.level,
        ...newConfig.level
      }
    };
    
    // Salvar no banco de dados
    const settings = await storage.getSettings();
    await storage.updateSettings({
      ...settings,
      alert_config: JSON.stringify(alertConfig)
    });
    
    console.log('✅ Configurações de alertas atualizadas com sucesso');
    return alertConfig;
  } catch (error) {
    console.error('❌ Erro ao atualizar configurações de alertas:', error);
    return alertConfig;
  }
}

/**
 * Retorna a configuração atual de alertas
 * @returns Configuração atual
 */
export function getAlertConfig(): AlertConfig {
  return alertConfig;
}

/**
 * Verifica se um parâmetro está fora dos limites e envia um alerta se necessário
 * @param parameter Nome do parâmetro (temperature, level)
 * @param value Valor atual
 * @returns true se o alerta foi enviado, false caso contrário
 */
export async function checkAndSendAlert(parameter: 'temperature' | 'level', value: number): Promise<boolean> {
  if (!alertConfig.enabled) {
    return false;
  }

  const paramConfig = alertConfig[parameter];
  if (!paramConfig.enabled) {
    return false;
  }

  const now = Date.now();
  const lastAlert = paramConfig.lastAlertSent || 0;
  const timeSinceLastAlert = now - lastAlert;

  // Verificar se o valor está fora dos limites
  const isOutOfBounds = value < paramConfig.min || value > paramConfig.max;
  
  // Verificar se já passou tempo suficiente desde o último alerta
  const canSendAlert = timeSinceLastAlert > alertConfig.alertInterval;

  if (isOutOfBounds && canSendAlert) {
    try {
      // Enviar alerta por e-mail
      const success = await sendAlertEmail(
        alertConfig.email,
        alertConfig.senderEmail,
        parameter,
        value,
        paramConfig.min,
        paramConfig.max
      );

      if (success) {
        // Atualizar o timestamp do último alerta enviado
        paramConfig.lastAlertSent = now;
        console.log(`✅ Alerta enviado: ${parameter} = ${value}`);
        return true;
      }
    } catch (error) {
      console.error(`❌ Erro ao enviar alerta para ${parameter}:`, error);
    }
  }

  return false;
}

/**
 * Processa as leituras mais recentes e envia alertas se necessário
 */
export async function processAlertsForLatestReadings(): Promise<void> {
  try {
    // Obter as leituras mais recentes
    const readings = await storage.getLatestReadings(1);
    
    if (readings.length === 0) {
      return;
    }

    const reading = readings[0];
    
    // Verificar temperatura
    await checkAndSendAlert('temperature', reading.temperature);
    
    // Verificar nível
    await checkAndSendAlert('level', reading.level);
    
  } catch (error) {
    console.error('❌ Erro ao processar alertas:', error);
  }
}

// Inicializar o serviço quando o módulo for carregado
initAlertService().then(() => {
  console.log('📢 Serviço de alertas inicializado');
  
  // Configurar verificação periódica de alertas
  // A cada 5 minutos (300000 ms)
  setInterval(processAlertsForLatestReadings, 300000);
});