/**
 * Serviço para manipulação de dados históricos
 * Este módulo fornece funções para agregação e gerenciamento de dados históricos
 */

import path from 'path';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import fs from 'fs';

// Caminho para o banco de dados
const DB_PATH = path.resolve('./aquaponia.db');

// Tipos de período para agregação
export type PeriodType = 'hourly' | 'daily' | 'weekly' | 'monthly';

// Interface para registros agregados
export interface AggregatedData {
  date: number; // timestamp
  period_type: PeriodType;
  avg_temperature: number;
  min_temperature: number;
  max_temperature: number;
  avg_level: number;
  min_level: number;
  max_level: number;
  pump_on_percentage: number;
  heater_on_percentage: number;
  records_count: number;
}

// Tabelas necessárias para a funcionalidade
const REQUIRED_TABLES = [
  'historical_data',
  'sync_history',
  'system_events'
];

/**
 * Inicializa o banco de dados com as tabelas necessárias
 */
export async function initHistoricalDatabase(): Promise<void> {
  console.log('Inicializando banco de dados para dados históricos...');
  
  try {
    // Verifica se o arquivo do banco existe
    const dbExists = fs.existsSync(DB_PATH);
    if (!dbExists) {
      console.log('Arquivo de banco de dados não encontrado. Criando novo banco...');
    }
    
    // Abre conexão com o banco
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    // Cria as tabelas se não existirem
    await db.exec(`
      CREATE TABLE IF NOT EXISTS historical_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date INTEGER NOT NULL,
        period_type TEXT NOT NULL,
        avg_temperature REAL,
        min_temperature REAL,
        max_temperature REAL,
        avg_level REAL,
        min_level REAL,
        max_level REAL,
        pump_on_percentage REAL,
        heater_on_percentage REAL,
        records_count INTEGER NOT NULL
      );
    `);
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        start_date INTEGER NOT NULL,
        end_date INTEGER NOT NULL,
        records_synced INTEGER NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        created_at INTEGER DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS system_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        message TEXT NOT NULL,
        details TEXT,
        timestamp INTEGER DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Cria índices para melhorar performance
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_historical_data_date ON historical_data(date);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_historical_data_period ON historical_data(period_type);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_history_dates ON sync_history(start_date, end_date);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events(event_type);`);
    
    console.log('Banco de dados para histórico inicializado com sucesso.');
    await db.close();
  } catch (error) {
    console.error('Erro ao inicializar banco de dados para histórico:', error);
    throw error;
  }
}

/**
 * Verifica se as tabelas do histórico já existem
 */
export async function checkHistoricalTables(): Promise<boolean> {
  try {
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    // Verificar se todas as tabelas existem
    const tables = await db.all(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name IN (${REQUIRED_TABLES.map(t => `'${t}'`).join(',')})
    `);
    
    await db.close();
    return tables.length === REQUIRED_TABLES.length;
  } catch (error) {
    console.error('Erro ao verificar tabelas de histórico:', error);
    return false;
  }
}

/**
 * Agrega dados por hora para a tabela de histórico
 * @param startDate Data inicial (timestamp)
 * @param endDate Data final (timestamp)
 * @returns Número de registros agregados
 */
export async function aggregateHourlyData(startDate: number, endDate: number): Promise<number> {
  try {
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    // Verificar se já existem agregações para esse período
    const existingData = await db.all(`
      SELECT * FROM historical_data 
      WHERE period_type = 'hourly' AND date >= ? AND date <= ?
    `, [startDate, endDate]);
    
    if (existingData.length > 0) {
      console.log(`Já existem ${existingData.length} agregações horárias para o período especificado.`);
    }
    
    // Agregação por hora dos dados de leitura
    const hourlyData = await db.all(`
      SELECT 
        strftime('%Y-%m-%d %H:00:00', timestamp/1000, 'unixepoch') as hour_start,
        strftime('%s', strftime('%Y-%m-%d %H:00:00', timestamp/1000, 'unixepoch')) * 1000 as date_timestamp,
        AVG(temperature) as avg_temperature,
        MIN(temperature) as min_temperature,
        MAX(temperature) as max_temperature,
        AVG(level) as avg_level,
        MIN(level) as min_level,
        MAX(level) as max_level,
        AVG(pump_status) as pump_on_percentage,
        AVG(heater_status) as heater_on_percentage,
        COUNT(*) as records_count
      FROM readings
      WHERE timestamp >= ? AND timestamp <= ? AND temperature > -50
      GROUP BY hour_start
      ORDER BY hour_start
    `, [startDate, endDate]);
    
    console.log(`Agregados dados de ${hourlyData.length} horas.`);
    
    // Inserir na tabela de histórico
    if (hourlyData.length > 0) {
      // Preparar statement para inserção em lote
      const stmt = await db.prepare(`
        INSERT INTO historical_data (
          date, period_type, avg_temperature, min_temperature, max_temperature,
          avg_level, min_level, max_level, pump_on_percentage, heater_on_percentage, 
          records_count
        ) VALUES (?, 'hourly', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (date, period_type) DO UPDATE SET
          avg_temperature = excluded.avg_temperature,
          min_temperature = excluded.min_temperature,
          max_temperature = excluded.max_temperature,
          avg_level = excluded.avg_level,
          min_level = excluded.min_level,
          max_level = excluded.max_level,
          pump_on_percentage = excluded.pump_on_percentage,
          heater_on_percentage = excluded.heater_on_percentage,
          records_count = excluded.records_count
      `);
      
      // Inserir dados
      for (const data of hourlyData) {
        await stmt.run(
          data.date_timestamp,
          data.avg_temperature,
          data.min_temperature,
          data.max_temperature,
          data.avg_level,
          data.min_level,
          data.max_level,
          data.pump_on_percentage * 100, // Converter para percentual
          data.heater_on_percentage * 100, // Converter para percentual
          data.records_count
        );
      }
      
      await stmt.finalize();
      
      // Registrar evento do sistema
      await db.run(`
        INSERT INTO system_events (event_type, message, details, timestamp)
        VALUES ('info', 'Agregação horária concluída', ?, ?)
      `, [
        `Agregados dados de ${hourlyData.length} horas entre ${new Date(startDate).toISOString()} e ${new Date(endDate).toISOString()}`,
        Date.now()
      ]);
    }
    
    await db.close();
    return hourlyData.length;
  } catch (error) {
    console.error('Erro ao agregar dados por hora:', error);
    throw error;
  }
}

/**
 * Agrega dados por dia para a tabela de histórico
 * @param startDate Data inicial (timestamp)
 * @param endDate Data final (timestamp)
 * @returns Número de registros agregados
 */
export async function aggregateDailyData(startDate: number, endDate: number): Promise<number> {
  try {
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    // Verificar se já existem agregações para esse período
    const existingData = await db.all(`
      SELECT * FROM historical_data 
      WHERE period_type = 'daily' AND date >= ? AND date <= ?
    `, [startDate, endDate]);
    
    if (existingData.length > 0) {
      console.log(`Já existem ${existingData.length} agregações diárias para o período especificado.`);
    }
    
    // Agregação por dia dos dados de leitura
    const dailyData = await db.all(`
      SELECT 
        strftime('%Y-%m-%d 00:00:00', timestamp/1000, 'unixepoch') as day_start,
        strftime('%s', strftime('%Y-%m-%d 00:00:00', timestamp/1000, 'unixepoch')) * 1000 as date_timestamp,
        AVG(temperature) as avg_temperature,
        MIN(temperature) as min_temperature,
        MAX(temperature) as max_temperature,
        AVG(level) as avg_level,
        MIN(level) as min_level,
        MAX(level) as max_level,
        AVG(pump_status) as pump_on_percentage,
        AVG(heater_status) as heater_on_percentage,
        COUNT(*) as records_count
      FROM readings
      WHERE timestamp >= ? AND timestamp <= ? AND temperature > -50
      GROUP BY day_start
      ORDER BY day_start
    `, [startDate, endDate]);
    
    console.log(`Agregados dados de ${dailyData.length} dias.`);
    
    // Inserir na tabela de histórico
    if (dailyData.length > 0) {
      // Preparar statement para inserção em lote
      const stmt = await db.prepare(`
        INSERT INTO historical_data (
          date, period_type, avg_temperature, min_temperature, max_temperature,
          avg_level, min_level, max_level, pump_on_percentage, heater_on_percentage, 
          records_count
        ) VALUES (?, 'daily', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (date, period_type) DO UPDATE SET
          avg_temperature = excluded.avg_temperature,
          min_temperature = excluded.min_temperature,
          max_temperature = excluded.max_temperature,
          avg_level = excluded.avg_level,
          min_level = excluded.min_level,
          max_level = excluded.max_level,
          pump_on_percentage = excluded.pump_on_percentage,
          heater_on_percentage = excluded.heater_on_percentage,
          records_count = excluded.records_count
      `);
      
      // Inserir dados
      for (const data of dailyData) {
        await stmt.run(
          data.date_timestamp,
          data.avg_temperature,
          data.min_temperature,
          data.max_temperature,
          data.avg_level,
          data.min_level,
          data.max_level,
          data.pump_on_percentage * 100, // Converter para percentual
          data.heater_on_percentage * 100, // Converter para percentual
          data.records_count
        );
      }
      
      await stmt.finalize();
      
      // Registrar evento do sistema
      await db.run(`
        INSERT INTO system_events (event_type, message, details, timestamp)
        VALUES ('info', 'Agregação diária concluída', ?, ?)
      `, [
        `Agregados dados de ${dailyData.length} dias entre ${new Date(startDate).toISOString()} e ${new Date(endDate).toISOString()}`,
        Date.now()
      ]);
    }
    
    await db.close();
    return dailyData.length;
  } catch (error) {
    console.error('Erro ao agregar dados por dia:', error);
    throw error;
  }
}

/**
 * Agrega dados por semana para a tabela de histórico
 * @param startDate Data inicial (timestamp)
 * @param endDate Data final (timestamp)
 * @returns Número de registros agregados
 */
export async function aggregateWeeklyData(startDate: number, endDate: number): Promise<number> {
  try {
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    // Verificar se já existem agregações para esse período
    const existingData = await db.all(`
      SELECT * FROM historical_data 
      WHERE period_type = 'weekly' AND date >= ? AND date <= ?
    `, [startDate, endDate]);
    
    if (existingData.length > 0) {
      console.log(`Já existem ${existingData.length} agregações semanais para o período especificado.`);
    }
    
    // Agregação por semana dos dados de leitura
    const weeklyData = await db.all(`
      SELECT 
        strftime('%Y-%W', timestamp/1000, 'unixepoch') as week_number,
        -- Primeiro dia da semana (domingo)
        (strftime('%s', strftime('%Y-01-01', timestamp/1000, 'unixepoch'), 'weekday 0', '-7 day', '+' || (strftime('%W', timestamp/1000, 'unixepoch')) || ' weeks')) * 1000 as date_timestamp,
        AVG(temperature) as avg_temperature,
        MIN(temperature) as min_temperature,
        MAX(temperature) as max_temperature,
        AVG(level) as avg_level,
        MIN(level) as min_level,
        MAX(level) as max_level,
        AVG(pump_status) as pump_on_percentage,
        AVG(heater_status) as heater_on_percentage,
        COUNT(*) as records_count
      FROM readings
      WHERE timestamp >= ? AND timestamp <= ? AND temperature > -50
      GROUP BY week_number
      ORDER BY week_number
    `, [startDate, endDate]);
    
    console.log(`Agregados dados de ${weeklyData.length} semanas.`);
    
    // Inserir na tabela de histórico
    if (weeklyData.length > 0) {
      // Preparar statement para inserção em lote
      const stmt = await db.prepare(`
        INSERT INTO historical_data (
          date, period_type, avg_temperature, min_temperature, max_temperature,
          avg_level, min_level, max_level, pump_on_percentage, heater_on_percentage, 
          records_count
        ) VALUES (?, 'weekly', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (date, period_type) DO UPDATE SET
          avg_temperature = excluded.avg_temperature,
          min_temperature = excluded.min_temperature,
          max_temperature = excluded.max_temperature,
          avg_level = excluded.avg_level,
          min_level = excluded.min_level,
          max_level = excluded.max_level,
          pump_on_percentage = excluded.pump_on_percentage,
          heater_on_percentage = excluded.heater_on_percentage,
          records_count = excluded.records_count
      `);
      
      // Inserir dados
      for (const data of weeklyData) {
        await stmt.run(
          data.date_timestamp,
          data.avg_temperature,
          data.min_temperature,
          data.max_temperature,
          data.avg_level,
          data.min_level,
          data.max_level,
          data.pump_on_percentage * 100, // Converter para percentual
          data.heater_on_percentage * 100, // Converter para percentual
          data.records_count
        );
      }
      
      await stmt.finalize();
      
      // Registrar evento do sistema
      await db.run(`
        INSERT INTO system_events (event_type, message, details, timestamp)
        VALUES ('info', 'Agregação semanal concluída', ?, ?)
      `, [
        `Agregados dados de ${weeklyData.length} semanas entre ${new Date(startDate).toISOString()} e ${new Date(endDate).toISOString()}`,
        Date.now()
      ]);
    }
    
    await db.close();
    return weeklyData.length;
  } catch (error) {
    console.error('Erro ao agregar dados por semana:', error);
    throw error;
  }
}

/**
 * Agrega dados por mês para a tabela de histórico
 * @param startDate Data inicial (timestamp)
 * @param endDate Data final (timestamp)
 * @returns Número de registros agregados
 */
export async function aggregateMonthlyData(startDate: number, endDate: number): Promise<number> {
  try {
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    // Verificar se já existem agregações para esse período
    const existingData = await db.all(`
      SELECT * FROM historical_data 
      WHERE period_type = 'monthly' AND date >= ? AND date <= ?
    `, [startDate, endDate]);
    
    if (existingData.length > 0) {
      console.log(`Já existem ${existingData.length} agregações mensais para o período especificado.`);
    }
    
    // Agregação por mês dos dados de leitura
    const monthlyData = await db.all(`
      SELECT 
        strftime('%Y-%m', timestamp/1000, 'unixepoch') as month_year,
        strftime('%s', strftime('%Y-%m-01', timestamp/1000, 'unixepoch')) * 1000 as date_timestamp,
        AVG(temperature) as avg_temperature,
        MIN(temperature) as min_temperature,
        MAX(temperature) as max_temperature,
        AVG(level) as avg_level,
        MIN(level) as min_level,
        MAX(level) as max_level,
        AVG(pump_status) as pump_on_percentage,
        AVG(heater_status) as heater_on_percentage,
        COUNT(*) as records_count
      FROM readings
      WHERE timestamp >= ? AND timestamp <= ? AND temperature > -50
      GROUP BY month_year
      ORDER BY month_year
    `, [startDate, endDate]);
    
    console.log(`Agregados dados de ${monthlyData.length} meses.`);
    
    // Inserir na tabela de histórico
    if (monthlyData.length > 0) {
      // Preparar statement para inserção em lote
      const stmt = await db.prepare(`
        INSERT INTO historical_data (
          date, period_type, avg_temperature, min_temperature, max_temperature,
          avg_level, min_level, max_level, pump_on_percentage, heater_on_percentage, 
          records_count
        ) VALUES (?, 'monthly', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (date, period_type) DO UPDATE SET
          avg_temperature = excluded.avg_temperature,
          min_temperature = excluded.min_temperature,
          max_temperature = excluded.max_temperature,
          avg_level = excluded.avg_level,
          min_level = excluded.min_level,
          max_level = excluded.max_level,
          pump_on_percentage = excluded.pump_on_percentage,
          heater_on_percentage = excluded.heater_on_percentage,
          records_count = excluded.records_count
      `);
      
      // Inserir dados
      for (const data of monthlyData) {
        await stmt.run(
          data.date_timestamp,
          data.avg_temperature,
          data.min_temperature,
          data.max_temperature,
          data.avg_level,
          data.min_level,
          data.max_level,
          data.pump_on_percentage * 100, // Converter para percentual
          data.heater_on_percentage * 100, // Converter para percentual
          data.records_count
        );
      }
      
      await stmt.finalize();
      
      // Registrar evento do sistema
      await db.run(`
        INSERT INTO system_events (event_type, message, details, timestamp)
        VALUES ('info', 'Agregação mensal concluída', ?, ?)
      `, [
        `Agregados dados de ${monthlyData.length} meses entre ${new Date(startDate).toISOString()} e ${new Date(endDate).toISOString()}`,
        Date.now()
      ]);
    }
    
    await db.close();
    return monthlyData.length;
  } catch (error) {
    console.error('Erro ao agregar dados por mês:', error);
    throw error;
  }
}

/**
 * Recupera dados históricos agregados para um período específico
 * @param startDate Data inicial (timestamp)
 * @param endDate Data final (timestamp)
 * @param periodType Tipo de período ('hourly', 'daily', 'weekly', 'monthly')
 * @returns Dados agregados para o período
 */
export async function getHistoricalData(
  startDate: number,
  endDate: number,
  periodType: PeriodType
): Promise<AggregatedData[]> {
  try {
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    const data = await db.all(`
      SELECT * FROM historical_data
      WHERE period_type = ? AND date >= ? AND date <= ?
      ORDER BY date
    `, [periodType, startDate, endDate]);
    
    await db.close();
    return data as AggregatedData[];
  } catch (error) {
    console.error(`Erro ao buscar dados históricos (${periodType}):`, error);
    throw error;
  }
}

/**
 * Processa dados históricos para todos os períodos
 * Executa a agregação de dados para diferentes granularidades (hora, dia, semana, mês)
 * @param startDate Data inicial (timestamp)
 * @param endDate Data final (timestamp)
 * @returns Resumo das agregações realizadas
 */
export async function processHistoricalData(
  startDate: number, 
  endDate: number
): Promise<{ hourly: number; daily: number; weekly: number; monthly: number }> {
  console.log(`Processando dados históricos de ${new Date(startDate).toISOString()} até ${new Date(endDate).toISOString()}`);
  
  // Garantir que as tabelas existem
  const tablesExist = await checkHistoricalTables();
  if (!tablesExist) {
    await initHistoricalDatabase();
  }
  
  // Executar agregações
  const hourlyCount = await aggregateHourlyData(startDate, endDate);
  const dailyCount = await aggregateDailyData(startDate, endDate);
  const weeklyCount = await aggregateWeeklyData(startDate, endDate);
  const monthlyCount = await aggregateMonthlyData(startDate, endDate);
  
  return {
    hourly: hourlyCount,
    daily: dailyCount,
    weekly: weeklyCount,
    monthly: monthlyCount
  };
}

/**
 * Registra um evento do sistema
 * @param type Tipo do evento ('error', 'warning', 'info')
 * @param message Mensagem do evento
 * @param details Detalhes adicionais (opcional)
 */
export async function logSystemEvent(
  type: 'error' | 'warning' | 'info',
  message: string,
  details?: string
): Promise<void> {
  try {
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    await db.run(`
      INSERT INTO system_events (event_type, message, details, timestamp)
      VALUES (?, ?, ?, ?)
    `, [type, message, details || null, Date.now()]);
    
    await db.close();
  } catch (error) {
    console.error('Erro ao registrar evento do sistema:', error);
  }
}

/**
 * Recupera eventos do sistema
 * @param limit Número máximo de eventos a retornar
 * @param offset Deslocamento para paginação
 * @param type Filtrar por tipo específico (opcional)
 * @returns Lista de eventos do sistema
 */
export async function getSystemEvents(
  limit: number = 100,
  offset: number = 0,
  type?: 'error' | 'warning' | 'info'
): Promise<any[]> {
  try {
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    let query = `
      SELECT * FROM system_events
      ${type ? 'WHERE event_type = ?' : ''}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;
    
    const params = type 
      ? [type, limit, offset] 
      : [limit, offset];
    
    const events = await db.all(query, params);
    
    await db.close();
    return events;
  } catch (error) {
    console.error('Erro ao buscar eventos do sistema:', error);
    return [];
  }
}

/**
 * Registra histórico de sincronização
 * @param startDate Data inicial da sincronização
 * @param endDate Data final da sincronização
 * @param recordsSynced Número de registros sincronizados
 * @param status Status da sincronização
 * @param errorMessage Mensagem de erro (opcional)
 */
export async function logSyncHistory(
  startDate: number,
  endDate: number,
  recordsSynced: number,
  status: 'success' | 'failed' | 'partial',
  errorMessage?: string
): Promise<void> {
  try {
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    await db.run(`
      INSERT INTO sync_history (
        start_date, end_date, records_synced, status, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      startDate,
      endDate,
      recordsSynced,
      status,
      errorMessage || null,
      Date.now()
    ]);
    
    await db.close();
  } catch (error) {
    console.error('Erro ao registrar histórico de sincronização:', error);
  }
}

/**
 * Recupera histórico de sincronizações
 * @param limit Número máximo de registros a retornar
 * @param offset Deslocamento para paginação
 * @returns Lista de sincronizações
 */
export async function getSyncHistory(
  limit: number = 100,
  offset: number = 0
): Promise<any[]> {
  try {
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    const history = await db.all(`
      SELECT * FROM sync_history
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    await db.close();
    return history;
  } catch (error) {
    console.error('Erro ao buscar histórico de sincronização:', error);
    return [];
  }
}