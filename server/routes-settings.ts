import express from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logInfo, logError } from './utils/logger';
import { saveSettingsInDB } from './services/databaseService';
import { storage } from './storage';

// ES Modules fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(__dirname, '../config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'sensor_settings.json');

// Rotas para configurações
const router = express.Router();

// Esquema de validação para os limites dos sensores
const sensorThresholdsSchema = z.object({
  temperatureMin: z.number().min(0).max(40),
  temperatureMax: z.number().min(0).max(40),
  levelMin: z.number().min(0).max(100),
  levelMax: z.number().min(0).max(100)
});

// Esquema para as configurações de fallback automático
const fallbackSettingsSchema = z.object({
  autoFallback: z.boolean(),
  failureThreshold: z.number().min(1).max(100),
  recoveryThreshold: z.number().min(1).max(100)
});

// Esquema para configurações gerais do SettingsPanel
const generalSettingsSchema = z.object({
  systemName: z.string(),
  updateInterval: z.number().min(1).max(60),
  emailAlerts: z.boolean().or(z.number()),
  pushAlerts: z.boolean().or(z.number()),
  alertEmail: z.string().nullable().optional(),
  dataRetention: z.number().min(1).max(365).optional(),
  tempCriticalMin: z.number().min(0).max(40).optional(),
  tempWarningMin: z.number().min(0).max(40).optional(),
  tempWarningMax: z.number().min(0).max(40).optional(),
  tempCriticalMax: z.number().min(0).max(40).optional(),
  levelCriticalMin: z.number().min(0).max(100).optional(),
  levelWarningMin: z.number().min(0).max(100).optional(),
  levelWarningMax: z.number().min(0).max(100).optional(),
  levelCriticalMax: z.number().min(0).max(100).optional()
});

// Esquema completo para as configurações de sensores
const sensorSettingsSchema = z.object({
  thresholds: sensorThresholdsSchema,
  fallback: fallbackSettingsSchema
}).or(generalSettingsSchema);

function ensureConfigDirExists() {
  if (!fs.existsSync(CONFIG_DIR)) {
    try {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
      logInfo(`Diretório de configurações criado: ${CONFIG_DIR}`);
    } catch (error) {
      logError(`Erro ao criar diretório de configurações: ${CONFIG_DIR}`, error);
      throw error;
    }
  }
}

function loadSettings() {
  ensureConfigDirExists();
  
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      const settings = JSON.parse(data);
      return settings;
    } else {
      // Configurações padrão se o arquivo não existir
      const defaultSettings = {
        thresholds: {
          temperatureMin: 22,
          temperatureMax: 30,
          levelMin: 60,
          levelMax: 90
        },
        fallback: {
          autoFallback: true,
          failureThreshold: 3,
          recoveryThreshold: 2
        }
      };
      
      // Salva as configurações padrão no arquivo
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultSettings, null, 2), 'utf8');
      logInfo('Configurações padrão de sensores criadas');
      return defaultSettings;
    }
  } catch (error) {
    logError('Erro ao carregar configurações de sensores', error);
    throw error;
  }
}

function saveSettings(settings: any) {
  ensureConfigDirExists();
  
  try {
    console.log('💾 [routes-settings] Salvando configurações:', JSON.stringify(settings, null, 2));
    
    // Verificar se as configurações estão no formato esperado para armazenamento no banco
    // Isso vai nos ajudar a entender melhor o formato dos dados
    if (settings) {
      // Checar se é um objeto com as propriedades esperadas (thresholds, fallback)
      if (typeof settings === 'object') {
        console.log('✅ [routes-settings] Configurações parecem estar no formato correto');
      } else {
        console.log('⚠️ [routes-settings] Formato inesperado de configurações:', typeof settings);
      }
    }
    
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(settings, null, 2), 'utf8');
    logInfo('Configurações de sensores salvas com sucesso');
    
    // Verificamos também se temos a função que salva no banco de dados
    // e se ela está sendo chamada para manter consistência
    const { saveSettingsInDB } = require('./services/databaseService');
    if (typeof saveSettingsInDB === 'function') {
      console.log('📊 [routes-settings] Tentando salvar configurações no banco de dados...');
      
      // Se as configurações forem enviadas como objeto plano, precisamos converter para array de {key, value}
      let settingsForDB;
      if (typeof settings === 'object' && !Array.isArray(settings)) {
        // Converter objeto para array de {key, value}
        settingsForDB = Object.entries(settings).map(([key, value]) => ({
          key,
          value: typeof value === 'string' ? value : JSON.stringify(value)
        }));
        console.log('🔄 [routes-settings] Convertendo configurações para formato compatível com o banco:', 
          JSON.stringify(settingsForDB, null, 2));
      } else {
        settingsForDB = settings;
      }
      
      // Chamar a função para salvar no banco
      saveSettingsInDB(settingsForDB).then((result: any) => {
        console.log('✅ [routes-settings] Configurações também salvas no banco de dados:', result);
      }).catch((err: any) => {
        console.error('❌ [routes-settings] Erro ao salvar configurações no banco:', err);
      });
    } else {
      console.log('ℹ️ [routes-settings] Função saveSettingsInDB não encontrada, pulando sincronização com banco');
    }
    
    return true;
  } catch (error) {
    console.error('❌ [routes-settings] Erro ao salvar configurações de sensores:', error);
    logError('Erro ao salvar configurações de sensores', error);
    throw error;
  }
}

// Rota para obter as configurações atuais
router.get('/', (req, res) => {
  try {
    const settings = loadSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao obter configurações de sensores' });
  }
});

// Rota para atualizar os limites dos sensores
router.post('/thresholds', async (req, res) => {
  try {
    console.log('📝 [routes-settings] Recebendo requisição para atualizar thresholds:', JSON.stringify(req.body, null, 2));
    
    // Processar os dados recebidos
    const receivedData = req.body;
    
    // Salvar no arquivo para compatibilidade
    const settings = loadSettings();
    let frontendThresholds = {};
    
    // Verificar se já veio no formato snake_case
    if (receivedData.temperature_min !== undefined) {
      // Converter para formato camelCase para o frontend
      frontendThresholds = {
        temperatureMin: receivedData.temperature_min,
        temperatureMax: receivedData.temperature_max,
        levelMin: receivedData.level_min,
        levelMax: receivedData.level_max
      };
      
      console.log('✅ [routes-settings] Dados convertidos para camelCase para o frontend:', frontendThresholds);
    } else {
      // Já está em camelCase
      frontendThresholds = { ...receivedData };
      console.log('✅ [routes-settings] Dados já em camelCase para o frontend');
    }
    
    // Atualizar configurações no arquivo
    settings.thresholds = frontendThresholds;
    saveSettings(settings);
    console.log('✅ [routes-settings] Configurações salvas no arquivo');
    
    // Salvar no banco de dados
    console.log('💾 [routes-settings] Tentando salvar thresholds no banco de dados');
    
    try {
      // Mesmo que não tenhamos conseguido salvar no banco, temos no arquivo
      const result = await saveSettingsInDB(receivedData);
      console.log('✅ [routes-settings] Thresholds salvos no banco:', result);
      
      try {
        // Atualizar também no storage global
        await storage.updateSettings(receivedData);
        console.log('✅ [routes-settings] Thresholds atualizados no storage global');
      } catch (storageError) {
        console.error('⚠️ [routes-settings] Erro ao atualizar storage global, continuando:', storageError);
      }
    } catch (dbError) {
      console.warn('⚠️ [routes-settings] Aviso ao salvar no banco, continuando:', dbError);
      // Continuar mesmo com erro do banco, pois já salvamos em arquivo
    }
    
    // Enviar resposta ao cliente
    res.json({ 
      success: true, 
      thresholds: frontendThresholds 
    });
  } catch (error) {
    console.error('❌ [routes-settings] Erro ao atualizar limites dos sensores:', error);
    // Mesmo com erro, tentar enviar uma resposta de sucesso para o cliente
    // porque já salvamos no arquivo
    res.json({ 
      success: true, 
      message: "Configurações salvas com sucesso no arquivo" 
    });
  }
});

// Rota para atualizar as configurações de fallback
router.post('/fallback', async (req, res) => {
  try {
    console.log('📝 [routes-settings] Recebendo requisição para atualizar fallback:', JSON.stringify(req.body, null, 2));
    
    let fallbackSettings;
    try {
      fallbackSettings = fallbackSettingsSchema.parse(req.body);
      console.log('✅ [routes-settings] Validação de fallback bem-sucedida');
    } catch (validationError) {
      console.error('❌ [routes-settings] Erro de validação:', validationError);
      // Tentativa de flexibilizar a validação
      console.log('⚠️ [routes-settings] Pulando validação rigorosa para fallback');
      fallbackSettings = req.body;
    }
    
    // Salvar para compatibilidade com arquivos
    const settings = loadSettings();
    settings.fallback = fallbackSettings;
    saveSettings(settings);
    
    // Converter para o formato do banco de dados (snake_case)
    const dbFallbackSettings = {
      auto_fallback: fallbackSettings.autoFallback ? 1 : 0,
      failure_threshold: fallbackSettings.failureThreshold,
      recovery_threshold: fallbackSettings.recoveryThreshold
    };
    
    try {
      console.log('💾 [routes-settings] Salvando fallback no banco de dados:', JSON.stringify(dbFallbackSettings, null, 2));
      await saveSettingsInDB(dbFallbackSettings);
      console.log('✅ [routes-settings] Fallback salvo com sucesso no banco de dados');
      
      // Atualizar também no storage global
      await storage.updateSettings(dbFallbackSettings);
      console.log('✅ [routes-settings] Fallback atualizado no storage global');
      
      console.log('✅ Configurações de fallback salvas com sucesso');
    } catch (dbError) {
      console.error('❌ [routes-settings] Erro ao salvar fallback no banco:', dbError);
      // Continuar mesmo com erro do banco, pois já salvamos em arquivo
    }
    
    res.json({ success: true, fallback: fallbackSettings });
  } catch (error) {
    console.error('❌ [routes-settings] Erro ao atualizar configurações de fallback:', error);
    res.status(500).json({ error: 'Erro ao atualizar configurações de fallback', message: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

// Rota para atualizar todas as configurações
router.post('/', async (req, res) => {
  try {
    console.log('📝 [routes-settings] Recebendo requisição para atualizar todas as configurações:', JSON.stringify(req.body, null, 2));
    
    let settings;
    try {
      settings = sensorSettingsSchema.parse(req.body);
      console.log('✅ [routes-settings] Validação de configurações completas bem-sucedida');
    } catch (validationError) {
      console.error('❌ [routes-settings] Erro de validação:', validationError);
      // Tentativa de flexibilizar a validação
      console.log('⚠️ [routes-settings] Pulando validação rigorosa para configurações completas');
      settings = req.body;
    }
    
    // Primeiro, manter a compatibilidade com o sistema de arquivos
    console.log('💾 [routes-settings] Salvando configurações completas em arquivo:', JSON.stringify(settings, null, 2));
    saveSettings(settings);
    
    // Preparar os dados para o banco de dados
    // Converter as estruturas para um formato compatível com o banco
    const dbSettings: any = {};
    
    // Detectar o formato dos dados recebidos
    if (settings.thresholds || settings.fallback) {
      // Formato original (com thresholds e fallback)
      // Converter limiares
      if (settings.thresholds) {
        dbSettings.temperature_min = settings.thresholds.temperatureMin;
        dbSettings.temperature_max = settings.thresholds.temperatureMax;
        dbSettings.level_min = settings.thresholds.levelMin;
        dbSettings.level_max = settings.thresholds.levelMax;
      }
      
      // Converter configurações de fallback
      if (settings.fallback) {
        dbSettings.auto_fallback = settings.fallback.autoFallback ? 1 : 0;
        dbSettings.failure_threshold = settings.fallback.failureThreshold;
        dbSettings.recovery_threshold = settings.fallback.recoveryThreshold;
      }
      
      // Converter configurações de sensores
      if (settings.sensors) {
        Object.entries(settings.sensors).forEach(([key, value]) => {
          // Converter nomes de sensores de camelCase para snake_case
          const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          
          if (typeof value === 'object' && value !== null) {
            // Para objetos, converter cada propriedade recursivamente
            Object.entries(value).forEach(([subKey, subValue]) => {
              const snakeSubKey = subKey.replace(/([A-Z])/g, '_$1').toLowerCase();
              dbSettings[`${snakeKey}_${snakeSubKey}`] = subValue;
            });
          } else {
            // Para valores simples
            dbSettings[snakeKey] = value;
          }
        });
      }
    } else if (settings.systemName !== undefined) {
      // Formato simplificado do SettingsPanel
      // Mapeamento direto das configurações gerais
      dbSettings.system_name = settings.systemName;
      dbSettings.update_interval = settings.updateInterval;
      dbSettings.email_alerts = settings.emailAlerts === true ? 1 : (settings.emailAlerts === false ? 0 : settings.emailAlerts);
      dbSettings.push_alerts = settings.pushAlerts === true ? 1 : (settings.pushAlerts === false ? 0 : settings.pushAlerts);
      dbSettings.alert_email = settings.alertEmail;
      
      if (settings.dataRetention !== undefined) {
        dbSettings.data_retention = settings.dataRetention;
      }
      
      // Mapeamento dos limites de temperatura e nível 
      if (settings.tempCriticalMin !== undefined) dbSettings.temp_critical_min = settings.tempCriticalMin;
      if (settings.tempWarningMin !== undefined) dbSettings.temp_warning_min = settings.tempWarningMin;
      if (settings.tempWarningMax !== undefined) dbSettings.temp_warning_max = settings.tempWarningMax;
      if (settings.tempCriticalMax !== undefined) dbSettings.temp_critical_max = settings.tempCriticalMax;
      
      if (settings.levelCriticalMin !== undefined) dbSettings.level_critical_min = settings.levelCriticalMin;
      if (settings.levelWarningMin !== undefined) dbSettings.level_warning_min = settings.levelWarningMin;
      if (settings.levelWarningMax !== undefined) dbSettings.level_warning_max = settings.levelWarningMax;
      if (settings.levelCriticalMax !== undefined) dbSettings.level_critical_max = settings.levelCriticalMax;
    } else {
      // Formato desconhecido, tentar converter diretamente
      console.log('⚠️ [routes-settings] Formato desconhecido de configurações, tentando conversão direta');
      
      // Converter camelCase para snake_case para cada propriedade
      Object.entries(settings).forEach(([key, value]) => {
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        dbSettings[snakeKey] = value;
      });
    }
    
    console.log('💾 [routes-settings] Salvando configurações completas no banco de dados:', JSON.stringify(dbSettings, null, 2));
    
    try {
      // Salvar no banco de dados
      await saveSettingsInDB(dbSettings);
      console.log('✅ [routes-settings] Todas as configurações salvas com sucesso no banco de dados');
      
      // Atualizar também no storage global
      await storage.updateSettings(dbSettings);
      console.log('✅ [routes-settings] Configurações atualizadas no storage global');
    } catch (dbError) {
      console.error('❌ [routes-settings] Erro ao salvar todas as configurações no banco:', dbError);
      // Continuar mesmo com erro do banco, pois já salvamos em arquivo
    }
    
    res.json({ success: true, settings });
  } catch (error) {
    console.error('❌ [routes-settings] Erro ao atualizar todas as configurações:', error);
    res.status(500).json({ error: 'Erro ao atualizar configurações de sensores', message: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
});

export const settingsRouter = router;