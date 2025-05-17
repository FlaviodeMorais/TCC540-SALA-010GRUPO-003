/**
 * ThingspeakBatchService
 * 
 * Este serviço implementa um sistema de lotes para envio de dados ao ThingSpeak,
 * respeitando o limite de taxa da API gratuita (15 segundos entre envios).
 * 
 * As requisições são agrupadas a cada 17 segundos para garantir uma margem de segurança.
 */
import fetch from 'node-fetch';
import { THINGSPEAK_BASE_URL, THINGSPEAK_WRITE_API_KEY } from './thingspeakConfig';

// Configuração do serviço
const BATCH_INTERVAL_MS = 17000; // 17 segundos entre envios (acima do mínimo de 15s do ThingSpeak)
const MAX_ITEMS_PER_BATCH = 8;   // Máximo de campos atualizáveis (field1-field8)
const MAX_RETRIES = 3;           // Número máximo de tentativas para cada lote

// Inicializar o sistema de lotes
export function initBatchService() {
  console.log('✅ Sistema de lotes ThingSpeak inicializado com sucesso');
  // Iniciar o processador de fila
  setInterval(processQueue, BATCH_INTERVAL_MS);
}

// Interface para itens na fila
interface QueueItem {
  field: string;
  value: string | number;
  callback?: (success: boolean, entryId?: number) => void;
  timestamp: number;
}

// Estado interno do serviço
const updateQueue: QueueItem[] = [];
let isProcessingQueue = false;
let lastBatchSentAt = 0;

/**
 * Adiciona um item à fila para atualização em lote
 * @param field Campo do ThingSpeak (field1, field2, etc.)
 * @param value Valor a ser enviado
 * @returns Promessa que será resolvida quando o item for processado
 */
export function queueUpdate(field: string, value: string | number): Promise<boolean> {
  return new Promise((resolve) => {
    // Adicionar à fila com callback para notificar resultado
    updateQueue.push({
      field,
      value,
      callback: (success) => resolve(success),
      timestamp: Date.now()
    });
    
    console.log(`🔄 Adicionado à fila do ThingSpeak: ${field}=${value} (itens na fila: ${updateQueue.length})`);
    
    // Iniciar processamento se não estiver em andamento
    if (!isProcessingQueue) {
      processQueue();
    }
  });
}

/**
 * Processa a fila de atualizações em lotes
 */
async function processQueue(): Promise<void> {
  if (isProcessingQueue) return;
  
  isProcessingQueue = true;
  
  try {
    while (updateQueue.length > 0) {
      const now = Date.now();
      const timeElapsedSinceLastBatch = now - lastBatchSentAt;
      
      // Respeitar o intervalo mínimo entre lotes
      if (lastBatchSentAt > 0 && timeElapsedSinceLastBatch < BATCH_INTERVAL_MS) {
        const waitTime = BATCH_INTERVAL_MS - timeElapsedSinceLastBatch;
        console.log(`⏱️ Aguardando ${Math.ceil(waitTime/1000)}s para respeitar limite de taxa do ThingSpeak...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      // Usar Map para consolidar campos duplicados (o mais recente prevalece)
      const fieldMap = new Map<string, QueueItem>();
      
      // Pegar os próximos itens (até o máximo permitido)
      for (let i = 0; i < updateQueue.length && fieldMap.size < MAX_ITEMS_PER_BATCH; i++) {
        const item = updateQueue[i];
        fieldMap.set(item.field, item);
      }
      
      // Converter Map em array
      const batchItems = Array.from(fieldMap.values());
      
      if (batchItems.length === 0) {
        break;
      }
      
      console.log(`📦 Enviando lote com ${batchItems.length} atualizações para o ThingSpeak...`);
      
      // Enviar o lote
      const success = await sendBatch(batchItems);
      
      if (success) {
        // Remover os itens processados
        const processedFields = new Set(batchItems.map(item => item.field));
        const newQueue = updateQueue.filter(item => !processedFields.has(item.field));
        updateQueue.length = 0; // Limpar o array original
        updateQueue.push(...newQueue); // Adicionar os itens não processados
        
        console.log(`✅ Lote processado com sucesso. Restam ${updateQueue.length} itens na fila.`);
      } else {
        // Remover apenas itens que ultrapassaram número máximo de tentativas
        const MAX_TIME_IN_QUEUE = MAX_RETRIES * BATCH_INTERVAL_MS;
        const currentTime = Date.now();
        const newQueue = updateQueue.filter(item => {
          const timeInQueue = currentTime - item.timestamp;
          const removeItem = timeInQueue > MAX_TIME_IN_QUEUE;
          
          if (removeItem && item.callback) {
            // Notificar falha para callbacks pendentes
            item.callback(false);
          }
          
          return !removeItem;
        });
        
        updateQueue.length = 0; // Limpar o array original
        updateQueue.push(...newQueue); // Adicionar os itens filtrados
        
        console.log(`⚠️ Falha ao processar lote. Itens restantes na fila: ${updateQueue.length}`);
      }
      
      // Atualizar timestamp da última tentativa
      lastBatchSentAt = Date.now();
    }
  } catch (error) {
    console.error('❌ Erro ao processar fila do ThingSpeak:', error);
  } finally {
    isProcessingQueue = false;
    
    // Se ainda houver itens, agendar próximo processamento
    if (updateQueue.length > 0) {
      setTimeout(processQueue, BATCH_INTERVAL_MS);
    }
  }
}

/**
 * Envia um lote de atualizações para o ThingSpeak
 * @param items Itens a serem enviados no lote
 * @returns Verdadeiro se o envio foi bem-sucedido
 */
async function sendBatch(items: QueueItem[]): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Construir URL com todos os campos
      const timestamp = Date.now();
      const url = new URL(`${THINGSPEAK_BASE_URL}/update`);
      url.searchParams.append('api_key', THINGSPEAK_WRITE_API_KEY);
      
      // Adicionar cada campo
      items.forEach(item => {
        url.searchParams.append(item.field, item.value.toString());
      });
      
      // Adicionar timestamp para evitar cache
      url.searchParams.append('t', timestamp.toString());
      
      console.log(`📤 Enviando lote para ThingSpeak (tentativa ${attempt}/${MAX_RETRIES})...`);
      
      // Timeout maior para garantir resposta
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos
      
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
      
      const data = await response.text();
      const entryId = parseInt(data.trim());
      
      console.log(`✅ ThingSpeak batch update result: entry ID ${entryId}`);
      
      if (entryId === 0) {
        console.warn('⚠️ ThingSpeak retornou 0. Pode indicar limite de taxa ou erro.');
        
        if (attempt < MAX_RETRIES) {
          // Exponential backoff
          const backoff = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
          console.log(`⏳ Aguardando ${backoff/1000} segundos antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }
      } else {
        // Notificar sucesso para cada callback
        items.forEach(item => {
          if (item.callback) {
            item.callback(true, entryId);
          }
        });
        
        return true;
      }
    } catch (error) {
      console.error(`❌ Erro ao enviar lote para ThingSpeak (tentativa ${attempt}/${MAX_RETRIES}):`, error);
      
      if (attempt < MAX_RETRIES) {
        // Exponential backoff
        const backoff = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
        console.log(`⏳ Aguardando ${backoff/1000} segundos antes da próxima tentativa...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
    }
  }
  
  console.error(`❌ Todas as ${MAX_RETRIES} tentativas de envio do lote falharam`);
  return false;
}