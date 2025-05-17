/**
 * Script para sincronizar dados do ThingSpeak para o banco de dados local
 * Este script importa dados históricos e os salva no banco de dados SQLite
 * 
 * Modificado para registrar estado de sincronização e permitir integração
 * com o sistema de sincronização automática e backup diário
 */
import { fetchHistoricalReadings } from './services/thingspeakService';
import { storage } from './storage';
import { InsertReading } from '@shared/schema';
import { log } from './vite';

// Variáveis globais para controle do estado de sincronização
(global as any).__lastSyncTime = null; // Armazena a última vez que a sincronização foi concluída
(global as any).__syncInProgress = false; // Flag para evitar sincronizações simultâneas

export async function syncThingspeakToDatabase(days: number = 7): Promise<number> {
  // Evitar múltiplas sincronizações simultâneas
  if ((global as any).__syncInProgress) {
    log(`⚠️ Sincronização já em andamento. A operação será ignorada.`, 'sync');
    return 0;
  }
  
  try {
    // Marcar início da sincronização
    (global as any).__syncInProgress = true;
    
    log(`🔄 Iniciando importação de ${days} dias de dados do ThingSpeak para o banco local...`, 'sync');
    console.log(`Fetching ${days} days of data directly from ThingSpeak...`);
    
    // Verificar se o banco de dados está pronto
    try {
      // Método auxiliar para garantir que o banco está acessível
      await storage.getLatestReadings(1);
    } catch (dbError) {
      console.error('Erro ao acessar o banco de dados antes da importação:', dbError);
      log('⚠️ Banco de dados não está acessível. Tentando inicializar...', 'sync');
      
      // Forçar inicialização do banco de dados
      if (storage instanceof Object && typeof (storage as any).ensureInitialized === 'function') {
        await (storage as any).ensureInitialized();
      }
    }
    
    // Buscar leituras históricas do ThingSpeak (com limite configurável)
    // Verificar se há um tamanho de lote personalizado nas variáveis de ambiente
    const batchSizeEnv = process.env.SYNC_BATCH_SIZE;
    const MAX_READINGS = batchSizeEnv ? Math.min(parseInt(batchSizeEnv), 500) : 500; 
    
    log(`📊 Utilizando tamanho de lote: ${MAX_READINGS} (máximo: 500)`, 'sync');
    let readings = await fetchHistoricalReadings(days);
    
    if (readings.length === 0) {
      log('⚠️ Nenhum dado encontrado no ThingSpeak para o período solicitado', 'sync');
      return 0;
    }
    
    // Limitar o número de leituras para processamento
    if (readings.length > MAX_READINGS) {
      log(`⚠️ Limitando importação para ${MAX_READINGS} registros (de ${readings.length} disponíveis)`, 'sync');
      readings = readings.slice(0, MAX_READINGS);
    }
    
    log(`📊 Processando ${readings.length} leituras do ThingSpeak`, 'sync');
    
    // Contador de registros importados com sucesso
    let importedCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    // Importar cada leitura para o banco de dados local
    for (const reading of readings) {
      try {
        // Garantir que a leitura está completa com todos os campos necessários
        const readingToSave: InsertReading = {
          temperature: reading.temperature,
          level: reading.level,
          pumpStatus: typeof reading.pumpStatus === 'boolean' ? reading.pumpStatus : false,
          heaterStatus: typeof reading.heaterStatus === 'boolean' ? reading.heaterStatus : false,
          timestamp: reading.timestamp instanceof Date ? reading.timestamp : new Date()
        };
        
        // Salvar no banco de dados local
        await storage.saveReading(readingToSave);
        importedCount++;
        
        // Feedback periódico para importações grandes
        if (importedCount % 100 === 0) {
          log(`📥 Importados ${importedCount}/${readings.length} registros...`, 'sync');
        }
      } catch (error) {
        // Registro já pode existir no banco de dados, é normal falhar alguns
        if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
          // Ignorar erros de unicidade (registros duplicados)
          skipCount++;
          continue;
        } else {
          // Logar outros erros mas continuar a importação
          errorCount++;
          console.error('Erro ao importar leitura:', error);
        }
      }
    }
    
    log(`✅ Importação concluída. ${importedCount} registros importados com sucesso.`, 'sync');
    if (skipCount > 0) {
      log(`ℹ️ ${skipCount} registros ignorados (já existiam no banco).`, 'sync');
    }
    if (errorCount > 0) {
      log(`⚠️ ${errorCount} erros encontrados durante a importação.`, 'sync');
    }
    
    // Registrar timestamp da última sincronização bem-sucedida
    (global as any).__lastSyncTime = new Date();
    
    return importedCount;
  } catch (error) {
    console.error('❌ Erro durante a sincronização com ThingSpeak:', error);
    log(`❌ Falha na importação: ${error instanceof Error ? error.message : String(error)}`, 'sync');
    throw error;
  } finally {
    // Sempre liberar o bloqueio de sincronização, mesmo em caso de erro
    (global as any).__syncInProgress = false;
  }
}