// ThingSpeak configuration and types
import dotenv from 'dotenv';

dotenv.config();

// ThingSpeak API keys and settings
// Canal 1 (2886349) - Leitura de sensores e escrita de comandos
export const THINGSPEAK_READ_API_KEY = process.env.THINGSPEAK_READ_API_KEY || 'HKYT3SCF97WUG6OI';
export const THINGSPEAK_WRITE_API_KEY = process.env.THINGSPEAK_WRITE_API_KEY || 'OQKOVTQQJ4I0PIPQ'; // Write API Key para os campos 3-8
export const THINGSPEAK_CHANNEL_ID = process.env.THINGSPEAK_CHANNEL_ID || '2886349';

// Canal 2 (2533413) - Leitura do status dos dispositivos
export const THINGSPEAK_CHANNEL2_ID = process.env.THINGSPEAK_CHANNEL2_ID || '2533413';
export const THINGSPEAK_CHANNEL2_READ_API_KEY = process.env.THINGSPEAK_CHANNEL2_READ_API_KEY || '7ORUZSCMCUEUAQ3Z';
export const THINGSPEAK_CHANNEL2_READ_API_KEY2 = process.env.THINGSPEAK_CHANNEL2_READ_API_KEY2 || 'NP6140GVLTDE32EU';
export const THINGSPEAK_CHANNEL2_READ_API_KEY3 = process.env.THINGSPEAK_CHANNEL2_READ_API_KEY3 || 'MQHVTWV9OGC023EK';

export const THINGSPEAK_BASE_URL = 'https://api.thingspeak.com';

// Field mappings for ThingSpeak fields
export const THINGSPEAK_FIELD_MAPPINGS = {
  // Campos apenas para leitura
  temperature: 'field1',    // Temperatura em °C
  level: 'field2',          // Nível da água em cm
  
  // Campos apenas para escrita
  pumpStatus: 'field3',     // Bomba: Desligar: 0, Ligar: 1
  heaterStatus: 'field4',   // Aquecedor: Desligar: 0, Ligar: 1
  operationMode: 'field5',  // Modo: Manual=0, Automático=1
  targetTemp: 'field6',     // Temperatura alvo em °C
  pumpOnTimer: 'field7',    // Timer bomba ligada em segundos
  pumpOffTimer: 'field8'    // Timer bomba desligada em segundos
};

// Default values when ThingSpeak data is missing
export const DEFAULT_READING = {
  temperature: 25.0,
  level: 75.0,
  pumpStatus: false,
  heaterStatus: false,
  operationMode: false,     // false = manual, true = automático
  targetTemp: 26.0,         // temperatura alvo padrão
  pumpOnTimer: 60,          // 60 segundos ligada por padrão
  pumpOffTimer: 30,         // 30 segundos desligada por padrão
  timestamp: new Date()
};

// Helper function to parse numbers from ThingSpeak
export function parseThingspeakNumber(value: any): number {
  // Se valor nulo ou indefinido, retorna 0
  if (value === null || value === undefined) return 0;
  
  // Lida com valores do tipo string
  if (typeof value === 'string') {
    const parsedValue = parseFloat(value.replace(',', '.'));
    return !isNaN(parsedValue) ? parsedValue : 0;
  }
  
  // Processa valores numéricos 
  const parsedValue = parseFloat(String(value));
  return !isNaN(parsedValue) ? parsedValue : 0;
}

// Helper to parse boolean values (0/1) from ThingSpeak
export function parseThingspeakBoolean(value: any): boolean {
  // Valores nulos, indefinidos ou vazios são sempre FALSE
  if (value === null || value === undefined || value === '') return false;
  
  // Valores de string específicos '0', 'false' são FALSE
  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === '0' || normalizedValue === 'false') {
      return false;
    }
    return normalizedValue === '1' || normalizedValue === 'true';
  }
  
  // Para zero numérico retornamos FALSE, para outros números como 1 retornamos TRUE
  if (typeof value === 'number') {
    return value !== 0;
  }
  
  // Para qualquer outro tipo, convertemos para booleano
  return !!value;
}

// Type for ThingSpeak response
export interface ThingspeakResponse {
  created_at?: string;
  entry_id?: number;
  field1?: string | number | null;
  field2?: string | number | null;
  field3?: string | number | null;
  field4?: string | number | null;
  field5?: string | number | null;
  field6?: string | number | null;
  field7?: string | number | null;
  field8?: string | number | null;
}

// Type for ThingSpeak feeds response (historical data)
export interface ThingspeakFeedsResponse {
  channel?: {
    id: number;
    name: string;
    description: string;
    created_at: string;
    updated_at: string;
  };
  feeds?: ThingspeakResponse[];
}