/**
 * Sistema para controlar o envio de atualizações ao ThingSpeak
 * com um intervalo mínimo de 5 segundos entre atualizações
 */
import { THINGSPEAK_BASE_URL, THINGSPEAK_WRITE_API_KEY } from './thingspeakConfig';
import fetch from 'node-fetch';

// Intervalo mínimo entre atualizações
const MIN_UPDATE_INTERVAL = 5000; // 5 segundos

// Controle de tempo para cada campo
interface FieldTimers {
  [field: string]: number;
}

// Armazena o último momento de atualização de cada campo
const lastUpdateTime: FieldTimers = {};

/**
 * Atualiza um campo no ThingSpeak respeitando o intervalo mínimo
 * @param field Campo do ThingSpeak (field1, field2, etc)
 * @param value Valor a ser enviado
 * @returns Promise<boolean> indicando sucesso ou falha
 */
export async function delayedUpdate(field: string, value: string | number): Promise<boolean> {
  const now = Date.now();
  const lastTime = lastUpdateTime[field] || 0;
  const elapsed = now - lastTime;
  
  // Se não passou tempo suficiente desde a última atualização
  if (lastTime > 0 && elapsed < MIN_UPDATE_INTERVAL) {
    const waitTime = MIN_UPDATE_INTERVAL - elapsed;
    console.log(`⏱️ Aguardando ${waitTime}ms antes de enviar ${field}=${value} ao ThingSpeak...`);
    
    // Aguardar pelo tempo necessário
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  try {
    console.log(`📤 Enviando atualização: ${field}=${value} ao ThingSpeak`);
    
    // Montar URL com timestamp para evitar cache
    const url = new URL(`${THINGSPEAK_BASE_URL}/update`);
    url.searchParams.append('api_key', THINGSPEAK_WRITE_API_KEY);
    url.searchParams.append(field, value.toString());
    url.searchParams.append('t', Date.now().toString());
    
    // Fazer a requisição com timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    // Verificar resposta
    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }
    
    const data = await response.text();
    const entryId = parseInt(data.trim());
    
    if (entryId === 0) {
      console.warn(`⚠️ ThingSpeak retornou 0 para ${field}. Pode indicar limite de taxa excedido.`);
      return false;
    }
    
    // Registrar o momento desta atualização
    lastUpdateTime[field] = Date.now();
    console.log(`✅ Atualização enviada com sucesso: ${field}=${value} (Entry ID: ${entryId})`);
    return true;
    
  } catch (error) {
    console.error(`❌ Erro ao atualizar ${field}:`, error);
    return false;
  }
}

// Função auxiliar para campos específicos
export function updatePumpStatus(status: boolean): Promise<boolean> {
  return delayedUpdate('field3', status ? '1' : '0');
}

export function updateHeaterStatus(status: boolean): Promise<boolean> {
  return delayedUpdate('field4', status ? '1' : '0');
}

export function updateOperationMode(isAutomatic: boolean): Promise<boolean> {
  return delayedUpdate('field5', isAutomatic ? '1' : '0');
}

export function updateTargetTemperature(temperature: number): Promise<boolean> {
  return delayedUpdate('field6', temperature.toString());
}

export function updatePumpOnTimer(seconds: number): Promise<boolean> {
  return delayedUpdate('field7', seconds.toString());
}

export function updatePumpOffTimer(seconds: number): Promise<boolean> {
  return delayedUpdate('field8', seconds.toString());
}