import { setupDownloadRoutes } from "./download";
import type { Express } from "express";
import { createServer, type Server } from "http";
import cron from "node-cron";
import { zodResolver } from '@hookform/resolvers/zod';
import { storage } from "./storage";
import { syncThingspeakToDatabase } from './syncDatabase';
import { 
  fetchLatestReading, 
  fetchHistoricalReadings, 
  updateDeviceStatus,
  updatePumpStatus,
  updateHeaterStatus,
  updateOperationMode,
  updateTargetTemperature,
  updatePumpOnTimer,
  updatePumpOffTimer,
  updatePumpFlow,
  getCurrentDeviceStatus,
  getFeedbackChannelStatus,
  REFRESH_INTERVAL 
} from "./services/thingspeakService";
import { Reading } from "@shared/sqlite-schema";
import { backupService } from "./services/backupService";
import { insertSetpointsSchema, insertSettingsSchema } from "@shared/sqlite-schema";
import { z } from "zod";
import { emulatorService } from "./services/emulatorService";
import { aggregateReadingsByDateRange } from "./utils/dataAggregation";
import { registerVirtualSensorsRoutes } from "./routes-virtual-sensors";
import { automationService } from "./services/automationService";
import { syncScheduler } from "./services/syncSchedulerService";
import { fallbackService } from "./services/fallbackService";

// Declaração de tipo para variáveis globais
declare global {
  var dataCollectionTask: cron.ScheduledTask | null;
}

// Inicialização
global.dataCollectionTask = null;

// Função para configurar o intervalo de coleta de dados baseado nas configurações
const configureDataCollectionInterval = async () => {
  try {
    // Obter configurações atuais
    const settings = await storage.getSettings();
    
    // Converter minutos para segundos (para o cron)
    const intervalInMinutes = settings.updateInterval || 1;
    const intervalInSeconds = Math.max(Math.floor((intervalInMinutes * 60000) / 1000), 5);
    
    console.log(`🔄 Reconfigurando coleta de dados para cada ${intervalInMinutes} minuto(s) (${intervalInSeconds} segundos)`);
    
    // Para o agendamento anterior, se existir
    if (global.dataCollectionTask) {
      global.dataCollectionTask.stop();
      console.log('⏹️ Tarefa anterior de coleta de dados interrompida');
    }
    
    // Crie uma nova tarefa para coletar dados periodicamente
    global.dataCollectionTask = cron.schedule(`*/${intervalInSeconds} * * * * *`, async () => {
      try {
        // Função para obter e armazenar a última leitura
        console.log(`🔄 [${new Date().toLocaleTimeString()}] Iniciando ciclo de coleta de dados...`);
        
        // Obter dados mais recentes do ThingSpeak
        const reading = await fetchLatestReading();
        
        if (reading) {
          // Armazenar no banco de dados
          await storage.saveReading(reading);
          
          // Log de confirmação
          console.log(`✅ [${new Date().toLocaleTimeString()}] Inserindo nova leitura: Temp=${reading.temperature.toFixed(1)}°C, Nível=${(reading.level * 100).toFixed(2)}%, Bomba=${reading.pumpStatus ? 'ON' : 'OFF'}, Aquecedor=${reading.heaterStatus ? 'ON' : 'OFF'}`);
          console.log(`✅ [${new Date().toLocaleTimeString()}] Ciclo de coleta concluído - Dados armazenados no banco com sucesso`);
        } else {
          console.log(`❌ [${new Date().toLocaleTimeString()}] Falha ao obter dados do ThingSpeak`);
        }
      } catch (error) {
        console.error(`❌ [${new Date().toLocaleTimeString()}] Erro no ciclo de coleta de dados:`, error);
      }
    });
    
    console.log(`✅ Nova configuração aplicada: coleta a cada ${intervalInMinutes} minuto(s) | ${intervalInSeconds} segundos`);
    console.log(`📋 Status atual: Sistema configurado para sincronizar a cada ${intervalInMinutes} minuto(s)`);
    
    return {
      intervalInMinutes,
      intervalInSeconds
    };
  } catch (error) {
    console.error('❌ Erro ao configurar intervalo de coleta:', error);
    throw error;
  }
};

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Iniciar as tarefas de coleta com a configuração inicial - isso será chamado ao iniciar o servidor
  setTimeout(async () => {
    await configureDataCollectionInterval();
    console.log(`🚀 Sistema inicializado com configurações do banco de dados`);
  }, 1000); // Pequeno atraso para garantir que o banco esteja pronto

  // Agenda sincronização do backup a cada 30 minutos
  cron.schedule('*/30 * * * *', async () => {
    try {
      console.log('🔄 Starting scheduled backup sync...');
      await backupService.syncData();
      console.log('✅ Scheduled backup completed');
    } catch (error) {
      console.error('❌ Error in scheduled backup:', error);
    }
  });

  // Inicializar o serviço de backup
  try {
    await backupService.initialize();
    console.log('✅ Backup service initialized');
  } catch (error) {
    console.error('❌ Error initializing backup service:', error);
  }
  
  // Inicializar o serviço de automação para controle de ciclos
  try {
    automationService.start();
    console.log('✅ Automation service started - precise pump cycle control active');
  } catch (error) {
    console.error('❌ Error starting automation service:', error);
  }
  
  // Inicializar o serviço de sincronização automática com ThingSpeak
  try {
    await syncScheduler.initialize();
    console.log('✅ ThingSpeak sync scheduler initialized - automatic daily backups enabled');
  } catch (error) {
    console.error('❌ Error initializing ThingSpeak sync scheduler:', error);
  }

  // API Routes
  
  // Get latest readings
  app.get('/api/readings/latest', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 60;
      const readings = await storage.getLatestReadings(limit);
      const setpoints = await storage.getSetpoints();
      
      // Obter configuração e fontes do serviço de fallback
      const sensorSources = fallbackService.getSensorSources();
      const usesVirtualSources = Object.values(sensorSources).includes('virtual');
      
      // Se estiver usando fontes virtuais e tivermos leituras
      if (usesVirtualSources && readings.length > 0) {
        // Obter a leitura virtual atual
        const virtualReading = await fallbackService.getReading();
        
        // Modificar a leitura mais recente para incorporar valores virtuais
        const latestReading = readings[0];
        
        // Aplicar valores virtuais conforme configurado
        if (sensorSources.temperature === 'virtual') {
          latestReading.temperature = virtualReading.temperature;
        }
        if (sensorSources.level === 'virtual') {
          latestReading.level = virtualReading.level;
        }
        if (sensorSources.pumpStatus === 'virtual') {
          latestReading.pump_status = virtualReading.pump_status;
        }
        if (sensorSources.heaterStatus === 'virtual') {
          latestReading.heater_status = virtualReading.heater_status;
        }
      }
      
      res.json({
        readings,
        setpoints: {
          temp: {
            min: setpoints.tempMin,
            max: setpoints.tempMax
          },
          level: {
            min: setpoints.levelMin,
            max: setpoints.levelMax
          }
        },
        virtualSensors: usesVirtualSources,
        sensorSources: sensorSources
      });
    } catch (error) {
      console.error('Error fetching latest readings:', error);
      res.status(500).json({ error: 'Failed to fetch latest readings' });
    }
  });
  
  // Endpoint específico para verificar o status atual dos dispositivos
  app.get('/api/device/status', async (req, res) => {
    try {
      // Obter o estado atual em memória (atualizações mais recentes)
      const inMemoryStatus = getCurrentDeviceStatus();
      
      // Buscar também a leitura mais recente do banco de dados
      const latestReadings = await storage.getLatestReadings(1);
      
      // Obter configuração e fontes do serviço de fallback
      const sensorSources = fallbackService.getSensorSources();
      let virtualReading = null;
      
      // Verificar se algum sensor está usando fonte virtual
      const usesVirtualSources = Object.values(sensorSources).includes('virtual');
      
      // Se estiver usando fontes virtuais, obter a leitura virtual
      if (usesVirtualSources) {
        virtualReading = await fallbackService.getReading();
      }
      
      // Verificar se há dados no banco
      if (!latestReadings || latestReadings.length === 0) {
        // Se não há dados no banco, retornar apenas o status em memória com aviso
        console.log('Sem leituras no banco, usando apenas o status em memória:', inMemoryStatus);
        return res.json({
          timestamp: inMemoryStatus.lastUpdate,
          temperature: virtualReading ? virtualReading.temperature : 0,
          level: virtualReading ? virtualReading.level : 0,
          pumpStatus: inMemoryStatus.pumpStatus,
          heaterStatus: inMemoryStatus.heaterStatus,
          source: 'memory',
          pendingSync: true, // Indica que os dados ainda não foram sincronizados com ThingSpeak
          memoryState: inMemoryStatus,
          databaseState: null,
          virtualSensors: usesVirtualSources,
          sensorSources: sensorSources
        });
      }
      
      // Se temos dados do banco, mostrar ambas as fontes
      const latest = latestReadings[0];
      console.log('Detalhes da última leitura do banco:', JSON.stringify(latest));
      console.log('Status atual em memória:', JSON.stringify(inMemoryStatus));
      
      // Verificar se os estados são diferentes entre a memória e o banco de dados
      const memoryPumpStatus = inMemoryStatus.pumpStatus;
      const memoryHeaterStatus = inMemoryStatus.heaterStatus;
      const dbPumpStatus = latest.pumpStatus;
      const dbHeaterStatus = latest.heaterStatus;
      
      // Se os estados forem diferentes, considera que há sincronização pendente
      const pendingSync = (memoryPumpStatus !== dbPumpStatus) || (memoryHeaterStatus !== dbHeaterStatus);
      
      // Preferimos o valor do banco se ele for mais recente que a memória (indicando que o ThingSpeak já confirmou)
      // Caso contrário, informamos ambos os valores e deixamos o cliente decidir o que exibir
      const databaseState = {
        timestamp: latest.timestamp,
        pumpStatus: latest.pumpStatus,
        heaterStatus: latest.heaterStatus
      };
      
      const memoryState = {
        timestamp: inMemoryStatus.lastUpdate,
        pumpStatus: inMemoryStatus.pumpStatus,
        heaterStatus: inMemoryStatus.heaterStatus,
        targetTemp: inMemoryStatus.targetTemp,
        operationMode: inMemoryStatus.operationMode,
        pumpOnTimer: inMemoryStatus.pumpOnTimer,
        pumpOffTimer: inMemoryStatus.pumpOffTimer,
        pumpFlow: inMemoryStatus.pumpFlow
      };
      
      // Determinar os valores finais com base nas fontes configuradas
      let finalTemperature = latest.temperature;
      let finalLevel = latest.level;
      let finalPumpStatus = latest.pumpStatus;
      let finalHeaterStatus = latest.heaterStatus;
      
      // Substituir por dados virtuais se configurado e disponível
      if (virtualReading) {
        if (sensorSources.temperature === 'virtual') {
          finalTemperature = virtualReading.temperature;
        }
        if (sensorSources.level === 'virtual') {
          finalLevel = virtualReading.level;
        }
        if (sensorSources.pumpStatus === 'virtual') {
          finalPumpStatus = virtualReading.pump_status === 1;
        }
        if (sensorSources.heaterStatus === 'virtual') {
          finalHeaterStatus = virtualReading.heater_status === 1;
        }
      }
      
      // Transparentemente enviar ambos os estados
      res.json({
        timestamp: latest.timestamp,
        temperature: finalTemperature,
        level: finalLevel,
        pumpStatus: finalPumpStatus,
        heaterStatus: finalHeaterStatus,
        pumpFlow: inMemoryStatus.pumpFlow || 50, // Vazão da bomba (0-100%)
        pendingSync: pendingSync, // Indicar se há uma atualização pendente
        source: usesVirtualSources ? 'mixed' : 'database', // Fonte dos dados
        memoryState: memoryState, // Estado em memória para a interface usar se quiser
        databaseState: databaseState, // Estado do banco (oficial)
        virtualSensors: usesVirtualSources,
        sensorSources: sensorSources
      });
    } catch (error) {
      console.error('Error fetching device status:', error);
      res.status(500).json({ error: 'Failed to fetch device status' });
    }
  });
  
  // Endpoint para consultar o status do Canal 2 (feedback)
  app.get('/api/device/feedback-status', async (req, res) => {
    try {
      // Obter o estado do canal de feedback do ThingSpeak (Canal 2)
      const feedbackStatus = await getFeedbackChannelStatus();
      res.json(feedbackStatus);
    } catch (error) {
      console.error('Error fetching feedback status:', error);
      res.status(500).json({ 
        error: 'Failed to fetch feedback status',
        message: 'Não foi possível obter o status de feedback do sistema físico. Utilize o status principal.'
      });
    }
  });

  // Get readings by date range from local database
  app.get('/api/readings/history', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Start and end dates are required' });
      }
      
      console.log(`Fetching readings from ${startDate} to ${endDate} from local database...`);
      
      // Limitar o número máximo de leituras retornadas para evitar sobrecarga
      const MAX_READINGS = 1000;
      
      // A função de agregação já está importada no topo do arquivo
      
      // Calcular a diferença em dias para diagnóstico
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
      
      console.log(`SQL Query: Buscando leituras entre ${startDate} e ${endDate} (max: ${MAX_READINGS})`);
      console.log(`Data inicial: ${start.toLocaleDateString()}, Data final ajustada: ${new Date(end.getTime() + 86400000).toLocaleDateString()}`);
      
      // Agora tentar buscar os dados do banco local
      let readings: Reading[] = [];
      try {
        readings = await storage.getReadingsByDateRange(startDate as string, endDate as string, MAX_READINGS);
        console.log(`Found ${readings.length} readings in the local database.`);
      } catch (dbError) {
        console.error("Erro ao buscar dados do banco:", dbError);
        readings = [];
      }
      
      // Se mesmo após a importação ainda não temos dados, usar o ThingSpeak diretamente
      if (readings.length === 0) {
        console.log('Nenhum dado encontrado no banco após importação. Buscando do ThingSpeak diretamente...');
        
        try {
          // Buscar diretamente do ThingSpeak
          console.log(`Fetching ${diffDays} days of data directly from ThingSpeak with timeout...`);
          const thingspeakReadings = await fetchHistoricalReadings(diffDays);
          
          if (thingspeakReadings && thingspeakReadings.length > 0) {
            console.log(`Obtidas ${thingspeakReadings.length} leituras diretamente do ThingSpeak.`);
            
            // Converter para o formato esperado - adicionar IDs para compatibilidade
            readings = thingspeakReadings.map((r, index) => ({
              ...r,
              id: 10000 + index, // IDs temporários
              pumpStatus: r.pumpStatus || false,
              heaterStatus: r.heaterStatus || false,
              timestamp: r.timestamp || new Date()
            }));
          }
        } catch (thingspeakError) {
          console.error("Erro ao buscar diretamente do ThingSpeak:", thingspeakError);
        }
      }
      
      // Se ainda não temos dados, retorne erro
      if (!readings || readings.length === 0) {
        console.log('Nenhum dado disponível após todas as tentativas.');
        return res.status(404).json({ 
          error: 'No data found for the selected period', 
          message: 'Não há dados disponíveis para o período selecionado. Por favor, tente outro período.'
        });
      }
      
      // Aplicar a agregação com base no período selecionado
      const aggregatedReadings = aggregateReadingsByDateRange(readings, start, end);
      
      const setpoints = await storage.getSetpoints();
      const tempStats = storage.getTemperatureStats(readings); // Usamos os dados originais para estatísticas precisas
      const levelStats = storage.getLevelStats(readings);
      
      res.json({
        readings: aggregatedReadings, // Enviamos os dados agregados
        setpoints: {
          temp: {
            min: setpoints.tempMin,
            max: setpoints.tempMax
          },
          level: {
            min: setpoints.levelMin,
            max: setpoints.levelMax
          }
        },
        stats: {
          temperature: tempStats,
          level: levelStats
        }
      });
    } catch (error) {
      console.error('Error fetching readings history:', error);
      res.status(500).json({ error: 'Failed to fetch readings history' });
    }
  });
  
  // Get readings directly from ThingSpeak
  app.get('/api/thingspeak/history', async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      
      console.log(`Fetching ${days} days of data directly from ThingSpeak...`);
      const readings = await fetchHistoricalReadings(days);
      
      if (readings.length === 0) {
        return res.status(404).json({ error: 'No data found from ThingSpeak' });
      }
      
      // Save readings to database if they don't already exist
      for (const reading of readings) {
        try {
          await storage.saveReading(reading);
        } catch (err) {
          console.log('Reading might already exist in DB, skipping');
        }
      }
      
      const setpoints = await storage.getSetpoints();
      
      // Convert the readings to the format expected by the stats functions
      // This is a temporary fix for the type error
      const readingsWithId = readings.map(r => ({
        ...r,
        id: 0, // Temporary ID for stats calculation only
        pumpStatus: r.pumpStatus || false,
        heaterStatus: r.heaterStatus || false,
        timestamp: r.timestamp || new Date(),
      }));
      
      const tempStats = storage.getTemperatureStats(readingsWithId);
      const levelStats = storage.getLevelStats(readingsWithId);
      
      res.json({
        readings,
        setpoints: {
          temp: {
            min: setpoints.tempMin,
            max: setpoints.tempMax
          },
          level: {
            min: setpoints.levelMin,
            max: setpoints.levelMax
          }
        },
        stats: {
          temperature: tempStats,
          level: levelStats
        }
      });
    } catch (error) {
      console.error('Error fetching readings from ThingSpeak:', error);
      res.status(500).json({ error: 'Failed to fetch readings from ThingSpeak' });
    }
  });

  // Update setpoints
  app.post('/api/setpoints', async (req, res) => {
    try {
      const result = insertSetpointSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid setpoint data', details: result.error });
      }
      
      const updatedSetpoints = await storage.updateSetpoints(result.data);
      res.json(updatedSetpoints);
    } catch (error) {
      console.error('Error updating setpoints:', error);
      res.status(500).json({ error: 'Failed to update setpoints' });
    }
  });

  // Get settings
  app.get('/api/settings', async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error) {
      console.error('Error fetching settings:', error);
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  // A variável dataCollectionTask já foi declarada globalmente no início do arquivo
  
  // Referência ao configureDataCollectionInterval definido no início do arquivo

  // Configurar tarefa inicial de coleta de dados
  configureDataCollectionInterval();

  // Update settings
  app.post('/api/settings', async (req, res) => {
    try {
      console.log('📝 Recebendo requisição para atualizar configurações:', JSON.stringify(req.body, null, 2));
      
      // Pular validação de schema para as configurações enviadas pelo frontend
      console.log('⚠️ Pulando validação de schema para configurações no formato do frontend');
      
      // Fazer validação básica do formato
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ error: 'Invalid settings data', details: 'Body must be an object' });
      }
      
      // Permitir que o Storage faça a conversão para o formato necessário
      console.log('📝 Enviando dados diretamente para o storage:', JSON.stringify(req.body, null, 2));
      const updatedSettings = await storage.updateSettings(req.body);
      console.log('✅ Configurações atualizadas com sucesso no storage');
      
      // Reconfigura o intervalo de coleta de dados se o updateInterval foi alterado
      if (req.body.updateInterval !== undefined) {
        console.log('⏱️ Atualizando intervalo de coleta para:', req.body.updateInterval);
        const configuredInterval = await configureDataCollectionInterval();
        console.log(`📊 Intervalo de coleta atualizado para: ${configuredInterval} minuto(s)`);
        console.log(`🗄️ Dados serão armazenados no banco a cada ${configuredInterval} minuto(s)`);
        console.log(`⏱️ Próxima sincronização com ThingSpeak em aproximadamente ${configuredInterval} minuto(s)`);
      }
      
      console.log('📤 Respondendo com as configurações atualizadas');
      res.json(updatedSettings);
    } catch (error) {
      console.error('❌ Erro crítico ao atualizar configurações:', error);
      res.status(500).json({ error: 'Failed to update settings', message: error.message });
    }
  });
  
  // Get system uptime (first reading date)
  app.get('/api/system/uptime', async (req, res) => {
    try {
      const firstReading = await storage.getFirstReading();
      if (firstReading) {
        res.json({
          success: true,
          firstReadingDate: firstReading.timestamp.toISOString()
        });
      } else {
        // Caso não haja leituras, retornar a data atual
        res.json({
          success: false,
          firstReadingDate: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error fetching system uptime:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch system uptime',
        firstReadingDate: new Date().toISOString()
      });
    }
  });
  
  // Endpoint para forçar a sincronização entre o estado em memória e o banco de dados
  app.post('/api/system/force-sync', async (req, res) => {
    try {
      // Buscar a leitura mais recente no banco para pegar o estado oficial
      const latestReadings = await storage.getLatestReadings(1);
      
      if (!latestReadings || latestReadings.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'No readings found in database' 
        });
      }
      
      const latest = latestReadings[0];
      
      // Converter estados para boolean explicitamente para garantir o tipo correto
      const pumpState = Boolean(latest.pumpStatus);
      const heaterState = Boolean(latest.heaterStatus);
      
      // Obter uma cópia do estado em memória
      const inMemoryStatus = getCurrentDeviceStatus();
      
      // Salvar o estado anterior para debug
      const previousState = {
        pumpStatus: inMemoryStatus.pumpStatus,
        heaterStatus: inMemoryStatus.heaterStatus,
        lastUpdate: inMemoryStatus.lastUpdate
      };
      
      // Forçar a atualização do estado em memória de forma definitiva
      inMemoryStatus.pumpStatus = pumpState;
      inMemoryStatus.heaterStatus = heaterState;
      inMemoryStatus.lastUpdate = new Date();
      
      console.log('🔄 FORÇANDO SINCRONIZAÇÃO do estado em memória:', {
        antes: previousState,
        depois: {
          pumpStatus: pumpState,
          heaterStatus: heaterState,
          lastUpdate: new Date().toISOString()
        },
        banco: {
          pumpStatus: latest.pumpStatus,
          heaterStatus: latest.heaterStatus,
          timestamp: latest.timestamp
        }
      });
      
      // Retornar o estado atualizado
      res.json({
        success: true,
        message: 'Estado em memória sincronizado com o banco de dados',
        state: {
          pumpStatus: pumpState,
          heaterStatus: heaterState,
          timestamp: latest.timestamp
        }
      });
    } catch (error) {
      console.error('Error syncing memory state with database:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to sync memory state with database' 
      });
    }
  });

  // Control pump - otimizado para resposta rápida sem persistência de histórico
  app.post('/api/control/pump', async (req, res) => {
    try {
      const schema = z.object({
        status: z.boolean()
      });
      
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid pump control data' });
      }
      
      // Responder imediatamente para fornecer feedback rápido na interface
      res.json({ success: true, pumpStatus: result.data.status });
      
      // Processar atualização em segundo plano sem bloquear a resposta
      try {
        // Update ThingSpeak - usando o método individual da bomba
        const updateResult = await updatePumpStatus(result.data.status);
        
        if (updateResult) {
          console.log('✅ Bomba atualizada com sucesso no ThingSpeak:', result.data.status ? 'LIGADA' : 'DESLIGADA');
        } else {
          console.log('⚠️ Bomba enviada para ThingSpeak, aguardando confirmação:', result.data.status ? 'LIGADA' : 'DESLIGADA');
        }
      } catch (bgError) {
        console.error('❌ Erro em segundo plano ao atualizar bomba:', bgError);
      }
    } catch (error) {
      console.error('Error controlling pump:', error);
      res.status(500).json({ error: 'Failed to control pump' });
    }
  });

  // Control heater - otimizado para resposta rápida sem persistência de histórico
  app.post('/api/control/heater', async (req, res) => {
    try {
      const schema = z.object({
        status: z.boolean()
      });
      
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid heater control data' });
      }
      
      // Responder imediatamente para fornecer feedback rápido na interface
      res.json({ success: true, heaterStatus: result.data.status });
      
      // Processar atualização em segundo plano sem bloquear a resposta
      try {
        // Update ThingSpeak - usando o método individual do aquecedor
        const updateResult = await updateHeaterStatus(result.data.status);
        
        if (updateResult) {
          console.log('✅ Aquecedor atualizado com sucesso no ThingSpeak:', result.data.status ? 'LIGADO' : 'DESLIGADO');
        } else {
          console.log('⚠️ Aquecedor enviado para ThingSpeak, aguardando confirmação:', result.data.status ? 'LIGADO' : 'DESLIGADO');
        }
      } catch (bgError) {
        console.error('❌ Erro em segundo plano ao atualizar aquecedor:', bgError);
      }
    } catch (error) {
      console.error('Error controlling heater:', error);
      res.status(500).json({ error: 'Failed to control heater' });
    }
  });
  
  // Control operation mode - otimizado para resposta rápida sem persistência de histórico
  app.post('/api/control/operation-mode', async (req, res) => {
    try {
      const schema = z.object({
        isAutomatic: z.boolean()
      });
      
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid operation mode data' });
      }
      
      // Responder imediatamente para fornecer feedback rápido na interface
      res.json({ success: true, operationMode: result.data.isAutomatic });
      
      // Processar atualização em segundo plano sem bloquear a resposta
      try {
        // Update ThingSpeak - usando o método para alterar modo de operação
        const updateResult = await updateOperationMode(result.data.isAutomatic);
        
        // Atualizar o serviço de automação para refletir o novo modo
        automationService.setAutoMode(result.data.isAutomatic);
        
        if (updateResult) {
          console.log('✅ Modo de operação atualizado com sucesso no ThingSpeak:', result.data.isAutomatic ? 'AUTOMÁTICO' : 'MANUAL');
        } else {
          console.log('⚠️ Modo de operação enviado para ThingSpeak, aguardando confirmação:', result.data.isAutomatic ? 'AUTOMÁTICO' : 'MANUAL');
        }
      } catch (bgError) {
        console.error('❌ Erro em segundo plano ao atualizar modo de operação:', bgError);
      }
    } catch (error) {
      console.error('Error controlling operation mode:', error);
      res.status(500).json({ error: 'Failed to control operation mode' });
    }
  });

  // Control pump flow - otimizado para resposta rápida sem persistência de histórico
  app.post('/api/control/pump-flow', async (req, res) => {
    try {
      const schema = z.object({
        flowPercent: z.number().min(0).max(100)
      });
      
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ error: 'Valor de vazão inválido' });
      }
      
      // Responder imediatamente para fornecer feedback rápido na interface
      res.json({ success: true, pumpFlow: result.data.flowPercent });
      
      // Processar atualização em segundo plano sem bloquear a resposta
      try {
        // Update ThingSpeak
        const updateResult = await updatePumpFlow(result.data.flowPercent);
        
        if (updateResult) {
          console.log(`✅ Vazão da bomba atualizada com sucesso no ThingSpeak: ${result.data.flowPercent}%`);
        } else {
          console.log(`⚠️ Vazão da bomba enviada para ThingSpeak, aguardando confirmação: ${result.data.flowPercent}%`);
        }
      } catch (bgError) {
        console.error('❌ Erro em segundo plano ao atualizar vazão da bomba:', bgError);
      }
    } catch (error) {
      console.error('Error controlling pump flow:', error);
      res.status(500).json({ error: 'Falha ao controlar vazão da bomba' });
    }
  });

  // Control target temperature - otimizado para resposta rápida sem persistência de histórico
  app.post('/api/control/targettemp', async (req, res) => {
    try {
      const schema = z.object({
        targetTemp: z.number().min(20).max(35)
      });
      
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid target temperature data' });
      }
      
      // Responder imediatamente para fornecer feedback rápido na interface
      res.json({ success: true, targetTemp: result.data.targetTemp });
      
      // Processar atualização em segundo plano sem bloquear a resposta
      try {
        // Update ThingSpeak - usando o método para temperatura alvo
        const updateResult = await updateTargetTemperature(result.data.targetTemp);
        
        if (updateResult) {
          console.log(`✅ Temperatura alvo atualizada com sucesso no ThingSpeak: ${result.data.targetTemp}°C`);
        } else {
          console.log(`⚠️ Temperatura alvo enviada para ThingSpeak, aguardando confirmação: ${result.data.targetTemp}°C`);
        }
      } catch (bgError) {
        console.error('❌ Erro em segundo plano ao atualizar temperatura alvo:', bgError);
      }
    } catch (error) {
      console.error('Error controlling target temperature:', error);
      res.status(500).json({ error: 'Failed to control target temperature' });
    }
  });

  // Control pump on timer - otimizado para resposta rápida sem persistência de histórico
  app.post('/api/control/pumpontimer', async (req, res) => {
    try {
      const schema = z.object({
        pumpOnTimer: z.number().min(0).max(3600)
      });
      
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid pump on timer data' });
      }
      
      // Responder imediatamente para fornecer feedback rápido na interface
      res.json({ success: true, pumpOnTimer: result.data.pumpOnTimer });
      
      // Processar atualização em segundo plano sem bloquear a resposta
      try {
        // Update ThingSpeak - usando o método para timer de bomba ligada
        const updateResult = await updatePumpOnTimer(result.data.pumpOnTimer);
        
        if (updateResult) {
          console.log(`✅ Timer de bomba ligada atualizado com sucesso no ThingSpeak: ${result.data.pumpOnTimer} segundos`);
        } else {
          console.log(`⚠️ Timer de bomba ligada enviado para ThingSpeak, aguardando confirmação: ${result.data.pumpOnTimer} segundos`);
        }
      } catch (bgError) {
        console.error('❌ Erro em segundo plano ao atualizar timer de bomba ligada:', bgError);
      }
    } catch (error) {
      console.error('Error controlling pump on timer:', error);
      res.status(500).json({ error: 'Failed to control pump on timer' });
    }
  });

  // Control pump off timer - otimizado para resposta rápida sem persistência de histórico
  app.post('/api/control/pumpofftimer', async (req, res) => {
    try {
      const schema = z.object({
        pumpOffTimer: z.number().min(0).max(3600)
      });
      
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid pump off timer data' });
      }
      
      // Responder imediatamente para fornecer feedback rápido na interface
      res.json({ success: true, pumpOffTimer: result.data.pumpOffTimer });
      
      // Processar atualização em segundo plano sem bloquear a resposta
      try {
        // Update ThingSpeak - usando o método para timer de bomba desligada
        const updateResult = await updatePumpOffTimer(result.data.pumpOffTimer);
        
        if (updateResult) {
          console.log(`✅ Timer de bomba desligada atualizado com sucesso no ThingSpeak: ${result.data.pumpOffTimer} segundos`);
        } else {
          console.log(`⚠️ Timer de bomba desligada enviado para ThingSpeak, aguardando confirmação: ${result.data.pumpOffTimer} segundos`);
        }
      } catch (bgError) {
        console.error('❌ Erro em segundo plano ao atualizar timer de bomba desligada:', bgError);
      }
    } catch (error) {
      console.error('Error controlling pump off timer:', error);
      res.status(500).json({ error: 'Failed to control pump off timer' });
    }
  });

  // Rota para obter o estado atual do ciclo automático da bomba
  app.get('/api/automation/pump-cycle', (req, res) => {
    try {
      // O estado já inclui a chave success, então não precisamos adicioná-la novamente
      const cycleState = automationService.getCycleState();
      res.json(cycleState);
    } catch (error) {
      console.error('Error fetching pump cycle state:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get pump cycle state',
        active: false, 
        pumpStatus: false,
        timeRemaining: 0,
        startTime: 0,
        currentTimerValue: 0,
        currentTimerTotal: 0
      });
    }
  });
  
  // Rota para forçar o início de um novo ciclo (usado para depuração)
  app.post('/api/automation/force-cycle', (req, res) => {
    try {
      console.log('💪 Requisição para forçar início de um novo ciclo recebida');
      automationService.forceStartCycle();
      const cycleState = automationService.getCycleState();
      res.json({
        success: true,
        message: 'Ciclo iniciado manualmente',
        state: cycleState
      });
    } catch (error) {
      console.error('Error forcing cycle start:', error);
      res.status(500).json({ success: false, error: 'Failed to force cycle start' });
    }
  });
  
  // Rota para sincronização manual do backup
  app.post('/api/backup/sync', async (req, res) => {
    try {
      // Extrair parâmetros de configuração da requisição
      const { days = 1, batchSize = 100 } = req.body;
      
      // Validar parâmetros
      const syncDays = Math.min(Math.max(1, parseInt(days.toString()) || 1), 7);
      const syncBatchSize = Math.min(Math.max(50, parseInt(batchSize.toString()) || 100), 250);
      
      console.log(`🔄 Manual backup sync requested: ${syncDays} days with batch size ${syncBatchSize}`);
      
      // Chamar o serviço de backup com os parâmetros configurados
      await backupService.syncData(syncDays, syncBatchSize);
      
      res.json({ 
        success: true, 
        message: `Sincronização de ${syncDays} ${syncDays > 1 ? 'dias' : 'dia'} realizada com sucesso`,
        config: { days: syncDays, batchSize: syncBatchSize }
      });
    } catch (error) {
      console.error('Error during manual backup sync:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Falha na sincronização do backup',
        details: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  });

  // Rota para obter informações sobre o backup
  app.get('/api/backup/status', async (req, res) => {
    try {
      // Inicializar o serviço de backup se necessário
      if (!backupService.isInitialized) {
        await backupService.initialize();
      }
      
      // Obter o último ID sincronizado
      const lastBackupInfo = await backupService.getLastBackupInfo();
      
      // Obter informações de sincronização do ThingSpeak
      const syncInfo = syncScheduler.getStatus();
      
      res.json({ 
        success: true,
        status: 'online',
        message: 'Serviço de backup operacional',
        lastSyncId: lastBackupInfo.lastId,
        lastSyncDate: syncInfo.lastSyncTime || lastBackupInfo.lastDate,
        totalBackupRecords: lastBackupInfo.totalRecords,
        syncInProgress: syncInfo.syncInProgress,
        lastThingSpeakSync: syncInfo.formattedLastSyncTime || 'Nunca sincronizado',
        dailyBackupConfigured: syncInfo.dailyBackupConfigured,
        initialSyncComplete: syncInfo.initialSyncComplete
      });
    } catch (error) {
      console.error('Error checking backup status:', error);
      res.status(500).json({ 
        success: false, 
        status: 'offline',
        error: 'Falha ao verificar status do backup',
        details: error instanceof Error ? error.message : 'Erro desconhecido' 
      });
    }
  });
  
  // Rota para obter estatísticas do backup
  app.get('/api/backup/stats', async (req, res) => {
    try {
      if (!backupService.isInitialized) {
        await backupService.initialize();
      }
      
      const stats = await backupService.getBackupStats();
      res.json({ 
        success: true,
        stats
      });
    } catch (error) {
      console.error('Error fetching backup stats:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Falha ao obter estatísticas do backup',
        details: error instanceof Error ? error.message : 'Erro desconhecido' 
      });
    }
  });
  
  // Rota para obter informações de uptime do sistema
  app.get('/api/system/uptime', async (req, res) => {
    try {
      // Buscar a primeira (mais antiga) leitura no banco
      const readings = await storage.getFirstReading();
      const firstTimestamp = readings?.timestamp || new Date().toISOString();
      
      res.json({ 
        success: true, 
        firstReadingDate: firstTimestamp
      });
    } catch (error) {
      console.error('Erro ao buscar informações de uptime:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Erro ao buscar informações de uptime',
        firstReadingDate: new Date().toISOString()
      });
    }
  });

  // Rota para importar dados históricos do ThingSpeak para o banco de dados local
  app.post('/api/sync/thingspeak-to-db', async (req, res) => {
    try {
      const days = parseInt(req.query.days as string || req.body.days as string) || 7;
      
      console.log(`🔄 Importando ${days} dias de dados do ThingSpeak para o banco de dados local...`);
      
      // Usa o serviço de agendamento para realizar a sincronização
      // O serviço já lida com processamento em background
      setTimeout(async () => {
        try {
          const count = await syncScheduler.syncNow(days);
          console.log(`✅ Importação em background finalizada: ${count} registros importados.`);
        } catch (syncError) {
          console.error('❌ Erro durante importação em background:', syncError);
        }
      }, 100);
      
      // Retorna imediatamente para evitar timeout do cliente
      res.json({ 
        success: true, 
        message: `Importação de ${days} dias de dados iniciada em background. Os dados estarão disponíveis em breve.`,
        count: 0,
        background: true
      });
    } catch (error) {
      console.error('Error importing data from ThingSpeak to local database:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Falha ao importar dados do ThingSpeak',
        details: error instanceof Error ? error.message : 'Erro desconhecido' 
      });
    }
  });
  
  // Rota para verificar o status do agendador de sincronização
  app.get('/api/sync/status', async (req, res) => {
    try {
      // Obter status atualizado do serviço de sincronização
      const syncStatus = syncScheduler.getStatus();
      
      // Adicionar informações do banco de dados
      try {
        // Obter última leitura
        const latestReadings = await storage.getLatestReadings(1);
        if (latestReadings && latestReadings.length > 0) {
          syncStatus.latestReadingId = latestReadings[0].id;
          syncStatus.latestReadingTime = latestReadings[0].timestamp;
        }
        
        // Obter aproximação da contagem total (usando a última leitura como indicador)
        if (latestReadings && latestReadings.length > 0 && latestReadings[0].id) {
          syncStatus.totalRecords = latestReadings[0].id;
        } else {
          syncStatus.totalRecords = 0;
        }
      } catch (dbError) {
        console.error('Erro ao consultar banco de dados para status:', dbError);
      }
      
      res.json({ 
        success: true, 
        status: syncStatus
      });
    } catch (error) {
      console.error('Error getting sync scheduler status:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Falha ao obter status do agendador',
        details: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  });

  // Rotas do emulador
  // Obter status do emulador
  app.get('/api/emulator/status', (req, res) => {
    try {
      const status = emulatorService.getStatus();
      res.json(status);
    } catch (error) {
      console.error('Error getting emulator status:', error);
      res.status(500).json({ 
        error: 'Failed to get emulator status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Obter configuração do emulador
  app.get('/api/emulator/config', (req, res) => {
    try {
      const config = emulatorService.getConfig();
      res.json(config);
    } catch (error) {
      console.error('Error getting emulator config:', error);
      res.status(500).json({ 
        error: 'Failed to get emulator config',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Iniciar emulador
  app.post('/api/emulator/start', (req, res) => {
    try {
      emulatorService.start(req.body);
      res.json({ success: true, message: 'Emulator started' });
    } catch (error) {
      console.error('Error starting emulator:', error);
      res.status(500).json({ 
        error: 'Failed to start emulator',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Parar emulador
  app.post('/api/emulator/stop', (req, res) => {
    try {
      emulatorService.stop();
      res.json({ success: true, message: 'Emulator stopped' });
    } catch (error) {
      console.error('Error stopping emulator:', error);
      res.status(500).json({ 
        error: 'Failed to stop emulator',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Atualizar configuração do emulador
  app.post('/api/emulator/config', (req, res) => {
    try {
      const updatedConfig = emulatorService.updateConfig(req.body);
      res.json({ success: true, config: updatedConfig });
    } catch (error) {
      console.error('Error updating emulator config:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to update emulator config',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Obter cenários disponíveis
  app.get('/api/emulator/scenarios', (req, res) => {
    try {
      const scenarios = emulatorService.getAvailableScenarios();
      res.json({ scenarios });
    } catch (error) {
      console.error('Error getting available scenarios:', error);
      res.status(500).json({ 
        error: 'Failed to get available scenarios',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Registrar rotas para sensores virtuais
  registerVirtualSensorsRoutes(app);

  // Carregar cenário
  app.post('/api/emulator/scenario/:name', (req, res) => {
    try {
      const { name } = req.params;
      const success = emulatorService.loadScenario(name);
      
      if (success) {
        res.json({ success: true, message: `Scenario '${name}' loaded successfully` });
      } else {
        res.status(404).json({ success: false, message: `Scenario '${name}' not found` });
      }
    } catch (error) {
      console.error('Error loading scenario:', error);
      res.status(500).json({ 
        error: 'Failed to load scenario',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Controlar bomba
  app.post('/api/emulator/pump', (req, res) => {
    try {
      const { status } = req.body;
      
      if (typeof status !== 'boolean') {
        return res.status(400).json({ error: 'Status must be a boolean' });
      }
      
      emulatorService.setPumpStatus(status);
      res.json({ success: true, pumpStatus: status });
    } catch (error) {
      console.error('Error controlling pump:', error);
      res.status(500).json({ 
        error: 'Failed to control pump',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Controlar aquecedor
  app.post('/api/emulator/heater', (req, res) => {
    try {
      const { status } = req.body;
      
      if (typeof status !== 'boolean') {
        return res.status(400).json({ error: 'Status must be a boolean' });
      }
      
      emulatorService.setHeaterStatus(status);
      res.json({ success: true, heaterStatus: status });
    } catch (error) {
      console.error('Error controlling heater:', error);
      res.status(500).json({ 
        error: 'Failed to control heater',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Endpoint para controlar a bomba (field3)
  app.post('/api/device/pump', async (req, res) => {
    try {
      const { status } = req.body;
      
      // Validar se o status é um boolean
      if (typeof status !== 'boolean') {
        return res.status(400).json({ 
          error: 'Invalid pump status', 
          message: 'Status deve ser um valor booleano (true/false)' 
        });
      }
      
      // Atualizar o status da bomba no ThingSpeak
      const success = await updatePumpStatus(status);
      
      if (success) {
        // Registrar na leitura mais recente também
        const latestReadings = await storage.getLatestReadings(1);
        if (latestReadings && latestReadings.length > 0) {
          const latest = latestReadings[0];
          
          // Nova leitura com status atualizado da bomba
          const updatedReading = {
            ...latest,
            pumpStatus: status,
            timestamp: new Date()
          };
          
          // Salvar no banco
          await storage.saveReading(updatedReading);
        }
        
        // Resposta de sucesso
        res.json({
          success: true,
          message: `Bomba ${status ? 'ligada' : 'desligada'} com sucesso`,
          newStatus: status
        });
      } else {
        throw new Error('Failed to update pump status on ThingSpeak');
      }
    } catch (error) {
      console.error('Error updating pump status:', error);
      res.status(500).json({ 
        error: 'Failed to update pump status',
        message: 'Erro ao atualizar o status da bomba. Tente novamente.'
      });
    }
  });
  
  // Endpoint para controlar o aquecedor (field4)
  app.post('/api/device/heater', async (req, res) => {
    try {
      const { status } = req.body;
      
      // Validar se o status é um boolean
      if (typeof status !== 'boolean') {
        return res.status(400).json({ 
          error: 'Invalid heater status', 
          message: 'Status deve ser um valor booleano (true/false)' 
        });
      }
      
      // Atualizar o status do aquecedor no ThingSpeak
      const success = await updateHeaterStatus(status);
      
      if (success) {
        // Registrar na leitura mais recente também
        const latestReadings = await storage.getLatestReadings(1);
        if (latestReadings && latestReadings.length > 0) {
          const latest = latestReadings[0];
          
          // Nova leitura com status atualizado do aquecedor
          const updatedReading = {
            ...latest,
            heaterStatus: status,
            timestamp: new Date()
          };
          
          // Salvar no banco
          await storage.saveReading(updatedReading);
        }
        
        // Resposta de sucesso
        res.json({
          success: true,
          message: `Aquecedor ${status ? 'ligado' : 'desligado'} com sucesso`,
          newStatus: status
        });
      } else {
        throw new Error('Failed to update heater status on ThingSpeak');
      }
    } catch (error) {
      console.error('Error updating heater status:', error);
      res.status(500).json({ 
        error: 'Failed to update heater status',
        message: 'Erro ao atualizar o status do aquecedor. Tente novamente.'
      });
    }
  });
  
  // Endpoint para controlar o modo de operação (field5)
  app.post('/api/device/mode', async (req, res) => {
    try {
      const { isAutomatic } = req.body;
      
      // Validar se isAutomatic é um boolean
      if (typeof isAutomatic !== 'boolean') {
        return res.status(400).json({ 
          error: 'Invalid operation mode', 
          message: 'Modo deve ser um valor booleano (true=automático/false=manual)' 
        });
      }
      
      // Atualização otimista no estado para feedback imediato na UI
      // Atualizamos a variável em memória primeiro, mesmo antes da confirmação do ThingSpeak
      const previousState = { ...getCurrentDeviceStatus() };
      
      // Atualizar o modo de operação
      console.log(`Alterando modo de operação para: ${isAutomatic ? 'Automático' : 'Manual'}`);
      const success = await updateOperationMode(isAutomatic);
      
      if (success) {
        res.json({
          success: true,
          message: `Modo de operação alterado para ${isAutomatic ? 'automático' : 'manual'} com sucesso`,
          newMode: isAutomatic
        });
      } else {
        // Mesmo se falhar no ThingSpeak, mantemos a interface atualizada com o status desejado
        // para feedback imediato. A sincronização automática tentará novamente depois.
        console.warn('⚠️ Falha na comunicação com ThingSpeak, mas o estado local foi atualizado');
        res.json({
          success: true,
          message: `Modo de operação alterado para ${isAutomatic ? 'automático' : 'manual'} localmente. Sincronizando...`,
          newMode: isAutomatic,
          syncing: true
        });
      }
    } catch (error) {
      console.error('Error updating operation mode:', error);
      res.status(500).json({ 
        error: 'Failed to update operation mode',
        message: 'Erro ao atualizar o modo de operação. Tente novamente.'
      });
    }
  });
  
  // Endpoint para ajustar a temperatura alvo (field6)
  app.post('/api/device/target-temperature', async (req, res) => {
    try {
      const { temperature } = req.body;
      
      // Validar se a temperatura é um número entre 18 e 32
      if (typeof temperature !== 'number' || temperature < 18 || temperature > 32) {
        return res.status(400).json({ 
          error: 'Invalid target temperature', 
          message: 'A temperatura deve ser um número entre 18°C e 32°C' 
        });
      }
      
      // Atualizar a temperatura alvo
      const success = await updateTargetTemperature(temperature);
      
      if (success) {
        res.json({
          success: true,
          message: `Temperatura alvo definida para ${temperature}°C com sucesso`,
          newTargetTemperature: temperature
        });
      } else {
        throw new Error('Failed to update target temperature on ThingSpeak');
      }
    } catch (error) {
      console.error('Error updating target temperature:', error);
      res.status(500).json({ 
        error: 'Failed to update target temperature',
        message: 'Erro ao atualizar a temperatura alvo. Tente novamente.'
      });
    }
  });
  
  // Endpoint para ajustar o timer de bomba ligada (field7)
  app.post('/api/device/pump-on-timer', async (req, res) => {
    try {
      const { seconds } = req.body;
      
      // Validar se seconds é um número positivo e razoável
      if (typeof seconds !== 'number' || seconds < 0 || seconds > 3600) {
        return res.status(400).json({ 
          error: 'Invalid pump on timer', 
          message: 'O timer deve ser um número entre 0 e 3600 segundos (1 hora)' 
        });
      }
      
      // Atualizar o timer
      const success = await updatePumpOnTimer(seconds);
      
      if (success) {
        res.json({
          success: true,
          message: `Timer de bomba ligada definido para ${seconds} segundos com sucesso`,
          newTimer: seconds
        });
      } else {
        throw new Error('Failed to update pump on timer on ThingSpeak');
      }
    } catch (error) {
      console.error('Error updating pump on timer:', error);
      res.status(500).json({ 
        error: 'Failed to update pump on timer',
        message: 'Erro ao atualizar o timer de bomba ligada. Tente novamente.'
      });
    }
  });
  
  // Endpoint para ajustar o timer de bomba desligada (field8)
  app.post('/api/device/pump-off-timer', async (req, res) => {
    try {
      const { seconds } = req.body;
      
      // Validar se seconds é um número positivo e razoável
      if (typeof seconds !== 'number' || seconds < 0 || seconds > 3600) {
        return res.status(400).json({ 
          error: 'Invalid pump off timer', 
          message: 'O timer deve ser um número entre 0 e 3600 segundos (1 hora)' 
        });
      }
      
      // Atualizar o timer
      const success = await updatePumpOffTimer(seconds);
      
      if (success) {
        res.json({
          success: true,
          message: `Timer de bomba desligada definido para ${seconds} segundos com sucesso`,
          newTimer: seconds
        });
      } else {
        throw new Error('Failed to update pump off timer on ThingSpeak');
      }
    } catch (error) {
      console.error('Error updating pump off timer:', error);
      res.status(500).json({ 
        error: 'Failed to update pump off timer',
        message: 'Erro ao atualizar o timer de bomba desligada. Tente novamente.'
      });
    }
  });

  // Endpoint para ajustar ambos os timers de uma só vez (field7 e field8)
  app.post('/api/device/timer', async (req, res) => {
    try {
      const { onSeconds, offSeconds } = req.body;
      
      // Validar se são números positivos e razoáveis
      if (typeof onSeconds !== 'number' || onSeconds < 0 || onSeconds > 3600) {
        return res.status(400).json({ 
          error: 'Invalid pump on timer', 
          message: 'O timer ON deve ser um número entre 0 e 3600 segundos (1 hora)' 
        });
      }
      
      if (typeof offSeconds !== 'number' || offSeconds < 0 || offSeconds > 3600) {
        return res.status(400).json({ 
          error: 'Invalid pump off timer', 
          message: 'O timer OFF deve ser um número entre 0 e 3600 segundos (1 hora)' 
        });
      }
      
      // Atualizar ambos os timers
      console.log(`Atualizando timers: ON=${onSeconds}s, OFF=${offSeconds}s`);
      
      // Função para atualizar ambos os valores de uma vez
      const updateBothTimers = async () => {
        const onSuccess = await updatePumpOnTimer(onSeconds);
        const offSuccess = await updatePumpOffTimer(offSeconds);
        return { onSuccess, offSuccess };
      };
      
      const { onSuccess, offSuccess } = await updateBothTimers();
      
      if (onSuccess && offSuccess) {
        res.json({
          success: true,
          message: `Timers atualizados com sucesso: ON=${onSeconds}s, OFF=${offSeconds}s`,
          onTimer: onSeconds,
          offTimer: offSeconds
        });
      } else if (onSuccess) {
        res.json({
          success: true,
          message: `Timer ON atualizado com sucesso para ${onSeconds}s. Falha ao atualizar timer OFF.`,
          onTimer: onSeconds,
          warning: "Timer OFF não foi atualizado."
        });
      } else if (offSuccess) {
        res.json({
          success: true,
          message: `Timer OFF atualizado com sucesso para ${offSeconds}s. Falha ao atualizar timer ON.`,
          offTimer: offSeconds,
          warning: "Timer ON não foi atualizado."
        });
      } else {
        throw new Error('Failed to update pump timers on ThingSpeak');
      }
    } catch (error) {
      console.error('Error updating pump timers:', error);
      res.status(500).json({ 
        error: 'Failed to update pump timers',
        message: 'Erro ao atualizar os timers da bomba. Tente novamente.'
      });
    }
  });

  setupDownloadRoutes(app);
  return httpServer;
}
