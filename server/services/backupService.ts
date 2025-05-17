import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { Reading } from '@shared/schema';

// Caminho correto para os arquivos de banco de dados
const MAIN_DB_PATH = path.resolve(process.cwd(), 'aquaponia.db');
const BACKUP_DB_PATH = path.resolve(process.cwd(), 'aquaponia_backup.db');

// Interfaces para uso do serviço
interface LastBackupInfo {
  lastId: number;
  lastDate: string;
  totalRecords: number;
}

interface BackupStats {
  dailyStats: {
    date: string;
    minTemperature: number;
    maxTemperature: number;
    avgTemperature: number;
    readingCount: number;
  }[];
  alertCount: number;
  criticalAlertsCount: number;
  syncHistory: {
    success: boolean;
    timestamp: string;
    recordCount: number;
  }[];
}

/**
 * Serviço para sincronização entre o banco principal e o banco de backup
 */
export class BackupService {
  private mainDb: Database<sqlite3.Database, sqlite3.Statement> | null = null;
  private backupDb: Database<sqlite3.Database, sqlite3.Statement> | null = null;
  public isInitialized = false;
  private isSyncing = false;

  /**
   * Inicializa a conexão com os bancos de dados
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      this.mainDb = await open({
        filename: MAIN_DB_PATH,
        driver: sqlite3.Database
      });

      this.backupDb = await open({
        filename: BACKUP_DB_PATH,
        driver: sqlite3.Database
      });

      // Criando tabelas no banco de backup se não existirem
      await this.createBackupTables();

      this.isInitialized = true;
      console.log('✅ Backup service initialized');
    } catch (error) {
      console.error('❌ Error initializing backup service:', error);
      throw error;
    }
  }

  /**
   * Cria as tabelas necessárias no banco de backup
   */
  private async createBackupTables() {
    try {
      // Tabela readings com campos adicionais
      await this.backupDb.exec(`
        CREATE TABLE IF NOT EXISTS readings (
          id INTEGER PRIMARY KEY,
          temperature REAL NOT NULL,
          level REAL NOT NULL,
          pump_status INTEGER NOT NULL,
          heater_status INTEGER NOT NULL,
          timestamp TEXT NOT NULL,
          temperature_trend REAL DEFAULT 0,
          level_trend REAL DEFAULT 0,
          is_temp_critical INTEGER DEFAULT 0,
          is_level_critical INTEGER DEFAULT 0,
          data_source TEXT DEFAULT 'thingspeak',
          data_quality REAL DEFAULT 1.0
        )
      `);

      // Tabela de setpoints (igual à principal)
      await this.backupDb.exec(`
        CREATE TABLE IF NOT EXISTS setpoints (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          temp_min REAL DEFAULT 25.0,
          temp_max REAL DEFAULT 28.0,
          level_min REAL DEFAULT 60.0,
          level_max REAL DEFAULT 80.0,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Tabela de configurações (compatível com o banco principal)
      await this.backupDb.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          system_name TEXT DEFAULT 'Aquaponia',
          update_interval INTEGER DEFAULT 1,
          data_retention INTEGER DEFAULT 30,
          email_alerts INTEGER DEFAULT 1,
          push_alerts INTEGER DEFAULT 1,
          alert_email TEXT DEFAULT NULL,
          temp_critical_min REAL DEFAULT 18.0,
          temp_warning_min REAL DEFAULT 20.0,
          temp_warning_max REAL DEFAULT 28.0,
          temp_critical_max REAL DEFAULT 30.0,
          level_critical_min INTEGER DEFAULT 50,
          level_warning_min INTEGER DEFAULT 60,
          level_warning_max INTEGER DEFAULT 85,
          level_critical_max INTEGER DEFAULT 90,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Verificar se a coluna 'key' existe na tabela settings
      // Esta verificação é necessária para compatibilidade com a versão
      // utilizada no Render e em outros ambientes de hospedagem
      try {
        // Consultar informações da tabela settings
        const tableInfo = await this.backupDb.all("PRAGMA table_info(settings)");
        
        // Verificar se a coluna 'key' existe
        const hasKeyColumn = tableInfo.some((col: any) => col.name === 'key');
        const hasValueColumn = tableInfo.some((col: any) => col.name === 'value');
        
        // Se a coluna 'key' não existir, adicioná-la
        if (!hasKeyColumn) {
          console.log('⚠️ Coluna "key" não encontrada na tabela settings. Adicionando...');
          await this.backupDb.exec('ALTER TABLE settings ADD COLUMN key TEXT');
        }
        
        // Se a coluna 'value' não existir, adicioná-la
        if (!hasValueColumn) {
          console.log('⚠️ Coluna "value" não encontrada na tabela settings. Adicionando...');
          await this.backupDb.exec('ALTER TABLE settings ADD COLUMN value TEXT');
        }
        
        console.log('✅ Verificação e correção do esquema da tabela settings concluída');
      } catch (schemaError) {
        console.error('❌ Erro ao verificar ou modificar o esquema da tabela settings:', schemaError);
        // Continuar a execução, não interromper todo o processo por causa deste erro
      }

      // Tabela de alertas (nova tabela para backup)
      await this.backupDb.exec(`
        CREATE TABLE IF NOT EXISTS alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          severity TEXT NOT NULL,
          message TEXT NOT NULL,
          reading_id INTEGER NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          is_acknowledged INTEGER DEFAULT 0,
          FOREIGN KEY (reading_id) REFERENCES readings (id)
        )
      `);

      // Tabela de estatísticas diárias (nova tabela para backup)
      await this.backupDb.exec(`
        CREATE TABLE IF NOT EXISTS daily_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT UNIQUE NOT NULL,
          min_temperature REAL NOT NULL,
          max_temperature REAL NOT NULL,
          avg_temperature REAL NOT NULL,
          min_level REAL NOT NULL,
          max_level REAL NOT NULL,
          avg_level REAL NOT NULL,
          pump_active_time INTEGER DEFAULT 0,
          heater_active_time INTEGER DEFAULT 0,
          reading_count INTEGER NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch (error) {
      console.error('❌ Erro ao criar tabelas de backup:', error);
      throw error;
    }

    // Inserir configurações padrão se a tabela estiver vazia
    const settings = await this.backupDb.get('SELECT COUNT(*) as count FROM settings');
    if (settings.count === 0) {
      await this.backupDb.run(
        "INSERT INTO settings (key, value) VALUES (?, ?)",
        ['temperature_thresholds', JSON.stringify({
          tempCriticalMin: 18.0,
          tempCriticalMax: 30.0,
          levelCriticalMin: 50,
          levelCriticalMax: 90
        })]
      );
    }

    // Inserir setpoints padrão se a tabela estiver vazia
    const setpoints = await this.backupDb.get('SELECT COUNT(*) as count FROM setpoints');
    if (setpoints.count === 0) {
      await this.backupDb.run(
        "INSERT INTO setpoints (temp_min, temp_max, level_min, level_max) VALUES (?, ?, ?, ?)",
        [25.0, 28.0, 60.0, 80.0]
      );
    }

    console.log('✅ Backup database schema created successfully');
  }

  /**
   * Sincroniza os dados do banco principal para o banco de backup
   * @param days Número de dias para importar do ThingSpeak (padrão: 1)
   * @param batchSize Tamanho do lote para processamento em grupo (padrão: 100)
   */
  async syncData(days: number = 1, batchSize: number = 100) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isSyncing) {
      console.log('⏳ Sync already in progress, skipping...');
      return;
    }

    if (!this.mainDb || !this.backupDb) {
      console.error('❌ Bancos de dados não inicializados');
      await this.initialize();
      if (!this.mainDb || !this.backupDb) {
        throw new Error('Não foi possível inicializar os bancos de dados');
      }
    }

    this.isSyncing = true;
    console.log(`🔄 Starting database sync (${days} days, batch size: ${batchSize})...`);

    try {
      // Obter o último ID sincronizado no banco de backup
      const lastBackupReading = await this.backupDb.get(
        'SELECT MAX(id) as last_id FROM readings'
      );
      
      const lastId = lastBackupReading?.last_id || 0;
      
      // Primeiro verifica se há dados locais para sincronizar
      // Buscar novas leituras no banco principal em lotes para controlar o uso de memória
      let processedCount = 0;
      let totalProcessed = 0;
      let hasMoreData = true;
      
      // Loop para processar em lotes
      while (hasMoreData) {
        // Buscar novas leituras no banco principal
        const newReadings = await this.mainDb.all(
          'SELECT * FROM readings WHERE id > ? ORDER BY id ASC LIMIT ?',
          [lastId + processedCount, batchSize]
        );

        // Verificar se é o último lote
        if (newReadings.length === 0) {
          hasMoreData = false;
          break;
        }

        if (processedCount === 0) {
          console.log(`🔄 Processing database sync in batches of ${batchSize} records...`);
        }
        
        console.log(`🔄 Syncing batch ${Math.floor(processedCount/batchSize) + 1}: ${newReadings.length} readings...`);
        
        // Iniciar transação para garantir consistência
        await this.backupDb.run('BEGIN TRANSACTION');
        
        // Processar e inserir cada nova leitura
        for (const reading of newReadings) {
          await this.processAndInsertReading(reading);
        }
        
        // Confirmar transação
        await this.backupDb.run('COMMIT');
        
        // Atualizar contadores
        processedCount += newReadings.length;
        totalProcessed += newReadings.length;
        
        // Limitar o número total de registros processados para evitar sobrecarga
        if (totalProcessed >= 5000) {
          console.log(`⚠️ Reached maximum sync limit (5000 records). Stopping sync to prevent overload.`);
          hasMoreData = false;
          break;
        }
      }
      
      // Se não houver registros no banco local ou já sincronizou todos,
      // verificar se deve importar dados do ThingSpeak
      if (totalProcessed === 0 || !hasMoreData) {
        // Verificar se deve importar do ThingSpeak
        if (days > 0) {
          console.log(`🔄 No more local data to sync. Checking ThingSpeak for last ${days} days of data...`);
          
          try {
            // Importar do ThingSpeak usando a função do syncDatabase
            // Usando dynamic import para evitar problemas de dependência circular
            const syncDatabaseModule = await import('../syncDatabase');
            if (syncDatabaseModule && typeof syncDatabaseModule.syncThingspeakToDatabase === 'function') {
              // Definir as variáveis de ambiente para controlar o tamanho do lote
              process.env.SYNC_BATCH_SIZE = batchSize.toString();
              
              // Executar a sincronização
              const importedCount = await syncDatabaseModule.syncThingspeakToDatabase(days);
              
              console.log(`✅ Imported ${importedCount} readings from ThingSpeak`);
              totalProcessed += importedCount;
            } else {
              console.error('❌ Could not import syncThingspeakToDatabase function');
            }
          } catch (importError) {
            console.error('❌ Error importing data from ThingSpeak:', importError);
          }
        }
      }
      
      // Verificar se há necessidade de gerar estatísticas diárias
      if (totalProcessed > 0) {
        await this.generateDailyStats();
      }
      
      console.log(`✅ Successfully synced ${totalProcessed} readings total`);
      
      // Atualizar o histórico de sincronização
      try {
        await this.backupDb.run(
          `INSERT INTO sync_history (timestamp, success, record_count) VALUES (?, ?, ?)`,
          [new Date().toISOString(), 1, totalProcessed]
        );
      } catch (syncHistoryError) {
        console.error('❌ Error adding sync history:', syncHistoryError);
      }
    } catch (error) {
      console.error('❌ Error during sync:', error);
      
      // Reverter alterações em caso de erro
      try {
        await this.backupDb.run('ROLLBACK');
        
        // Adicionar ao histórico de sincronização (falha)
        try {
          await this.backupDb.run(
            `INSERT INTO sync_history (timestamp, success, record_count) VALUES (?, ?, ?)`,
            [new Date().toISOString(), 0, 0]
          );
        } catch (syncHistoryError) {
          console.error('❌ Error adding sync history for failure:', syncHistoryError);
        }
      } catch (rollbackError) {
        console.error('❌ Error during rollback:', rollbackError);
      }
      
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Processa uma leitura e calcula campos adicionais antes de inserir no backup
   */
  private async processAndInsertReading(reading: Reading) {
    try {
      // Buscar leitura anterior para calcular tendências
      const previousReading = await this.backupDb.get(
        'SELECT temperature, level FROM readings ORDER BY id DESC LIMIT 1'
      );

      // Calcular tendências (se houver leitura anterior)
      const temperatureTrend = previousReading 
        ? reading.temperature - previousReading.temperature 
        : 0;
      
      const levelTrend = previousReading 
        ? reading.level - previousReading.level 
        : 0;

      // Valores fixos para limites críticos para detectar condições de alerta
      // Valores padrão fixos para limites
      const tempCriticalMin = 18.0;
      const tempCriticalMax = 30.0;
      const levelCriticalMin = 50;
      const levelCriticalMax = 90;
      
      // Determinar condições críticas
      const isTempCritical = 
        reading.temperature < tempCriticalMin || 
        reading.temperature > tempCriticalMax;
      
      const isLevelCritical = 
        reading.level < levelCriticalMin || 
        reading.level > levelCriticalMax;
  
      // Inserir leitura com campos adicionais
      await this.backupDb.run(
        `INSERT INTO readings (
          id, temperature, level, pump_status, heater_status, timestamp,
          temperature_trend, level_trend, is_temp_critical, is_level_critical,
          data_source, data_quality
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reading.id,
          reading.temperature,
          reading.level,
          reading.pumpStatus ? 1 : 0,
          reading.heaterStatus ? 1 : 0,
          reading.timestamp,
          temperatureTrend,
          levelTrend,
          isTempCritical ? 1 : 0,
          isLevelCritical ? 1 : 0,
          'thingspeak',
          1.0 // qualidade padrão para dados do ThingSpeak
        ]
      );
  
      // Se condição crítica, gerar alerta
      if (isTempCritical || isLevelCritical) {
        await this.generateAlert(reading.id, isTempCritical, isLevelCritical);
      }
    } catch (error) {
      console.error('❌ Erro ao processar leitura para backup:', error);
      throw error;
    }


  }

  /**
   * Gera um alerta para condições críticas
   */
  private async generateAlert(readingId: number, isTempCritical: boolean, isLevelCritical: boolean) {
    if (isTempCritical) {
      await this.backupDb.run(
        `INSERT INTO alerts (type, severity, message, reading_id) 
         VALUES (?, ?, ?, ?)`,
        [
          'temperature',
          'critical',
          'Temperatura fora dos limites críticos!',
          readingId
        ]
      );
    }

    if (isLevelCritical) {
      await this.backupDb.run(
        `INSERT INTO alerts (type, severity, message, reading_id) 
         VALUES (?, ?, ?, ?)`,
        [
          'water_level',
          'critical',
          'Nível da água fora dos limites críticos!',
          readingId
        ]
      );
    }
  }

  /**
   * Gera estatísticas diárias se não existirem para o dia atual
   */
  private async generateDailyStats() {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Verificar se já existem estatísticas para hoje
    const existingStats = await this.backupDb.get(
      'SELECT id FROM daily_stats WHERE date = ?',
      [today]
    );

    if (existingStats) {
      return; // Estatísticas já existem para hoje
    }

    // Calcular estatísticas para as leituras de hoje
    const stats = await this.backupDb.get(
      `SELECT 
        MIN(temperature) as min_temperature,
        MAX(temperature) as max_temperature,
        AVG(temperature) as avg_temperature,
        MIN(level) as min_level,
        MAX(level) as max_level,
        AVG(level) as avg_level,
        SUM(CASE WHEN pump_status = 1 THEN 1 ELSE 0 END) as pump_active_count,
        SUM(CASE WHEN heater_status = 1 THEN 1 ELSE 0 END) as heater_active_count,
        COUNT(*) as reading_count
      FROM readings 
      WHERE date(timestamp) = ?`,
      [today]
    );

    if (!stats || stats.reading_count === 0) {
      return; // Sem leituras para hoje
    }

    // Cada leitura representa aproximadamente 5 minutos (considerando intervalo padrão)
    // então multiplicamos por 5 para ter o tempo em minutos
    const pumpActiveTime = stats.pump_active_count * 5;
    const heaterActiveTime = stats.heater_active_count * 5;

    // Inserir estatísticas diárias
    await this.backupDb.run(
      `INSERT INTO daily_stats (
        date, min_temperature, max_temperature, avg_temperature,
        min_level, max_level, avg_level,
        pump_active_time, heater_active_time, reading_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        today,
        stats.min_temperature,
        stats.max_temperature,
        stats.avg_temperature,
        stats.min_level,
        stats.max_level,
        stats.avg_level,
        pumpActiveTime,
        heaterActiveTime,
        stats.reading_count
      ]
    );

    console.log(`📊 Generated daily stats for ${today}`);
  }

  /**
   * Obtém informações sobre o último backup
   */
  async getLastBackupInfo(): Promise<LastBackupInfo> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.backupDb) {
      throw new Error('Banco de dados de backup não inicializado');
    }
    
    try {
      // Obter última leitura
      const lastReading = await this.backupDb.get(
        'SELECT id, timestamp FROM readings ORDER BY id DESC LIMIT 1'
      );
      
      // Obter contagem total de registros
      const totalCount = await this.backupDb.get(
        'SELECT COUNT(*) as count FROM readings'
      );
      
      // Obter data/hora atual formatada com fuso horário de Brasília (UTC-3)
      const now = new Date();
      // Subtrair 3 horas para ajustar para o fuso horário de Brasília (UTC-3)
      const brasiliaTime = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      
      // Usar o Intl.DateTimeFormat para garantir o formato brasileiro
      const options: Intl.DateTimeFormatOptions = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'America/Sao_Paulo'
      };
      
      const formattedNow = new Intl.DateTimeFormat('pt-BR', options).format(now);
      
      return {
        lastId: lastReading?.id || 0,
        lastDate: formattedNow,
        totalRecords: totalCount?.count || 0
      };
    } catch (error) {
      console.error('Erro ao obter informações do backup:', error);
      // Obter data/hora atual formatada para casos de erro (usando Intl.DateTimeFormat)
      const now = new Date();
      
      // Usar o Intl.DateTimeFormat para garantir o formato brasileiro
      const options: Intl.DateTimeFormatOptions = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'America/Sao_Paulo'
      };
      
      const formattedNow = new Intl.DateTimeFormat('pt-BR', options).format(now);
      return {
        lastId: 0,
        lastDate: formattedNow,
        totalRecords: 0
      };
    }
  }
  
  /**
   * Obtém estatísticas do banco de backup
   */
  async getBackupStats(): Promise<BackupStats> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.backupDb) {
      throw new Error('Banco de dados de backup não inicializado');
    }
    
    try {
      // Obter estatísticas diárias mais recentes (últimos 7 dias)
      const dailyStats = await this.backupDb.all(
        `SELECT 
          date, 
          min_temperature, 
          max_temperature, 
          avg_temperature,
          reading_count
        FROM daily_stats
        ORDER BY date DESC
        LIMIT 7`
      );
      
      // Formatar para a interface
      const formattedDailyStats = dailyStats.map(stat => ({
        date: stat.date,
        minTemperature: stat.min_temperature,
        maxTemperature: stat.max_temperature,
        avgTemperature: stat.avg_temperature,
        readingCount: stat.reading_count
      }));
      
      // Obter contagem de alertas
      const alertCount = await this.backupDb.get(
        'SELECT COUNT(*) as count FROM alerts'
      );
      
      // Obter contagem de alertas críticos
      const criticalAlertsCount = await this.backupDb.get(
        'SELECT COUNT(*) as count FROM alerts WHERE severity = "critical"'
      );
      
      // Obter o histórico real de sincronização
      // Verificar se temos dados de sincronização global disponíveis
      
      let syncHistory = [];
      
      // Se tivermos o último tempo de sincronização global, use-o
      if ((global as any).__lastSyncTime) {
        // Definir opções para formatação de data/hora no padrão brasileiro
        const options: Intl.DateTimeFormatOptions = {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: 'America/Sao_Paulo'
        };
        
        // Formatar a data da última sincronização global
        const lastSyncFormatted = new Intl.DateTimeFormat('pt-BR', options).format(new Date((global as any).__lastSyncTime));
        
        // Adicionar dados da sincronização global
        syncHistory.push({
          success: true,
          timestamp: lastSyncFormatted,
          recordCount: await this.backupDb.get('SELECT COUNT(*) as count FROM readings WHERE timestamp > ?', [
            new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Últimas 24 horas
          ]).then(result => result?.count || 0)
        });
      } else {
        // Se não tivermos dados globais, obter a última leitura como referência
        const lastReading = await this.backupDb.get(
          'SELECT timestamp FROM readings ORDER BY id DESC LIMIT 1'
        );
        
        if (lastReading?.timestamp) {
          const options: Intl.DateTimeFormatOptions = {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'America/Sao_Paulo'
          };
          
          const lastReadingFormatted = new Intl.DateTimeFormat('pt-BR', options).format(new Date(lastReading.timestamp));
          
          syncHistory.push({
            success: true,
            timestamp: lastReadingFormatted,
            recordCount: await this.backupDb.get('SELECT COUNT(*) as count FROM readings').then(result => result?.count || 0)
          });
        }
      }
      
      return {
        dailyStats: formattedDailyStats,
        alertCount: alertCount?.count || 0,
        criticalAlertsCount: criticalAlertsCount?.count || 0,
        syncHistory
      };
    } catch (error) {
      console.error('Erro ao obter estatísticas do backup:', error);
      return {
        dailyStats: [],
        alertCount: 0,
        criticalAlertsCount: 0,
        syncHistory: []
      };
    }
  }
  
  /**
   * Fecha as conexões dos bancos de dados
   */
  async close() {
    if (this.mainDb) {
      await this.mainDb.close();
    }
    
    if (this.backupDb) {
      await this.backupDb.close();
    }
    
    this.isInitialized = false;
    console.log('🔄 Backup service closed');
  }
}

// Instância global do serviço
export const backupService = new BackupService();