/**
 * Sistema de envio em lotes para o ThingSpeak
 * 
 * Este serviço gerencia o envio de dados em lotes para o ThingSpeak,
 * respeitando o limite de 15 segundos entre atualizações da API gratuita.
 */
import fetch from 'node-fetch';
import { THINGSPEAK_BASE_URL, THINGSPEAK_WRITE_API_KEY } from './thingspeakConfig';

// Configurações
const BATCH_INTERVAL = 17000; // 17 segundos (maior que o limite de 15s do ThingSpeak)
const MAX_RETRIES = 3;

// Fila de atualizações
interface QueueItem {
  field: string;
  value: string | number;
  resolve: (success: boolean) => void;
  added: number;
}

// Estado do gerenciador
const queue: QueueItem[] = [];
let isProcessing = false;
let lastSendTime = 0;

/**
 * Adiciona um item à fila de atualização
 */
export function queueUpdate(field: string, value: string | number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    queue.push({
      field,
      value,
      resolve,
      added: Date.now()
    });
    
    console.log(`🔄 Adicionado à fila ThingSpeak: ${field}=${value} (itens na fila: ${queue.length})`);
    
    // Iniciar o processamento se não estiver rodando
    if (!isProcessing) {
      processQueue();
    }
  });
}

/**
 * Processa a fila de atualizações
 */
async function processQueue(): Promise<void> {
  if (isProcessing || queue.length === 0) {
    return;
  }
  
  isProcessing = true;
  
  try {
    // Verificar intervalo desde o último envio
    const now = Date.now();
    const elapsed = now - lastSendTime;
    
    if (lastSendTime > 0 && elapsed < BATCH_INTERVAL) {
      // Aguardar o tempo necessário
      const waitTime = BATCH_INTERVAL - elapsed;
      console.log(`⏱️ Aguardando ${Math.ceil(waitTime/1000)}s antes do próximo envio ao ThingSpeak...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Consolidar os campos (manter apenas o valor mais recente de cada campo)
    const fieldMap = new Map<string, QueueItem>();
    
    // Processar a fila inteira
    queue.forEach(item => {
      fieldMap.set(item.field, item);
    });
    
    // Converter para array
    const batch = Array.from(fieldMap.values());
    
    if (batch.length > 0) {
      console.log(`📦 Enviando lote com ${batch.length} campos para o ThingSpeak...`);
      
      // Enviar o lote
      const success = await sendBatch(batch);
      
      // Processar resultados
      if (success) {
        // Notificar sucesso para todos os itens no lote
        batch.forEach(item => {
          item.resolve(true);
        });
        
        // Remover itens processados da fila
        const processedFields = new Set(batch.map(item => item.field));
        const newQueue = queue.filter(item => !processedFields.has(item.field));
        
        // Limpar e repopular a fila
        queue.length = 0;
        queue.push(...newQueue);
        
        console.log(`✅ Lote enviado com sucesso! Restam ${queue.length} itens na fila.`);
      } else {
        // Verificar itens antigos para remover da fila
        const MAX_AGE = BATCH_INTERVAL * MAX_RETRIES;
        const now = Date.now();
        
        // Filtrar itens antigos
        const newQueue = queue.filter(item => {
          const age = now - item.added;
          const isTooOld = age > MAX_AGE;
          
          // Notificar falha para itens muito antigos
          if (isTooOld) {
            item.resolve(false);
            return false;
          }
          
          return true;
        });
        
        // Atualizar a fila
        queue.length = 0;
        queue.push(...newQueue);
        
        console.log(`⚠️ Falha ao enviar lote. Tentando novamente no próximo ciclo. ${queue.length} itens restantes.`);
      }
      
      // Atualizar timestamp do último envio
      lastSendTime = Date.now();
    }
  } catch (error) {
    console.error('❌ Erro ao processar fila ThingSpeak:', error);
  } finally {
    isProcessing = false;
    
    // Se ainda houver itens na fila, agendar próximo processamento
    if (queue.length > 0) {
      setTimeout(processQueue, 1000);
    }
  }
}

/**
 * Envia um lote de atualizações para o ThingSpeak
 */
async function sendBatch(items: QueueItem[]): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Construir URL com todos os campos
      const url = new URL(`${THINGSPEAK_BASE_URL}/update`);
      url.searchParams.append('api_key', THINGSPEAK_WRITE_API_KEY);
      
      // Adicionar cada campo ao lote
      items.forEach(item => {
        url.searchParams.append(item.field, item.value.toString());
      });
      
      // Adicionar timestamp para evitar cache
      url.searchParams.append('t', Date.now().toString());
      
      console.log(`🔄 Enviando lote ao ThingSpeak (tentativa ${attempt}/${MAX_RETRIES})...`);
      
      // Timeout para garantir resposta
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const data = await response.text();
      const entryId = parseInt(data.trim());
      
      if (entryId === 0) {
        console.warn('⚠️ ThingSpeak retornou 0. Pode indicar limite de taxa ou erro.');
        
        if (attempt < MAX_RETRIES) {
          // Exponential backoff
          const backoff = Math.pow(2, attempt) * 1000;
          console.log(`⏳ Aguardando ${backoff/1000}s antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }
      } else {
        console.log(`✅ ThingSpeak atualizou com sucesso: Entry ID ${entryId}`);
        return true;
      }
    } catch (error) {
      console.error(`❌ Erro ao enviar lote (tentativa ${attempt}/${MAX_RETRIES}):`, error);
      
      if (attempt < MAX_RETRIES) {
        // Exponential backoff
        const backoff = Math.pow(2, attempt) * 1000;
        console.log(`⏳ Aguardando ${backoff/1000}s antes da próxima tentativa...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
  }
  
  console.error(`❌ Todas as ${MAX_RETRIES} tentativas falharam`);
  return false;
}

// Funções de conveniência para campos específicos
export function updatePumpStatus(status: boolean): Promise<boolean> {
  return queueUpdate('field3', status ? '1' : '0');
}

export function updateHeaterStatus(status: boolean): Promise<boolean> {
  return queueUpdate('field4', status ? '1' : '0');
}

export function updateOperationMode(isAutomatic: boolean): Promise<boolean> {
  return queueUpdate('field5', isAutomatic ? '1' : '0');
}

export function updateTargetTemperature(temperature: number): Promise<boolean> {
  return queueUpdate('field6', temperature.toString());
}

export function updatePumpOnTimer(seconds: number): Promise<boolean> {
  return queueUpdate('field7', seconds.toString());
}

export function updatePumpOffTimer(seconds: number): Promise<boolean> {
  return queueUpdate('field8', seconds.toString());
}

// Iniciar o processamento
setInterval(processQueue, BATCH_INTERVAL);
console.log('✅ Sistema de envio em lotes ThingSpeak inicializado');