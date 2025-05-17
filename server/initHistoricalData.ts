/**
 * Script para inicialização das tabelas de dados históricos e
 * realização da primeira agregação dos dados existentes
 */

import { 
  initHistoricalDatabase, 
  processHistoricalData, 
  logSystemEvent 
} from './services/historicalDataService';

async function main() {
  try {
    console.log('🔄 Iniciando configuração de dados históricos...');
    
    // Inicializar tabelas
    await initHistoricalDatabase();
    console.log('✅ Tabelas de dados históricos criadas com sucesso!');
    
    // Calcular período para agregação (todo o banco)
    // Vamos buscar desde 01/01/2000 até a data atual
    const startDate = new Date('2000-01-01').getTime();
    const endDate = Date.now();
    
    console.log(`🔄 Processando dados históricos de ${new Date(startDate).toLocaleString()} até ${new Date(endDate).toLocaleString()}`);
    console.log('⚠️ Isso pode levar alguns minutos dependendo do volume de dados...');
    
    // Executar agregações
    const result = await processHistoricalData(startDate, endDate);
    
    console.log('✅ Agregação de dados históricos concluída!');
    console.log(`📊 Resultados:
    - Registros horários: ${result.hourly}
    - Registros diários: ${result.daily}
    - Registros semanais: ${result.weekly}
    - Registros mensais: ${result.monthly}
    `);
    
    await logSystemEvent(
      'info', 
      'Inicialização de dados históricos concluída', 
      `Agregados ${result.hourly} registros horários, ${result.daily} diários, ${result.weekly} semanais e ${result.monthly} mensais.`
    );
    
    console.log('✨ Processo finalizado com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro durante inicialização dos dados históricos:', error);
    await logSystemEvent(
      'error', 
      'Erro na inicialização de dados históricos', 
      error instanceof Error ? error.message : String(error)
    );
  }
}

main().catch(console.error);