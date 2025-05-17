/**
 * Sistema simples de fila para ThingSpeak
 * 
 * Escreve nos campos imediatamente após serem gerados,
 * respeitando um intervalo de 5 segundos entre escritas sucessivas.
 */
import fetch from 'node-fetch';
import { THINGSPEAK_BASE_URL, THINGSPEAK_WRITE_API_KEY } from './thingspeakConfig';

// Intervalo mínimo entre atualizações (5 segundos)
const MIN_UPDATE_INTERVAL = 5000;

// Último momento em que uma atualização foi enviada
let lastUpdateTime = 0;

/**
 * Atualiza um campo no ThingSpeak, respeitando o intervalo mínimo
 */
export async function updateField(field: string, value: string | number): Promise<boolean> {
  const now = Date.now();
  const timeElapsed = now - lastUpdateTime;
  
  // Se a última atualização foi há menos de 5 segundos, aguarde
  if (lastUpdateTime > 0 && timeElapsed < MIN_UPDATE_INTERVAL) {
    const waitTime = MIN_UPDATE_INTERVAL - timeElapsed;
    console.log(`⏱️ Aguardando ${waitTime}ms antes de enviar atualização ao ThingSpeak...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  // Enviar a atualização
  const success = await sendUpdate(field, value);
  
  // Se bem-sucedido, atualizar o momento da última atualização
  if (success) {
    lastUpdateTime = Date.now();
  }
  
  return success;
}

/**
 * Envia uma atualização para o ThingSpeak
 */
async function sendUpdate(field: string, value: string | number): Promise<boolean> {
  try {
    console.log(`📤 Enviando atualização para ThingSpeak: ${field}=${value}`);
    
    // Adicionar timestamp para evitar cache
    const timestamp = Date.now();
    const url = `${THINGSPEAK_BASE_URL}/update?api_key=${THINGSPEAK_WRITE_API_KEY}&${field}=${value}&t=${timestamp}`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }
    
    const data = await response.text();
    const entryId = parseInt(data.trim());
    
    if (entryId > 0) {
      console.log(`✅ Atualização enviada com sucesso: ${field}=${value} (ID: ${entryId})`);
      return true;
    } else {
      console.warn(`⚠️ ThingSpeak retornou 0 para ${field}. Possível erro ou limite de taxa excedido.`);
      return false;
    }
    
  } catch (error) {
    console.error(`❌ Erro ao atualizar ThingSpeak (${field}):`, error);
    return false;
  }
}

// Funções específicas para cada campo
export function updatePumpStatus(status: boolean): Promise<boolean> {
  return updateField('field3', status ? '1' : '0');
}

export function updateHeaterStatus(status: boolean): Promise<boolean> {
  return updateField('field4', status ? '1' : '0');
}

export function updateOperationMode(isAutomatic: boolean): Promise<boolean> {
  return updateField('field5', isAutomatic ? '1' : '0');
}

export function updateTargetTemperature(temperature: number): Promise<boolean> {
  return updateField('field6', temperature.toString());
}

export function updatePumpOnTimer(seconds: number): Promise<boolean> {
  return updateField('field7', seconds.toString());
}

export function updatePumpOffTimer(seconds: number): Promise<boolean> {
  return updateField('field8', seconds.toString());
}