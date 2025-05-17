// Configuração para acesso direto ao ThingSpeak quando hospedado no GitHub Pages
// Este arquivo é utilizado apenas na versão implantada, não na versão de desenvolvimento

// Verificamos se estamos em ambiente GitHub Pages
const isGithubPages = import.meta.env.VITE_GITHUB_PAGES === 'true';

// Base URL da API - no GitHub Pages, usamos a API hospedada no Render
export const API_BASE_URL = isGithubPages 
  ? import.meta.env.VITE_API_BASE_URL || 'https://aquaponia-api.onrender.com'
  : '';

// Configuração do ThingSpeak para acesso direto quando necessário
export const THINGSPEAK_CONFIG = {
  CHANNEL_ID: import.meta.env.VITE_THINGSPEAK_CHANNEL_ID || '2840207',
  READ_API_KEY: import.meta.env.VITE_THINGSPEAK_READ_API_KEY || '5UWNQD21RD2A7QHG',
  WRITE_API_KEY: import.meta.env.VITE_THINGSPEAK_WRITE_API_KEY || '9NG6QLIN8UXLE2AH',
  BASE_URL: 'https://api.thingspeak.com',
};

// Flag para determinar se o frontend deve usar ThingSpeak diretamente
// Isso é útil quando hospedado em GitHub Pages sem backend próprio
export const USE_THINGSPEAK_DIRECT = isGithubPages || 
  import.meta.env.VITE_USE_THINGSPEAK_DIRECT === 'true';

// Flag para permitir controle direto dos dispositivos via ThingSpeak
// Em produção, normalmente é falso por questões de segurança
export const DIRECT_DEVICE_CONTROL = import.meta.env.VITE_DIRECT_DEVICE_CONTROL === 'true';

// Campos do ThingSpeak
export const THINGSPEAK_FIELD_MAPPINGS = {
  WATER_TEMP: 'field1',
  WATER_LEVEL: 'field2',
  PUMP_STATUS: 'field3',
  HEATER_STATUS: 'field4'
};

// Funções para compatibilidade com código existente
export function isGitHubPagesEnv(): boolean {
  return isGithubPages;
}

export function isDirectDeviceControlEnabled(): boolean {
  return DIRECT_DEVICE_CONTROL;
}

export function getBaseUrl(): string {
  return THINGSPEAK_CONFIG.BASE_URL;
}

export function getThingspeakChannelId(): string {
  return THINGSPEAK_CONFIG.CHANNEL_ID;
}

export function getThingspeakReadApiKey(): string {
  return THINGSPEAK_CONFIG.READ_API_KEY;
}

export function getThingspeakWriteApiKey(): string {
  return THINGSPEAK_CONFIG.WRITE_API_KEY;
}

export function getThingspeakBaseUrl(): string {
  return THINGSPEAK_CONFIG.BASE_URL;
}

// Função para obter URL base da API com tratamento de barras
export function getApiUrl(endpoint: string): string {
  const baseUrl = API_BASE_URL;
  
  // Se não houver baseUrl (ambiente de desenvolvimento), mantenha apenas o endpoint
  if (!baseUrl) {
    return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  }
  
  // Remove barras extras entre baseUrl e endpoint
  const formattedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  return `${formattedBase}${formattedEndpoint}`;
}