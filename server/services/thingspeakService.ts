// ThingSpeak Service for fetching and updating data
import fetch from 'node-fetch';
import { InsertReading } from '@shared/schema';
import { automationService } from './automationService';
import { emulatorService } from './emulatorService';
import { 
  THINGSPEAK_BASE_URL,
  THINGSPEAK_CHANNEL_ID, 
  THINGSPEAK_READ_API_KEY,
  THINGSPEAK_WRITE_API_KEY,
  THINGSPEAK_CHANNEL2_ID,
  THINGSPEAK_CHANNEL2_READ_API_KEY,
  THINGSPEAK_CHANNEL2_READ_API_KEY2,
  THINGSPEAK_CHANNEL2_READ_API_KEY3,
  DEFAULT_READING,
  parseThingspeakNumber,
  parseThingspeakBoolean,
  ThingspeakResponse,
  ThingspeakFeedsResponse
} from './thingspeakConfig';

// Interface para os valores de feedback do ThingSpeak
interface FeedbackValues {
  pumpStatus: boolean;
  heaterStatus: boolean;
  operationMode: boolean;
  targetTemp: number;
  pumpOnTimer: number;
  pumpOffTimer: number;
  pumpFlow: number; // Vazão da bomba (0-100%)
  lastUpdate: string;
}

// Set the refresh interval (in milliseconds)
// Atualizado para 5 minutos (300,000ms) para reduzir carga no backend e otimizar gravações no banco
export const REFRESH_INTERVAL = parseInt(process.env.REFRESH_INTERVAL || '300000');

/**
 * Variável para manter o estado mais recente dos dispositivos em memória
 * Esse estado é SEMPRE mais atual que o banco de dados, pois reflete a última ação do usuário
 * mesmo antes da confirmação do ThingSpeak, que pode levar até 30 segundos.
 * 
 * Este estado é usado para fornecer feedback imediato na interface enquanto aguardamos
 * a confirmação do ThingSpeak.
 */
let currentDeviceStatus = {
  pumpStatus: false,
  heaterStatus: false,
  operationMode: false,  // false = manual, true = automático
  targetTemp: 26.0,      // temperatura alvo padrão
  pumpOnTimer: 60,       // 60 segundos ligada por padrão
  pumpOffTimer: 30,      // 30 segundos desligada por padrão
  pumpFlow: 50,          // 50% de vazão padrão da bomba
  lastUpdate: new Date()
};

/**
 * Função para obter informações do Canal 2 do ThingSpeak
 * (Canal de feedback que exibe os valores aplicados no sistema)
 * Tenta múltiplas chaves de API em caso de falha
 */
async function getThingspeakFeedbackChannel(): Promise<FeedbackValues | null> {
  console.log("📡 Consultando canal de feedback (Canal 2) do ThingSpeak...");
  const timestamp = new Date().getTime();
  
  // Lista de chaves de API para tentar sequencialmente
  const apiKeys = [
    THINGSPEAK_CHANNEL2_READ_API_KEY,
    THINGSPEAK_CHANNEL2_READ_API_KEY2,
    THINGSPEAK_CHANNEL2_READ_API_KEY3
  ];
  
  // Tentativa com cada chave de API
  for (let i = 0; i < apiKeys.length; i++) {
    try {
      const currentKey = apiKeys[i];
      
      const response = await fetch(
        `${THINGSPEAK_BASE_URL}/channels/${THINGSPEAK_CHANNEL2_ID}/feeds.json?api_key=${currentKey}&results=1&t=${timestamp}`,
        { 
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        }
      );
      
      if (!response.ok) {
        console.warn(`⚠️ Falha com a chave de API #${i+1}. Status: ${response.status}`);
        continue; // Tenta a próxima chave
      }
      
      const data = await response.json() as ThingspeakFeedsResponse;
      
      if (!data.feeds || data.feeds.length === 0) {
        console.warn(`⚠️ Nenhum dado encontrado no Canal 2 com a chave #${i+1}.`);
        continue; // Tenta a próxima chave
      }
      
      const latestFeed = data.feeds[0];
      console.log("📊 Dados do Canal 2 (feedback):", latestFeed);
      
      // Mapear os valores do Canal 2 de acordo com a documentação:
      // Field 1 = Bomba Ligado=1 Desligado=0 (valor de field3 do Canal 1)
      // Field 2 = Aquecedor Ligado=1 Desligado=0 (valor de field4 do Canal 1)
      // Field 3 = Modo Funcionamento: Automatico=1 Manual=0 (valor de field5 do Canal 1)
      // Field 4 = valor de field6 do Canal 1 (temperatura alvo)
      // Field 5 = valor de field7 do Canal 1 (bomba on timer)
      // Field 6 = valor de field8 do Canal 1 (bomba off timer)
      return {
        pumpStatus: parseThingspeakBoolean(latestFeed.field1),
        heaterStatus: parseThingspeakBoolean(latestFeed.field2),
        operationMode: parseThingspeakBoolean(latestFeed.field3),
        targetTemp: parseThingspeakNumber(latestFeed.field4),
        pumpOnTimer: parseThingspeakNumber(latestFeed.field5),
        pumpOffTimer: parseThingspeakNumber(latestFeed.field6),
        pumpFlow: 50, // Valor padrão, já que não temos esse campo específico no feedback
        lastUpdate: latestFeed.created_at ? new Date(latestFeed.created_at).toISOString() : new Date().toISOString()
      };
    } catch (error) {
      console.error(`❌ Erro ao consultar canal de feedback com a chave #${i+1}:`, error);
      // Continue para a próxima chave
    }
  }
  
  // Se todas as tentativas falharem
  console.error("❌ Todas as tentativas de consulta ao Canal 2 falharam");
  return null;
}

/**
 * Função para garantir consistência dos valores no ThingSpeak
 * Esta função é chamada periodicamente para sincronizar o estado dos dispositivos
 */
async function ensureConsistentDeviceState() {
  try {
    console.log("🔄 Verificando consistência dos valores no ThingSpeak...");
    
    // Primeiro, tentamos obter dados do canal de feedback (Canal 2)
    // que reflete os valores que foram realmente aplicados no sistema
    const feedbackValues = await getThingspeakFeedbackChannel();
    
    // Se não conseguimos dados do canal de feedback, usamos o Canal 1
    if (!feedbackValues) {
      console.log("⚠️ Usando Canal 1 para verificação de consistência (fallback)");
      const timestamp = new Date().getTime();
      
      const response = await fetch(
        `${THINGSPEAK_BASE_URL}/channels/${THINGSPEAK_CHANNEL_ID}/feeds.json?api_key=${THINGSPEAK_READ_API_KEY}&results=1&t=${timestamp}`,
        { 
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP Error! Status: ${response.status}`);
      }
      
      const data = await response.json() as ThingspeakFeedsResponse;
      
      if (!data.feeds || data.feeds.length === 0) {
        console.log("⚠️ Nenhum dado encontrado no ThingSpeak (Canal 1).");
        return;
      }
      
      const latestFeed = data.feeds[0];
      
      // Usar os valores do Canal 1 (menos confiáveis que o Canal 2)
      // Verificar se há discrepância entre o valor em memória e o valor do ThingSpeak
      const thingspeakPumpStatus = parseThingspeakBoolean(latestFeed.field3);
      const thingspeakHeaterStatus = parseThingspeakBoolean(latestFeed.field4);
      const thingspeakOperationMode = parseThingspeakBoolean(latestFeed.field5);
      const thingspeakTargetTemp = parseThingspeakNumber(latestFeed.field6);
      const thingspeakPumpOnTimer = parseThingspeakNumber(latestFeed.field7);
      const thingspeakPumpOffTimer = parseThingspeakNumber(latestFeed.field8);
      
      // Verificar mudanças nos valores
      updateStatusWithChanges({
        pumpStatus: thingspeakPumpStatus,
        heaterStatus: thingspeakHeaterStatus,
        operationMode: thingspeakOperationMode,
        targetTemp: thingspeakTargetTemp,
        pumpOnTimer: thingspeakPumpOnTimer,
        pumpOffTimer: thingspeakPumpOffTimer,
        pumpFlow: 50, // Valor padrão para vazão da bomba, já que não vem do ThingSpeak
        lastUpdate: latestFeed.created_at ? new Date(latestFeed.created_at).toISOString() : new Date().toISOString()
      });
    } else {
      // Verificar a data da última atualização do Canal 2
      const feedbackDate = new Date(feedbackValues.lastUpdate || Date.now());
      const memoryDate = new Date(currentDeviceStatus.lastUpdate || Date.now());
      
      console.log(`📊 Data da última atualização do Canal 2: ${feedbackDate.toISOString()}`);
      console.log(`📊 Data da última atualização em memória: ${memoryDate.toISOString()}`);
      
      // Se os dados do Canal 2 forem mais recentes que o estado em memória
      // ou se a diferença for menor que 10 segundos, atualizamos o estado
      if (feedbackDate > memoryDate || 
          Math.abs(feedbackDate.getTime() - memoryDate.getTime()) < 10000) {
        console.log("✅ Usando dados do Canal 2 (mais recentes ou dentro da janela de tolerância)");
        updateStatusWithChanges(feedbackValues);
      } else {
        console.log("⚠️ Canal 2 desatualizado, mantendo estado em memória");
        // Verificar se há necessidade de enviar os valores em memória para o ThingSpeak
        // para garantir sincronização
        const needsSync = feedbackValues.targetTemp !== currentDeviceStatus.targetTemp ||
                          feedbackValues.pumpOnTimer !== currentDeviceStatus.pumpOnTimer ||
                          feedbackValues.pumpOffTimer !== currentDeviceStatus.pumpOffTimer;
                          
        if (needsSync) {
          console.log("🔄 Sincronizando configurações em memória com ThingSpeak...");
          
          // Sincronizar temperatura alvo
          if (feedbackValues.targetTemp !== currentDeviceStatus.targetTemp) {
            await updateTargetTemperature(currentDeviceStatus.targetTemp);
          }
          
          // Sincronizar temporizador de bomba ligada
          if (feedbackValues.pumpOnTimer !== currentDeviceStatus.pumpOnTimer) {
            await updatePumpOnTimer(currentDeviceStatus.pumpOnTimer);
          }
          
          // Sincronizar temporizador de bomba desligada
          if (feedbackValues.pumpOffTimer !== currentDeviceStatus.pumpOffTimer) {
            await updatePumpOffTimer(currentDeviceStatus.pumpOffTimer);
          }
        }
      }
    }
    
  } catch (error) {
    console.error("❌ Erro ao verificar consistência:", error);
  }
}

/**
 * Atualiza o status em memória com os valores recebidos, registrando mudanças
 */
function updateStatusWithChanges(newValues: FeedbackValues) {
  // Verifica se algum dos campos foi alterado
  let changed = false;
  let changesLog = [];
  
  if (newValues.pumpStatus !== currentDeviceStatus.pumpStatus) {
    changed = true;
    changesLog.push(`Bomba: ${currentDeviceStatus.pumpStatus ? 'ON' : 'OFF'} -> ${newValues.pumpStatus ? 'ON' : 'OFF'}`);
    currentDeviceStatus.pumpStatus = newValues.pumpStatus;
  }
  
  // No modo automático, ignoramos as atualizações do status do aquecedor vindas do ThingSpeak
  // O aquecedor só deve ser alterado manualmente pelo usuário no frontend
  if (newValues.heaterStatus !== currentDeviceStatus.heaterStatus && !newValues.operationMode) {
    changed = true;
    changesLog.push(`Aquecedor: ${currentDeviceStatus.heaterStatus ? 'ON' : 'OFF'} -> ${newValues.heaterStatus ? 'ON' : 'OFF'}`);
    currentDeviceStatus.heaterStatus = newValues.heaterStatus;
  } else if (newValues.operationMode && newValues.heaterStatus !== currentDeviceStatus.heaterStatus) {
    // Se estamos no modo automático e houve mudança no aquecedor, registramos o evento mas não aplicamos
    changesLog.push(`Aquecedor: Alteração ignorada no modo automático (${newValues.heaterStatus ? 'ON' : 'OFF'})`);
  }
  
  if (newValues.operationMode !== currentDeviceStatus.operationMode) {
    changed = true;
    changesLog.push(`Modo: ${currentDeviceStatus.operationMode ? 'Auto' : 'Manual'} -> ${newValues.operationMode ? 'Auto' : 'Manual'}`);
    currentDeviceStatus.operationMode = newValues.operationMode;
  }
  
  if (newValues.targetTemp !== currentDeviceStatus.targetTemp && newValues.targetTemp > 0) {
    changed = true;
    changesLog.push(`Temperatura Alvo: ${currentDeviceStatus.targetTemp}°C -> ${newValues.targetTemp}°C`);
    currentDeviceStatus.targetTemp = newValues.targetTemp;
  }
  
  if (newValues.pumpOnTimer !== currentDeviceStatus.pumpOnTimer && newValues.pumpOnTimer > 0) {
    changed = true;
    changesLog.push(`Timer Ligada: ${currentDeviceStatus.pumpOnTimer}s -> ${newValues.pumpOnTimer}s`);
    currentDeviceStatus.pumpOnTimer = newValues.pumpOnTimer;
  }
  
  if (newValues.pumpOffTimer !== currentDeviceStatus.pumpOffTimer && newValues.pumpOffTimer > 0) {
    changed = true;
    changesLog.push(`Timer Desligada: ${currentDeviceStatus.pumpOffTimer}s -> ${newValues.pumpOffTimer}s`);
    currentDeviceStatus.pumpOffTimer = newValues.pumpOffTimer;
  }
  
  if (newValues.pumpFlow !== currentDeviceStatus.pumpFlow && newValues.pumpFlow >= 0) {
    changed = true;
    changesLog.push(`Vazão da Bomba: ${currentDeviceStatus.pumpFlow}% -> ${newValues.pumpFlow}%`);
    currentDeviceStatus.pumpFlow = newValues.pumpFlow;
    
    // Atualizar no emulador a vazão da bomba
    if (emulatorService) {
      emulatorService.updateControlState(undefined, undefined, newValues.pumpFlow);
      console.log(`🔄 Vazão da bomba também atualizada no emulador: ${newValues.pumpFlow}%`);
    }
  }
  
  if (changed) {
    currentDeviceStatus.lastUpdate = new Date();
    console.log(`⚠️ Discrepâncias detectadas:`);
    changesLog.forEach(log => console.log(`  - ${log}`));
    console.log(`✅ Estado em memória atualizado com sucesso.`);
  } else {
    console.log("✅ Estado dos dispositivos está consistente.");
  }
}

// Executar a verificação de consistência a cada 2 minutos
setInterval(ensureConsistentDeviceState, 2 * 60 * 1000);

// Executar uma verificação inicial após 10 segundos
setTimeout(ensureConsistentDeviceState, 10000);

/**
 * Retorna o estado atual dos dispositivos em memória (cópia para evitar modificação externa)
 * 
 * IMPORTANTE: Este estado reflete a última ação solicitada pelo usuário e é mais recente
 * que o estado no banco ou no ThingSpeak. Use-o para feedback imediato na interface.
 */
export function getCurrentDeviceStatus() {
  return { 
    pumpStatus: currentDeviceStatus.pumpStatus,
    heaterStatus: currentDeviceStatus.heaterStatus,
    operationMode: currentDeviceStatus.operationMode,
    targetTemp: currentDeviceStatus.targetTemp,
    pumpOnTimer: currentDeviceStatus.pumpOnTimer,
    pumpOffTimer: currentDeviceStatus.pumpOffTimer,
    pumpFlow: currentDeviceStatus.pumpFlow,
    lastUpdate: new Date(currentDeviceStatus.lastUpdate.getTime())
  };
}

/**
 * Função pública para obter os valores do canal de feedback (Canal 2)
 * Esta função é útil para checar o estado atual dos dispositivos no sistema físico
 */
export async function getFeedbackChannelStatus() {
  try {
    // Primeiro tenta obter o estado do Canal 2
    const feedbackValues = await getThingspeakFeedbackChannel();
    
    if (feedbackValues) {
      return {
        source: 'feedback-channel',
        ...feedbackValues,
        timestamp: new Date()
      };
    }
    
    // Se não conseguiu do Canal 2, retorna o estado em memória
    return {
      source: 'memory',
      pumpStatus: currentDeviceStatus.pumpStatus,
      heaterStatus: currentDeviceStatus.heaterStatus,
      operationMode: currentDeviceStatus.operationMode,
      targetTemp: currentDeviceStatus.targetTemp,
      pumpOnTimer: currentDeviceStatus.pumpOnTimer,
      pumpOffTimer: currentDeviceStatus.pumpOffTimer,
      timestamp: new Date()
    };
  } catch (error) {
    console.error('❌ Erro ao obter status do canal de feedback:', error);
    // Em caso de erro, retorna o estado em memória
    return {
      source: 'memory-fallback',
      pumpStatus: currentDeviceStatus.pumpStatus,
      heaterStatus: currentDeviceStatus.heaterStatus,
      operationMode: currentDeviceStatus.operationMode,
      targetTemp: currentDeviceStatus.targetTemp,
      pumpOnTimer: currentDeviceStatus.pumpOnTimer,
      pumpOffTimer: currentDeviceStatus.pumpOffTimer,
      timestamp: new Date()
    };
  }
}

// Helper function to parse numbers safely
function parseNumber(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') {
    return parseFloat(value.replace(',', '.'));
  }
  return parseFloat(value) || 0;
}

/**
 * Fetches the latest reading from ThingSpeak
 */
export async function fetchLatestReading(retries = 3): Promise<InsertReading | null> {
  const timeout = 2000; // 2 seconds timeout para resposta mais rápida
  
  // Primeiro tenta buscar o último dado
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`📡 Fetching data from ThingSpeak (attempt ${attempt}/${retries})...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      // Busca os dados mais recentes com o parâmetro results=1 para melhor desempenho
      // Adiciona timestamp para evitar cache do navegador/proxy
      const timestamp = new Date().getTime();
      const response = await fetch(
        `${THINGSPEAK_BASE_URL}/channels/${THINGSPEAK_CHANNEL_ID}/feeds.json?api_key=${THINGSPEAK_READ_API_KEY}&results=1&t=${timestamp}`,
        { 
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        }
      );
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP Error! Status: ${response.status}`);
      }
      
      const text = await response.text();
      console.log('📩 Raw ThingSpeak response:', text.substring(0, 200) + '...');
      
      let feedsData: ThingspeakFeedsResponse;
      try {
        feedsData = JSON.parse(text);
      } catch (e) {
        console.error('❌ Error parsing JSON:', e);
        throw new Error('Invalid ThingSpeak response');
      }
      
      if (!feedsData || !feedsData.feeds || feedsData.feeds.length === 0) {
        console.log('⚠️ No data received from ThingSpeak');
        return getDefaultReading();
      }
      
      // Buscar o dado mais recente que tenha temperatura ou nível não nulo
      let data: ThingspeakResponse | null = null;
      
      // Primeiro tenta encontrar um registro com campo1 (temperatura) não nulo
      for (const feed of feedsData.feeds) {
        if (feed.field1 !== null && feed.field1 !== undefined) {
          data = feed;
          break;
        }
      }
      
      // Se não encontrou com temperatura, usa o último registro
      if (!data) {
        data = feedsData.feeds[feedsData.feeds.length - 1];
      }
      
      console.log('📊 Original ThingSpeak data:', data);
      
      // Criar leitura com valores do ThingSpeak, mas sempre com um timestamp atual
      // para garantir dados que pareçam estar em tempo real
      
      // Campos 1 e 2 são apenas para leitura - sempre trazer esses dados
      const temperature = parseThingspeakNumber(data.field1);
      const level = parseThingspeakNumber(data.field2);
      
      // Campos 3-8 são apenas para escrita - utilizamos valores em memória
      // Usamos o valor do ThingSpeak apenas se estiver disponível
      const reading: InsertReading = {
        temperature: temperature,
        level: level,
        pump_status: currentDeviceStatus.pumpStatus ? 1 : 0,
        heater_status: currentDeviceStatus.heaterStatus ? 1 : 0,
        timestamp: new Date() // Sempre usar a data atual para simular dados em tempo real
      };
      
      console.log('✅ Formatted reading:', reading);
      
      // Verificar se o hook de sincronização está habilitado
      if ((global as any).__syncHookEnabled) {
        // Usar importação dinâmica ES6 ao invés de require para evitar dependência circular
        try {
          // Usando import() dinâmico que retorna uma Promise
          import('../syncDatabase').then(module => {
            const { syncThingspeakToDatabase } = module;
            
            // Executar sincronização em background para não bloquear a leitura atual
            setTimeout(async () => {
              try {
                console.log("🔄 Hook de sincronização ativado - importando dados recentes");
                await syncThingspeakToDatabase(1);
              } catch (syncError) {
                console.error("⚠️ Erro na sincronização após leitura:", syncError);
              }
            }, 1000);
          }).catch(err => {
            console.error("⚠️ Erro ao importar módulo de sincronização (ES6):", err);
          });
        } catch (importError) {
          console.error("⚠️ Erro geral na importação:", importError);
        }
      }
      
      return reading;
      
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error);
      if (attempt === retries) {
        console.log('⚠️ All attempts failed. Using default values.');
        return getDefaultReading();
      }
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  
  return getDefaultReading();
}

/**
 * Updates a single field on ThingSpeak
 * Versão mais robusta com múltiplas tentativas
 */
export async function updateField(field: string, value: string | number, retries: number = 3): Promise<boolean> {
  // Implementação com retry
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Adicionar timestamp para evitar cache
      const timestamp = new Date().getTime();
      
      const url = new URL(`${THINGSPEAK_BASE_URL}/update`);
      url.searchParams.append('api_key', THINGSPEAK_WRITE_API_KEY);
      url.searchParams.append(field, value.toString());
      url.searchParams.append('t', timestamp.toString());
      
      console.log(`Enviando requisição para ThingSpeak: ${field}=${value} (tentativa ${attempt}/${retries})`);
      
      // Usar um timeout mais longo para garantir resposta
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 segundos
      
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const updateResult = await response.text();
      console.log(`✅ ThingSpeak update result for ${field}: ${updateResult}`);
      
      // ThingSpeak retorna o ID da atualização quando bem-sucedido ou 0 em caso de erro
      if (updateResult !== '0') {
        return true; // Operação bem-sucedida
      } else {
        console.warn(`⚠️ ThingSpeak retornou 0 para ${field}. Pode indicar limite de taxa ou erro.`);
        // Se não for a última tentativa, espere um tempo antes de tentar novamente
        if (attempt < retries) {
          console.log(`⏳ Aguardando ${attempt * 2} segundos antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 2000)); // Espera progressiva
        }
      }
    } catch (error) {
      console.error(`❌ Error updating ${field} (attempt ${attempt}/${retries}):`, error);
      // Se não for a última tentativa, espere um tempo antes de tentar novamente
      if (attempt < retries) {
        console.log(`⏳ Aguardando ${attempt} segundos antes da próxima tentativa...`);
        await new Promise(resolve => setTimeout(resolve, attempt * 1000)); // Espera progressiva
      }
    }
  }
  
  // Se chegou aqui, todas as tentativas falharam
  console.error(`❌ All ${retries} attempts to update ${field} failed`);
  return false;
}

/**
 * Updates pump status on ThingSpeak (field3)
 * Também atualiza o emulador para garantir consistência quando no modo virtual
 */
export async function updatePumpStatus(status: boolean): Promise<boolean> {
  // Atualizar variável em memória com o status atual
  currentDeviceStatus.pumpStatus = status;
  currentDeviceStatus.lastUpdate = new Date();
  
  // Atualizar também o emulador para garantir consistência
  if (emulatorService) {
    // Usar o método específico para atualizar o emulador
    emulatorService.updateControlState(status, undefined);
    console.log(`🔄 Status da bomba também atualizado no emulador: ${status ? 'LIGADA' : 'DESLIGADA'}`);
  }
  
  return updateField('field3', status ? '1' : '0');
}

/**
 * Updates heater status on ThingSpeak (field4)
 * Também atualiza o emulador para garantir consistência quando no modo virtual
 */
export async function updateHeaterStatus(status: boolean): Promise<boolean> {
  // O aquecedor pode ser controlado independentemente do modo de operação
  // Atualizar variável em memória com o status atual
  currentDeviceStatus.heaterStatus = status;
  currentDeviceStatus.lastUpdate = new Date();
  
  // Atualizar também o emulador para garantir consistência
  if (emulatorService) {
    // Usar o método específico para atualizar o emulador
    emulatorService.updateControlState(undefined, status);
    console.log(`🔄 Status do aquecedor também atualizado no emulador: ${status ? 'LIGADO' : 'DESLIGADO'}`);
  }
  
  // Lógica normal: true -> '1', false -> '0'
  return updateField('field4', status ? '1' : '0');
}

/**
 * Updates operation mode on ThingSpeak (field5)
 * Manual = 0, Automático = 1
 */
export async function updateOperationMode(isAutomatic: boolean): Promise<boolean> {
  // Atualizar variável em memória com o status atual
  currentDeviceStatus.operationMode = isAutomatic;
  currentDeviceStatus.lastUpdate = new Date();
  
  // Preservar a targetTemp atual - não resetar para valor padrão ao mudar modos
  // Este é o ponto chave para manter a temperatura alvo ao alternar modos
  
  return updateField('field5', isAutomatic ? '1' : '0');
}

/**
 * Updates target temperature on ThingSpeak (field6)
 */
export async function updateTargetTemperature(temperature: number): Promise<boolean> {
  // Garantir que a temperatura está em um range razoável
  const safeTemp = Math.max(18, Math.min(32, temperature));
  
  // Atualizar variável em memória
  currentDeviceStatus.targetTemp = safeTemp;
  currentDeviceStatus.lastUpdate = new Date();
  
  return updateField('field6', safeTemp.toString());
}

/**
 * Updates pump ON timer on ThingSpeak (field7)
 * Tempo em segundos para manter a bomba ligada
 */
export async function updatePumpOnTimer(seconds: number): Promise<boolean> {
  // Garantir que o valor é positivo e razoável
  const safeSeconds = Math.max(0, Math.min(3600, seconds)); // máximo 1 hora
  
  // Atualizar variável em memória
  currentDeviceStatus.pumpOnTimer = safeSeconds;
  currentDeviceStatus.lastUpdate = new Date();
  
  // Atualizar também o temporizador no serviço de automação
  try {
    // Acessar serviço de automação diretamente
    if (automationService) {
      automationService.updateTimers(safeSeconds, currentDeviceStatus.pumpOffTimer || 30);
      console.log(`✅ Timer de bomba ligada também atualizado no serviço de automação: ${safeSeconds}s`);
    }
  } catch (error) {
    console.error('⚠️ Erro ao atualizar timer no serviço de automação:', error);
  }
  
  return updateField('field7', safeSeconds.toString());
}

/**
 * Updates pump OFF timer on ThingSpeak (field8)
 * Tempo em segundos para manter a bomba desligada
 */
export async function updatePumpOffTimer(seconds: number): Promise<boolean> {
  // Garantir que o valor é positivo e razoável
  const safeSeconds = Math.max(0, Math.min(3600, seconds)); // máximo 1 hora
  
  // Atualizar variável em memória
  currentDeviceStatus.pumpOffTimer = safeSeconds;
  currentDeviceStatus.lastUpdate = new Date();
  
  // Atualizar também o temporizador no serviço de automação
  try {
    // Acessar serviço de automação diretamente
    if (typeof automationService !== 'undefined' && automationService) {
      automationService.updateTimers(currentDeviceStatus.pumpOnTimer || 30, safeSeconds);
      console.log(`✅ Timer de bomba desligada também atualizado no serviço de automação: ${safeSeconds}s`);
    }
  } catch (error) {
    console.error('⚠️ Erro ao atualizar timer no serviço de automação:', error);
  }
  
  return updateField('field8', safeSeconds.toString());
}

/**
 * Updates pump flow on ThingSpeak (field5)
 * Também atualiza o emulador para garantir consistência quando no modo virtual
 * Valor de 0-100% para a vazão da bomba
 */
export async function updatePumpFlow(flowPercent: number): Promise<boolean> {
  // Garantir que o valor está no range 0-100
  const safeFlow = Math.max(0, Math.min(100, flowPercent));
  
  // Atualizar variável em memória
  currentDeviceStatus.pumpFlow = safeFlow;
  currentDeviceStatus.lastUpdate = new Date();
  
  // Atualizar também o emulador para garantir consistência
  if (emulatorService) {
    // Usar o método específico para atualizar o emulador com a vazão da bomba
    emulatorService.updateControlState(undefined, undefined, safeFlow);
    console.log(`🔄 Vazão da bomba também atualizada no emulador: ${safeFlow}%`);
  }
  
  return updateField('field5', safeFlow.toString());
}

/**
 * Updates both devices status on ThingSpeak simultaneously (maintained for backward compatibility)
 * 
 * IMPORTANTE: Este método também atualiza a variável em memória como as funções
 * individuais updatePumpStatus e updateHeaterStatus fazem, garantindo feedback imediato
 * na interface do usuário enquanto aguardamos a confirmação do ThingSpeak.
 */
export async function updateDeviceStatus(pumpStatus: boolean, heaterStatus: boolean): Promise<boolean> {
  try {
    // PRIMEIRO: Atualizar variáveis em memória para feedback imediato
    currentDeviceStatus.pumpStatus = pumpStatus;
    currentDeviceStatus.heaterStatus = heaterStatus;
    currentDeviceStatus.lastUpdate = new Date();
    
    // Obter dados do emulador para enviar junto
    let temperature = 0;
    let level = 0;
    let operationMode = currentDeviceStatus.operationMode;
    let targetTemp = currentDeviceStatus.targetTemp;
    let pumpOnTimer = currentDeviceStatus.pumpOnTimer;
    let pumpOffTimer = currentDeviceStatus.pumpOffTimer;
    
    // Atualizar também o emulador para garantir consistência
    if (emulatorService) {
      // Usar o método específico para atualizar o emulador
      emulatorService.updateControlState(pumpStatus, heaterStatus);
      
      // Capturar os valores atuais do emulador para campos 1 e 2
      const config = emulatorService.getConfig();
      temperature = config.sensorRanges.waterTemp.current;
      level = config.sensorRanges.waterLevel.current / 100; // Converter para percentual 0-1
      
      console.log(`🔄 Status dos dispositivos também atualizado no emulador:
        Bomba: ${pumpStatus ? 'LIGADA' : 'DESLIGADA'}
        Aquecedor: ${heaterStatus ? 'LIGADO' : 'DESLIGADO'}`);
    }
    
    // Adicionar timestamp para evitar cache
    const timestamp = new Date().getTime();
    
    const url = new URL(`${THINGSPEAK_BASE_URL}/update`);
    url.searchParams.append('api_key', THINGSPEAK_WRITE_API_KEY);
    
    // Enviar todos os campos de uma vez para o ThingSpeak
    url.searchParams.append('field1', temperature.toString());
    // Converter o nível de água para percentual (0-100) ao invés de decimal (0-1)
    url.searchParams.append('field2', (level * 100).toString());
    url.searchParams.append('field3', pumpStatus ? '1' : '0');
    url.searchParams.append('field4', heaterStatus ? '1' : '0');
    url.searchParams.append('field5', operationMode ? '1' : '0');
    url.searchParams.append('field6', targetTemp.toString());
    url.searchParams.append('field7', pumpOnTimer.toString());
    url.searchParams.append('field8', pumpOffTimer.toString());
    url.searchParams.append('t', timestamp.toString());
    
    console.log(`🔄 Enviando atualização completa para ThingSpeak com todos os campos`);
    
    // Usar um timeout mais longo para atualizações múltiplas
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status}`);
    }
    
    const updateResult = await response.text();
    console.log(`✅ ThingSpeak update result: ${updateResult}`);
    return updateResult !== '0';
    
  } catch (error) {
    console.error('❌ Error updating device status on ThingSpeak:', error);
    return false;
  }
}

/**
 * Fetches historical readings from ThingSpeak
 * @param days Number of days to fetch (default: 7)
 */
export async function fetchHistoricalReadings(days = 7): Promise<InsertReading[]> {
  try {
    // Calcular período de datas
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const startDateStr = startDate.toISOString();
    const endDateStr = endDate.toISOString();
    
    // Adicionar timestamp para evitar cache
    const timestamp = new Date().getTime();
    
    const url = new URL(`${THINGSPEAK_BASE_URL}/channels/${THINGSPEAK_CHANNEL_ID}/feeds.json`);
    url.searchParams.append('api_key', THINGSPEAK_READ_API_KEY);
    url.searchParams.append('start', startDateStr);
    url.searchParams.append('end', endDateStr);
    url.searchParams.append('results', '1000'); // Limitado para evitar sobrecarga (máximo permitido é 8000)
    url.searchParams.append('t', timestamp.toString());
    
    // Usar timeout mais longo para dados históricos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos
    
    console.log(`Fetching ${days} days of data directly from ThingSpeak with timeout...`);
    
    const response = await fetch(url.toString(), {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status}`);
    }
    
    const data = await response.json() as ThingspeakFeedsResponse;
    
    if (!data.feeds || data.feeds.length === 0) {
      return [];
    }
    
    // Para dados históricos, mantemos os timestamps originais
    return data.feeds.map(feed => {
      // Apenas os campos 1 e 2 são para leitura, os demais usamos os valores em memória
      return {
        temperature: parseThingspeakNumber(feed.field1),
        level: parseThingspeakNumber(feed.field2),
        pumpStatus: currentDeviceStatus.pumpStatus,  // Valor atual em memória
        heaterStatus: currentDeviceStatus.heaterStatus, // Valor atual em memória
        timestamp: feed.created_at ? new Date(feed.created_at) : new Date()
      };
    });
    
  } catch (error) {
    console.error('Error fetching historical data from ThingSpeak:', error);
    return [];
  }
}

/**
 * Get default reading when ThingSpeak fails
 */
function getDefaultReading(): InsertReading {
  return {
    ...DEFAULT_READING,
    // Usar valores atuais em memória para status de dispositivos
    pump_status: currentDeviceStatus.pumpStatus ? 1 : 0,
    heater_status: currentDeviceStatus.heaterStatus ? 1 : 0,
    timestamp: new Date()
  };
}