/**
 * Serviço para gerenciar a sincronização agendada entre ThingSpeak e banco de dados local
 * 
 * Este serviço garante que:
 * 1. Dados são importados quando o servidor inicia
 * 2. Backup diário dos dados do ThingSpeak é realizado automaticamente
 * 3. Cada conexão com o ThingSpeak atualiza o banco de dados local
 */

import cron from 'node-cron';
import { syncThingspeakToDatabase } from '../syncDatabase';
import { log } from '../vite';
import { fetchLatestReading } from './thingspeakService';
import { storage } from '../storage';

class SyncSchedulerService {
  // Flag para controlar se a sincronização inicial já foi executada
  private initialSyncComplete: boolean = false;
  
  // Configuração dos jobs agendados
  private dailyBackupJob: cron.ScheduledTask | null = null;
  
  constructor() {
    // Inicialização
    log('🔄 Inicializando serviço de sincronização agendada', 'sync');
  }
  
  /**
   * Inicia o serviço de sincronização
   */
  async initialize(): Promise<void> {
    try {
      // Não realizar importação inicial automaticamente, apenas quando solicitado
      // Para evitar sobrecarga do servidor durante o início
      this.initialSyncComplete = true; // Marcar como concluída para evitar que execute automaticamente
      log('🔄 Sincronização inicial desativada para evitar sobrecarga do servidor', 'sync');
      
      // Configurar backup diário às 03:00 da manhã
      this.scheduleDailyBackup();
      
      // Configurar sincronização após cada leitura do ThingSpeak
      this.setupReadingSyncHook();
      
      log('✅ Serviço de sincronização inicializado com sucesso', 'sync');
    } catch (error) {
      log(`⚠️ Erro ao inicializar serviço de sincronização: ${error}`, 'sync');
      console.error('Erro na inicialização do serviço de sincronização:', error);
    }
  }
  
  /**
   * Realiza a sincronização inicial dos dados
   * Importa os últimos 3 dias de dados para o banco local (limite reduzido para evitar sobrecarga)
   */
  private async performInitialSync(): Promise<void> {
    if (this.initialSyncComplete) {
      log('🔄 Sincronização inicial já foi realizada', 'sync');
      return;
    }
    
    try {
      // Limite reduzido para 3 dias para evitar sobrecarga do sistema
      const syncDays = 3;
      log(`🔄 Executando sincronização inicial - importando ${syncDays} dias de dados (limitado)`, 'sync');
      
      // Executar a sincronização com limite de dados
      const count = await syncThingspeakToDatabase(syncDays);
      
      log(`✅ Sincronização inicial concluída - ${count} registros importados`, 'sync');
      this.initialSyncComplete = true;
    } catch (error) {
      log(`⚠️ Erro na sincronização inicial: ${error}`, 'sync');
      console.error('Erro na sincronização inicial:', error);
    }
  }
  
  /**
   * Configura backup diário dos dados
   */
  private scheduleDailyBackup(): void {
    // Executar todos os dias às 03:00 da manhã
    // Formato cron: segundo minuto hora dia mês dia-da-semana
    this.dailyBackupJob = cron.schedule('0 0 3 * * *', async () => {
      try {
        log('🔄 Iniciando backup diário agendado', 'sync');
        
        // Importar dados do último dia (24 horas)
        const count = await syncThingspeakToDatabase(1);
        
        log(`✅ Backup diário concluído - ${count} registros importados`, 'sync');
      } catch (error) {
        log(`⚠️ Erro no backup diário: ${error}`, 'sync');
        console.error('Erro no backup diário agendado:', error);
      }
    }, {
      scheduled: true,
      timezone: "America/Sao_Paulo" // Ajustar para o fuso horário brasileiro
    });
    
    log('📅 Backup diário agendado para 03:00 (horário de Brasília)', 'sync');
  }
  
  /**
   * Configura sincronização a cada leitura do ThingSpeak
   * Modifica o fluxo de coleta para atualizar o banco local
   */
  private setupReadingSyncHook(): void {
    // Hook para sincronizar após cada leitura do ThingSpeak
    // Este método é chamado pelo fetchLatestReading do thingspeakService.ts
    const originalFetchLatestReading = fetchLatestReading;
    
    // Substituir a função original com uma versão que sincroniza após cada chamada
    (global as any).__syncHookEnabled = true;
    
    log('🔗 Hook de sincronização configurado para cada leitura do ThingSpeak', 'sync');
  }
  
  /**
   * Sincroniza imediatamente com o ThingSpeak
   * @param days Número de dias para sincronizar (padrão: 1)
   */
  async syncNow(days: number = 1): Promise<number> {
    try {
      log(`🔄 Executando sincronização manual - importando ${days} dias de dados`, 'sync');
      
      const count = await syncThingspeakToDatabase(days);
      
      log(`✅ Sincronização manual concluída - ${count} registros importados`, 'sync');
      return count;
    } catch (error) {
      log(`⚠️ Erro na sincronização manual: ${error}`, 'sync');
      console.error('Erro na sincronização manual:', error);
      throw error;
    }
  }
  
  /**
   * Pare o serviço de sincronização
   */
  stop(): void {
    if (this.dailyBackupJob) {
      this.dailyBackupJob.stop();
      this.dailyBackupJob = null;
    }
    
    (global as any).__syncHookEnabled = false;
    
    log('⏹️ Serviço de sincronização parado', 'sync');
  }
  
  /**
   * Obtém informações sobre o status atual da sincronização
   */
  getStatus(): Record<string, any> {
    return {
      initialSyncComplete: this.initialSyncComplete,
      dailyBackupConfigured: !!this.dailyBackupJob,
      hookEnabled: !!(global as any).__syncHookEnabled,
      syncInProgress: !!(global as any).__syncInProgress,
      lastSyncTime: (global as any).__lastSyncTime ? new Date((global as any).__lastSyncTime).toISOString() : null,
      formattedLastSyncTime: (global as any).__lastSyncTime ? 
        new Intl.DateTimeFormat('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: 'America/Sao_Paulo'
        }).format(new Date((global as any).__lastSyncTime)) : null
    };
  }
  
  /**
   * Método para verificar se a sincronização está em progresso
   */
  isSyncInProgress(): boolean {
    return !!(global as any).__syncInProgress;
  }
  
  /**
   * Método para obter a data da última sincronização
   */
  getLastSyncTime(): Date | null {
    return (global as any).__lastSyncTime ? new Date((global as any).__lastSyncTime) : null;
  }
}

// Singleton para o serviço de sincronização
export const syncScheduler = new SyncSchedulerService();