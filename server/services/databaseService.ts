import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Corrigido para usar o caminho atual do projeto em vez de tentar usar caminhos relativos complexos
const DB_PATH = path.resolve(process.cwd(), 'aquaponia.db');

export async function createDb() {
  // Primeiro vamos verificar se o arquivo existe e tem conteúdo
  let needsInit = false;
  
  if (!fs.existsSync(DB_PATH)) {
    needsInit = true;
    // Criamos o diretório pai se necessário
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } else {
    // Se o arquivo existe mas está vazio
    const stats = fs.statSync(DB_PATH);
    if (stats.size === 0) {
      needsInit = true;
    }
  }
  
  if (needsInit) {
    console.log('📁 Criando ou recriando banco de dados:', DB_PATH);
    // Removemos o arquivo se existir
    if (fs.existsSync(DB_PATH)) {
      fs.unlinkSync(DB_PATH);
    }
  }

  // Open database connection
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  console.log('🔄 Connected to database');

  // Create tables if they don't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      temperature REAL NOT NULL,
      level REAL NOT NULL,
      pump_status INTEGER DEFAULT 0,
      heater_status INTEGER DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS setpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      temp_min REAL DEFAULT 20.0 NOT NULL,
      temp_max REAL DEFAULT 30.0 NOT NULL,
      level_min INTEGER DEFAULT 60 NOT NULL,
      level_max INTEGER DEFAULT 90 NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      system_name TEXT DEFAULT 'Aquaponia' NOT NULL,
      update_interval INTEGER DEFAULT 1 NOT NULL,
      data_retention INTEGER DEFAULT 30 NOT NULL,
      email_alerts INTEGER DEFAULT 1 NOT NULL,
      push_alerts INTEGER DEFAULT 1 NOT NULL,
      alert_email TEXT,
      temp_critical_min REAL DEFAULT 18.0 NOT NULL,
      temp_warning_min REAL DEFAULT 20.0 NOT NULL,
      temp_warning_max REAL DEFAULT 28.0 NOT NULL,
      temp_critical_max REAL DEFAULT 30.0 NOT NULL,
      level_critical_min INTEGER DEFAULT 50 NOT NULL,
      level_warning_min INTEGER DEFAULT 60 NOT NULL,
      level_warning_max INTEGER DEFAULT 85 NOT NULL,
      level_critical_max INTEGER DEFAULT 90 NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_readings_timestamp ON readings(timestamp);
  `);

  console.log('✅ Database tables created successfully');

  // Insert default setpoints if they don't exist
  await db.run(`
    INSERT INTO setpoints (id, temp_min, temp_max, level_min, level_max)
    SELECT 1, 20.0, 30.0, 60, 90
    WHERE NOT EXISTS (SELECT 1 FROM setpoints WHERE id = 1);
  `);

  // Insert default settings if they don't exist
  await db.run(`
    INSERT INTO settings (id)
    SELECT 1
    WHERE NOT EXISTS (SELECT 1 FROM settings WHERE id = 1);
  `);

  console.log('✅ Database initialized with default values');

  return db;
}

// Função para salvar configurações no formato correto no banco de dados
export async function saveSettingsInDB(settings: any) {
  console.log('🔍 [databaseService] saveSettingsInDB: Iniciando salvar configurações no banco');
  
  try {
    // Abrir conexão com o banco
    const db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });
    
    console.log('🔄 [databaseService] Conexão com banco estabelecida para atualizar configurações');
    
    // Versão simplificada da função que lida com os casos mais comuns
    if (typeof settings === 'object' && !Array.isArray(settings)) {
      // Formato: Objeto plano (mais comum)
      console.log('🔄 [databaseService] Formato detectado: Objeto plano');
      
      // Verificar se já está em formato snake_case ou precisa de conversão
      let snakeCaseSettings: Record<string, any> = {};
      
      // Verificar se as chaves já são snake_case
      const hasSnakeCase = Object.keys(settings).some(key => key.includes('_'));
      
      if (hasSnakeCase) {
        // Já está em snake_case
        snakeCaseSettings = { ...settings };
        console.log('🔄 [databaseService] Dado já em formato snake_case');
      } else {
        // Converter de camelCase para snake_case
        for (const [key, value] of Object.entries(settings)) {
          if (value !== undefined) {
            const snakeCaseKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            snakeCaseSettings[snakeCaseKey] = value;
          }
        }
        console.log('🔄 [databaseService] Convertido de camelCase para snake_case');
      }
      
      // Chaves vazias significam um problema
      const columns = Object.keys(snakeCaseSettings);
      if (columns.length === 0) {
        console.error('❌ [databaseService] Nenhum dado válido para atualizar');
        await db.close();
        return null;
      }
      
      try {
        // Verificar se a tabela settings existe
        const tableCheck = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'");
        
        if (!tableCheck) {
          // Criar tabela se não existir
          console.log('🔄 [databaseService] Criando tabela settings...');
          await db.run(`
            CREATE TABLE IF NOT EXISTS settings (
              id INTEGER PRIMARY KEY,
              temperature_min REAL,
              temperature_max REAL,
              level_min REAL,
              level_max REAL,
              temp_critical_min REAL,
              temp_warning_min REAL,
              temp_warning_max REAL,
              temp_critical_max REAL,
              level_critical_min REAL,
              level_warning_min REAL,
              level_warning_max REAL,
              level_critical_max REAL,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `);
          
          // Inserir registro inicial
          await db.run('INSERT INTO settings (id) VALUES (1)');
        }
        
        // Construir a query de UPDATE
        const setClause = columns.map(col => `${col} = ?`).join(', ');
        const values = Object.values(snakeCaseSettings);
        
        console.log(`🔄 [databaseService] Executando UPDATE com ${columns.length} configurações`);
        console.log(`🔄 [databaseService] SET ${setClause}`);
        console.log(`🔄 [databaseService] VALUES: ${JSON.stringify(values)}`);
        
        await db.run(
          `UPDATE settings SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
          values
        );
        
        // Obter configurações atualizadas
        const updatedSettings = await db.get('SELECT * FROM settings WHERE id = 1');
        console.log('✅ [databaseService] Configurações atualizadas com sucesso:', updatedSettings);
        
        // Fechar conexão
        await db.close();
        
        return updatedSettings;
      } catch (dbError) {
        console.error('❌ [databaseService] Erro em operação no banco:', dbError);
        await db.close();
        throw dbError;
      }
    } else if (Array.isArray(settings) && settings.length > 0 && 'key' in settings[0] && 'value' in settings[0]) {
      // Formato: Array de objetos {key, value}
      console.log('🔄 [databaseService] Formato detectado: Array de objetos {key, value}');
      
      // Converter para objeto plano
      const plainSettings: Record<string, any> = {};
      for (const setting of settings) {
        const snakeCaseKey = setting.key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        plainSettings[snakeCaseKey] = setting.value;
      }
      
      // Recursivamente chamar a mesma função com o formato convertido
      return saveSettingsInDB(plainSettings);
    } else {
      console.error('❌ [databaseService] Formato de configurações não reconhecido:', JSON.stringify(settings, null, 2));
      await db.close();
      return null;
    }
  } catch (error) {
    console.error('❌ [databaseService] Erro ao atualizar configurações:', error);
    return null;
  }
}
