import { apiRequest } from "./queryClient";
import { Reading } from "@shared/schema";
import { 
  getBaseUrl, 
  getThingspeakChannelId, 
  getThingspeakReadApiKey,
  getThingspeakWriteApiKey,
  getThingspeakBaseUrl, 
  isDirectDeviceControlEnabled,
  isGitHubPagesEnv
} from "./api-config";

export type ReadingsResponse = {
  readings: Reading[];
  setpoints: {
    temp: {
      min: number;
      max: number;
    };
    level: {
      min: number;
      max: number;
    };
  };
};

/**
 * Interface que representa o estado atual dos dispositivos
 * Inclui o estado oficial do banco de dados e o estado em memória (mais recente)
 * Também indica se há uma sincronização pendente entre eles
 */
export type DeviceStatusResponse = {
  // Estado principal que a interface exibe por padrão (normalmente do banco)
  timestamp: string | number;
  pumpStatus: boolean;
  heaterStatus: boolean;
  operationMode: boolean; // true = Automático, false = Manual
  
  // Metadados sobre o estado
  pendingSync?: boolean;
  source: 'memory' | 'database' | 'hybrid';
  
  // Estado em memória (atualizações mais recentes que podem não estar no banco ainda)
  memoryState?: {
    timestamp: string | number;
    pumpStatus: boolean;
    heaterStatus: boolean;
    operationMode: boolean; // true = Automático, false = Manual
    targetTemp?: number;
    pumpOnTimer?: number;
    pumpOffTimer?: number;
    lastUpdate?: string | Date;
  };
  
  // Estado do banco (oficial, confirmado pelo ThingSpeak)
  databaseState?: {
    timestamp: string | number;
    pumpStatus?: boolean;
    heaterStatus?: boolean;
    operationMode?: boolean; // true = Automático, false = Manual
  } | null;
};

export type HistoricalReadingsResponse = ReadingsResponse & {
  stats: {
    temperature: {
      avg: number;
      min: number;
      max: number;
      stdDev: number;
    };
    level: {
      avg: number;
      min: number;
      max: number;
      stdDev: number;
    };
  };
};

// Função auxiliar para acessar diretamente o ThingSpeak quando no GitHub Pages
async function fetchFromThingspeak(endpoint: string): Promise<any> {
  const baseUrl = getBaseUrl();
  const readApiKey = getThingspeakReadApiKey();
  const url = `${baseUrl}${endpoint}&api_key=${readApiKey}`;
  const response = await fetch(url);
  return response.json();
}

// Get latest readings - with GitHub Pages support
export async function getLatestReadings(limit = 60): Promise<ReadingsResponse> {
  // Adicionar timestamp para evitar cache e melhorar desempenho
  const timestamp = new Date().getTime();
  
  // Se estamos no GitHub Pages, usar API do ThingSpeak diretamente
  if (isGitHubPagesEnv()) {
    try {
      // Buscar a última leitura do ThingSpeak
      const data = await fetchFromThingspeak(
        `/channels/${getThingspeakChannelId()}/feeds.json?results=10`
      );
      
      // Valores padrão para setpoints
      const defaultSetpoints = {
        temp: { min: 25, max: 30 },
        level: { min: 40, max: 80 }
      };
      
      // Transformar resposta do ThingSpeak no formato esperado
      const readings: Reading[] = (data.feeds || []).map((feed: any, index: number) => ({
        id: index,
        temperature: parseFloat(feed.field1) || 0,
        level: parseFloat(feed.field2) || 0,
        pumpStatus: feed.field3 === '1' || feed.field3 === 1,
        heaterStatus: feed.field4 === '1' || feed.field4 === 1,
        timestamp: new Date(feed.created_at).getTime()
      })).reverse();
      
      return {
        readings,
        setpoints: defaultSetpoints
      };
      
    } catch (error) {
      console.error('Erro ao buscar dados do ThingSpeak:', error);
      // Fallback com dados vazios
      return {
        readings: [],
        setpoints: {
          temp: { min: 25, max: 30 },
          level: { min: 40, max: 80 }
        }
      };
    }
  }
  
  // Comportamento normal usando a API local
  const res = await apiRequest("GET", `/api/readings/latest?limit=${limit}&t=${timestamp}`, undefined, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
  return res.json();
}

// Get historical readings from database or ThingSpeak
export async function getHistoricalReadings(
  startDate: string,
  endDate: string,
  periodType: 'daily' | 'monthly' = 'daily'
): Promise<HistoricalReadingsResponse> {
  // Se estamos no GitHub Pages, usar ThingSpeak diretamente
  if (isGitHubPagesEnv()) {
    try {
      // Calcular o número de dias entre as datas
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // Buscar dados do ThingSpeak
      return await getThingspeakDataDirect(diffDays || 7);
    } catch (error) {
      console.error('Erro ao buscar dados históricos do ThingSpeak:', error);
      return getEmptyHistoricalData();
    }
  }
  
  try {
    // Tentar primeiro usar a nova API de dados agregados
    console.log(`Buscando dados históricos agregados (${periodType}) de ${startDate} até ${endDate}`);
    const res = await apiRequest(
      "GET",
      `/api/historical-data?startDate=${startDate}&endDate=${endDate}&periodType=${periodType}`
    );
    const aggregatedData = await res.json();
    
    // Converter os dados agregados para o formato esperado pelo frontend
    if (aggregatedData.success && aggregatedData.historicalData && aggregatedData.historicalData.length > 0) {
      return convertAggregatedDataToHistoricalResponse(aggregatedData.historicalData, startDate, endDate);
    }
    
    // Se não houver dados agregados, cair para o comportamento antigo como backup
    console.log("Sem dados agregados disponíveis, usando API legada");
    const legacyRes = await apiRequest(
      "GET",
      `/api/readings/history?startDate=${startDate}&endDate=${endDate}`
    );
    return legacyRes.json();
  } catch (error) {
    console.error('Erro ao buscar dados históricos agregados:', error);
    
    // Em caso de erro, tentar o endpoint antigo como fallback
    try {
      console.log("Usando API legada após erro");
      const legacyRes = await apiRequest(
        "GET",
        `/api/readings/history?startDate=${startDate}&endDate=${endDate}`
      );
      return legacyRes.json();
    } catch (fallbackError) {
      console.error('Erro ao buscar dados históricos (fallback):', fallbackError);
      return getEmptyHistoricalData();
    }
  }
}

// Função auxiliar para obter dados históricos diretamente do ThingSpeak
async function getThingspeakDataDirect(days: number = 7): Promise<HistoricalReadingsResponse> {
  try {
    // Buscar dados históricos do ThingSpeak
    const data = await fetchFromThingspeak(
      `/channels/${getThingspeakChannelId()}/feeds.json?days=${days}`
    );
    
    // Valores padrão para setpoints
    const defaultSetpoints = {
      temp: { min: 25, max: 30 },
      level: { min: 40, max: 80 }
    };
    
    // Transformar resposta do ThingSpeak no formato esperado
    const readings: Reading[] = (data.feeds || []).map((feed: any, index: number) => ({
      id: index,
      temperature: parseFloat(feed.field1) || 0,
      level: parseFloat(feed.field2) || 0,
      pumpStatus: feed.field3 === '1' || feed.field3 === 1,
      heaterStatus: feed.field4 === '1' || feed.field4 === 1,
      timestamp: new Date(feed.created_at).getTime()
    }));
    
    // Calcular estatísticas básicas
    const temps = readings.map(r => r.temperature).filter(t => t > 0);
    const levels = readings.map(r => r.level).filter(l => l > 0);
    
    const stats = {
      temperature: {
        avg: calculateAverage(temps),
        min: Math.min(...temps, 0),
        max: Math.max(...temps, 0),
        stdDev: calculateStdDev(temps)
      },
      level: {
        avg: calculateAverage(levels),
        min: Math.min(...levels, 0),
        max: Math.max(...levels, 0),
        stdDev: calculateStdDev(levels)
      }
    };
    
    return {
      readings,
      setpoints: defaultSetpoints,
      stats
    };
  } catch (error) {
    console.error('Erro ao buscar dados históricos do ThingSpeak:', error);
    return getEmptyHistoricalData();
  }
}

// Funções auxiliares para cálculos estatísticos
function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateStdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = calculateAverage(values);
  const squareDiffs = values.map(value => Math.pow(value - avg, 2));
  const avgSquareDiff = calculateAverage(squareDiffs);
  return Math.sqrt(avgSquareDiff);
}

// Retorna dados históricos vazios com valores padrão
function getEmptyHistoricalData(): HistoricalReadingsResponse {
  return {
    readings: [],
    setpoints: {
      temp: { min: 25, max: 30 },
      level: { min: 40, max: 80 }
    },
    stats: {
      temperature: { avg: 0, min: 0, max: 0, stdDev: 0 },
      level: { avg: 0, min: 0, max: 0, stdDev: 0 }
    }
  };
}

// Converte dados agregados da nova API para o formato esperado pelo frontend
function convertAggregatedDataToHistoricalResponse(
  historicalData: any[],
  startDate: string,
  endDate: string
): HistoricalReadingsResponse {
  try {
    // Expandir os dados agregados em mais pontos para melhorar a visualização
    const expandedReadings: Reading[] = [];
    let idCounter = 0;
    
    // Para cada registro diário/mensal, vamos gerar vários pontos ao longo do dia/mês
    historicalData.forEach(record => {
      // Determinar quantos pontos gerar com base no tipo (diário ou mensal)
      const isPeriodTypeDaily = record.period_type === 'daily';
      // Gerar 24 pontos por dia (1 a cada hora) ou 30 pontos por mês (1 a cada dia)
      const pointsToGenerate = isPeriodTypeDaily ? 24 : 30;
      
      // Timestamp base (início do dia/mês)
      const baseTimestamp = typeof record.date === 'number' ? record.date : new Date(record.date).getTime();
      
      // Incremento de tempo (em ms) entre cada ponto
      const timeIncrement = isPeriodTypeDaily 
        ? 3600000 // 1 hora em ms para dados diários
        : 86400000; // 1 dia em ms para dados mensais
      
      // Gerar os pontos distribuídos ao longo do período
      for (let i = 0; i < pointsToGenerate; i++) {
        // Variação aleatória sutil (±5%) para evitar linhas retas nos gráficos
        const tempRandomFactor = 0.95 + Math.random() * 0.1; // 0.95 a 1.05
        const levelRandomFactor = 0.95 + Math.random() * 0.1; // 0.95 a 1.05
        
        // Timestamp específico para este ponto
        const pointTimestamp = baseTimestamp + (i * timeIncrement);
        
        // Adicionar o ponto expandido
        expandedReadings.push({
          id: idCounter++,
          temperature: (record.avg_temperature || 0) * tempRandomFactor,
          level: (record.avg_level || 0) * levelRandomFactor,
          // Alternar status com base na porcentagem (para visualização mais dinâmica)
          pumpStatus: Math.random() * 100 < record.pump_on_percentage,
          heaterStatus: Math.random() * 100 < record.heater_on_percentage,
          timestamp: pointTimestamp
        });
      }
    });
    
    // Ordenar os pontos por timestamp (importante após a expansão)
    expandedReadings.sort((a, b) => a.timestamp - b.timestamp);
    
    // Usar a lista expandida como leituras
    const readings = expandedReadings;
    
    // Calcular estatísticas básicas a partir dos dados expandidos
    const temperatures = readings.map(r => r.temperature).filter(t => t > 0);
    const levels = readings.map(r => r.level).filter(l => l > 0);
    
    // Calcular min/max de forma mais precisa, sem considerar zeros
    const minTemp = findNonZeroMinValueFromAggregated(historicalData, 'min_temperature');
    const minLevel = findNonZeroMinValueFromAggregated(historicalData, 'min_level');
    
    // Ajustar valores mínimos para evitar zeros
    const adjustedMinTemp = minTemp > 0 ? minTemp : Math.max(1, Math.min(...temperatures));
    const adjustedMinLevel = minLevel > 0 ? minLevel : Math.max(1, Math.min(...levels));
    
    // Usar as estatísticas dos dados expandidos com min/max ajustados
    const stats = {
      temperature: {
        avg: calculateAverage(temperatures),
        min: adjustedMinTemp,
        max: findMaxValueFromAggregated(historicalData, 'max_temperature'),
        stdDev: calculateStdDev(temperatures)
      },
      level: {
        avg: calculateAverage(levels),
        min: adjustedMinLevel,
        max: findMaxValueFromAggregated(historicalData, 'max_level'),
        stdDev: calculateStdDev(levels)
      }
    };
    
    // Valores padrão para setpoints (estes poderiam vir de outra API)
    const setpoints = {
      temp: { min: 25, max: 30 },
      level: { min: 40, max: 80 }
    };
    
    return {
      readings,
      setpoints,
      stats
    };
  } catch (error) {
    console.error('Erro ao converter dados agregados:', error);
    return getEmptyHistoricalData();
  }
}

// Funções auxiliares para calcular estatísticas a partir de dados agregados
function calculateAverageFromAggregated(data: any[], field: string): number {
  if (!data || data.length === 0) return 0;
  
  // Ponderamos a média pelo número de registros em cada agregação
  let totalSum = 0;
  let totalRecords = 0;
  
  data.forEach(record => {
    const value = record[field] || 0;
    const weight = record.records_count || 1;
    totalSum += (value * weight);
    totalRecords += weight;
  });
  
  return totalRecords > 0 ? totalSum / totalRecords : 0;
}

function findMinValueFromAggregated(data: any[], field: string): number {
  if (!data || data.length === 0) return 0;
  return Math.min(...data.map(record => record[field] || 0));
}

// Encontra o valor mínimo não-zero nos dados agregados
function findNonZeroMinValueFromAggregated(data: any[], field: string): number {
  if (!data || data.length === 0) return 0;
  
  // Filtrar valores maiores que zero antes de encontrar o mínimo
  const nonZeroValues = data
    .map(item => parseFloat(item[field] || 0))
    .filter(val => val > 0);
  
  // Se não houver valores > 0, retorna um valor mínimo razoável
  if (nonZeroValues.length === 0) {
    return field.includes('temp') ? 10 : 5;
  }
  
  const minValue = Math.min(...nonZeroValues);
  return !isNaN(minValue) ? minValue : field.includes('temp') ? 10 : 5;
}

function findMaxValueFromAggregated(data: any[], field: string): number {
  if (!data || data.length === 0) return 0;
  return Math.max(...data.map(record => record[field] || 0));
}

function calculateStdDevApproximation(data: any[], field: string): number {
  if (!data || data.length <= 1) return 0;
  
  // Calculamos uma aproximação do desvio padrão usando min/max e propriedades estatísticas
  // Esta é uma aproximação simples baseada na faixa dos dados
  const min = findMinValueFromAggregated(data, field);
  const max = findMaxValueFromAggregated(data, field);
  const range = max - min;
  
  // Para uma distribuição normal, o desvio padrão é aproximadamente 1/4 da faixa
  return range / 4;
}

// Get historical readings directly from ThingSpeak via backend
export async function getThingspeakHistoricalReadings(
  days: number = 7,
  startDate?: string,
  endDate?: string
): Promise<HistoricalReadingsResponse> {
  // Se estamos no GitHub Pages, usar ThingSpeak diretamente
  if (isGitHubPagesEnv()) {
    return getThingspeakDataDirect(days);
  }
  
  // Comportamento normal usando a API local
  let url = `/api/thingspeak/history?days=${days}`;
  
  // Se datas específicas forem fornecidas, adicionar à URL
  if (startDate && endDate) {
    url += `&startDate=${startDate}&endDate=${endDate}`;
  }
  
  const res = await apiRequest("GET", url);
  return res.json();
}

// Update pump status
export async function updatePumpStatus(status: boolean): Promise<{ success: boolean; pumpStatus: boolean }> {
  // Se estamos no GitHub Pages, usar ThingSpeak diretamente se permitido
  if (isGitHubPagesEnv()) {
    // Verificar se o controle direto está habilitado
    if (!isDirectDeviceControlEnabled()) {
      return { 
        success: false, 
        pumpStatus: status // Retornar o status que foi solicitado para melhor UX
      };
    }
    
    const success = await updateThingspeakDirectly(3, status ? 1 : 0);
    return {
      success,
      pumpStatus: status // Assumimos o estado solicitado
    };
  }
  
  // Comportamento normal usando a API local
  const timestamp = new Date().getTime();
  const res = await apiRequest("POST", `/api/control/pump?t=${timestamp}`, { status }, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
  return res.json();
}

// Update heater status
export async function updateHeaterStatus(status: boolean): Promise<{ success: boolean; heaterStatus: boolean }> {
  // Se estamos no GitHub Pages, usar ThingSpeak diretamente se permitido
  if (isGitHubPagesEnv()) {
    // Verificar se o controle direto está habilitado
    if (!isDirectDeviceControlEnabled()) {
      return { 
        success: false, 
        heaterStatus: status // Retornar o status que foi solicitado para melhor UX
      };
    }
    
    const success = await updateThingspeakDirectly(4, status ? 1 : 0);
    return {
      success,
      heaterStatus: status // Assumimos o estado solicitado
    };
  }
  
  // Comportamento normal usando a API local
  const timestamp = new Date().getTime();
  const res = await apiRequest("POST", `/api/control/heater?t=${timestamp}`, { status }, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
  return res.json();
}

// Update operation mode
export async function updateOperationMode(isAutomatic: boolean): Promise<{ success: boolean; operationMode: boolean }> {
  // Se estamos no GitHub Pages, usar ThingSpeak diretamente se permitido
  if (isGitHubPagesEnv()) {
    // Verificar se o controle direto está habilitado
    if (!isDirectDeviceControlEnabled()) {
      return { 
        success: false, 
        operationMode: isAutomatic // Retornar o modo que foi solicitado para melhor UX
      };
    }
    
    const success = await updateThingspeakDirectly(5, isAutomatic ? 1 : 0);
    return {
      success,
      operationMode: isAutomatic // Assumimos o estado solicitado
    };
  }
  
  // Caso contrário, usa a API local
  try {
    const response = await fetch('/api/control/operation-mode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ isAutomatic })
    });
    
    if (!response.ok) {
      throw new Error(`Erro ao atualizar modo de operação: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Erro ao atualizar modo de operação:', error);
    throw error;
  }
}

// Update setpoints
export async function updateSetpoints(data: {
  tempMin: number;
  tempMax: number;
  levelMin: number;
  levelMax: number;
}) {
  // No GitHub Pages, apenas simulamos a atualização
  if (isGitHubPagesEnv()) {
    return {
      id: 1,
      temp_min: data.tempMin,
      temp_max: data.tempMax,
      level_min: data.levelMin,
      level_max: data.levelMax,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }
  
  // Comportamento normal
  const res = await apiRequest("POST", "/api/setpoints", data);
  return res.json();
}

// Get settings
export async function getSettings() {
  // No GitHub Pages, retornamos configurações padrão
  if (isGitHubPagesEnv()) {
    return {
      id: 1,
      theme: "light",
      language: "pt-BR",
      notifications_enabled: true,
      chart_style: "modern",
      date_format: "dd/MM/yyyy",
      time_format: "24h",
      temperature_unit: "C",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }
  
  // Comportamento normal
  const res = await apiRequest("GET", "/api/settings");
  return res.json();
}

// Update settings
export async function updateSettings(data: any) {
  // No GitHub Pages, apenas simulamos a atualização
  if (isGitHubPagesEnv()) {
    return {
      ...data,
      id: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }
  
  try {
    console.log("Enviando dados para atualização de configurações:", data);
    
    // Converter camelCase para snake_case
    const snakeCaseSettings: Record<string, any> = {};
    
    if (typeof data === 'object' && !Array.isArray(data)) {
      // Formatar valores booleanos ou nulos e converter para snake_case
      for (const [key, value] of Object.entries(data)) {
        // Converter camelCase para snake_case
        const snakeKey = key.replace(/([A-Z])/g, letter => `_${letter.toLowerCase()}`);
        
        // Converter valores para formatos que o backend pode processar facilmente
        if (value === true) {
          snakeCaseSettings[snakeKey] = 1;
        } else if (value === false) {
          snakeCaseSettings[snakeKey] = 0;
        } else if (value === null) {
          snakeCaseSettings[snakeKey] = null;
        } else {
          snakeCaseSettings[snakeKey] = value;
        }
      }
    } 
    // Se for array de {key, value}, converter cada chave para snake_case
    else if (Array.isArray(data) && data.length > 0 && 'key' in data[0] && 'value' in data[0]) {
      // Não usar formato de array mais, convertê-lo para objeto também
      for (const item of data) {
        if (item.key) {
          const snakeKey = item.key.replace(/([A-Z])/g, letter => `_${letter.toLowerCase()}`);
          const value = item.value;
          
          if (value === true) {
            snakeCaseSettings[snakeKey] = 1;
          } else if (value === false) {
            snakeCaseSettings[snakeKey] = 0;
          } else if (value === null) {
            snakeCaseSettings[snakeKey] = null;
          } else {
            snakeCaseSettings[snakeKey] = value;
          }
        }
      }
    }
    
    console.log("Enviando dados em formato snake_case:", snakeCaseSettings);
    
    // Usar o objeto convertido
    const settingsToSend = snakeCaseSettings;
    
    // Enviar a requisição com cabeçalhos para debugging
    const res = await apiRequest("POST", "/api/settings", settingsToSend, {
      headers: {
        'Content-Type': 'application/json',
        'X-Debug': 'true',
        'X-Settings-Format': Array.isArray(settingsToSend) ? 'key-value' : 'object-plain'
      }
    });
    
    // Tratar a resposta
    try {
      const jsonResponse = await res.json();
      console.log("Resposta recebida do servidor:", jsonResponse);
      
      // Verificar se há erro na resposta
      if (jsonResponse.error) {
        console.error("Erro retornado pelo servidor:", jsonResponse.error, jsonResponse.message || '');
        throw new Error(`Erro do servidor: ${jsonResponse.error} - ${jsonResponse.message || ''}`);
      }
      
      return jsonResponse;
    } catch (jsonError) {
      console.error("Erro ao processar resposta JSON:", jsonError);
      if (res.status >= 400) {
        throw new Error(`Erro HTTP ${res.status}: ${res.statusText}`);
      }
      throw jsonError;
    }
  } catch (error) {
    console.error("Erro ao atualizar configurações:", error);
    throw error;
  }
}

// Import data from ThingSpeak to local database
export async function importThingspeakToDatabase(days: number = 7): Promise<{ 
  success: boolean; 
  message: string; 
  count: number;
  background?: boolean;
}> {
  // No GitHub Pages, simulamos a operação
  if (isGitHubPagesEnv()) {
    return {
      success: true,
      message: "Dados são carregados diretamente do ThingSpeak no GitHub Pages",
      count: 0,
      background: false
    };
  }
  
  // Comportamento normal
  const res = await apiRequest("POST", `/api/sync/thingspeak-to-db?days=${days}`);
  return res.json();
}

// Get system uptime based on first reading
export async function getSystemUptime(): Promise<{
  success: boolean;
  firstReadingDate: string;
}> {
  // Se estamos no GitHub Pages, retornar uma data fixa para testes
  if (isGitHubPagesEnv()) {
    // Data de 30 dias atrás para demonstração
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    return {
      success: true,
      firstReadingDate: thirtyDaysAgo.toISOString()
    };
  }
  
  try {
    const res = await apiRequest("GET", '/api/system/uptime');
    return res.json();
  } catch (error) {
    console.error('Failed to get system uptime:', error);
    // Em caso de erro, retornar a data atual como fallback
    return {
      success: false,
      firstReadingDate: new Date().toISOString()
    };
  }
}

// Get current device status (includes memory state and database state)
export async function getDeviceStatus(): Promise<DeviceStatusResponse> {
  // Se estamos no GitHub Pages, usar ThingSpeak diretamente
  if (isGitHubPagesEnv()) {
    try {
      // Buscar a última leitura do ThingSpeak
      const data = await fetchFromThingspeak(
        `/channels/${getThingspeakChannelId()}/feeds/last.json?results=1`
      );
      
      // Status dos dispositivos baseado na última leitura
      const pumpStatus = data.field3 === '1' || data.field3 === 1;
      const heaterStatus = data.field4 === '1' || data.field4 === 1;
      const timestamp = new Date(data.created_at).getTime();
      
      return {
        timestamp,
        pumpStatus,
        heaterStatus,
        operationMode: true, // Por padrão, modo automático
        source: 'database',
        pendingSync: false,
        databaseState: {
          timestamp,
          pumpStatus,
          heaterStatus,
          operationMode: true
        },
        memoryState: {
          timestamp,
          pumpStatus,
          heaterStatus,
          operationMode: true
        }
      };
    } catch (error) {
      console.error('Erro ao buscar status dos dispositivos do ThingSpeak:', error);
      // Valores padrão em caso de erro
      return {
        timestamp: Date.now(),
        pumpStatus: false,
        heaterStatus: false,
        operationMode: true, // Por padrão, modo automático
        source: 'database',
        pendingSync: false
      };
    }
  }
  
  // Comportamento normal usando a API local
  const timestamp = new Date().getTime();
  const res = await apiRequest("GET", `/api/device/status?t=${timestamp}`, undefined, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
  return res.json();
}

// Função auxiliar para enviar status para o ThingSpeak diretamente
async function updateThingspeakDirectly(field: number, value: 0 | 1): Promise<boolean> {
  if (!isDirectDeviceControlEnabled()) {
    console.warn('Controle direto de dispositivos não disponível no GitHub Pages');
    return false;
  }
  
  try {
    const url = `${getThingspeakBaseUrl()}/update?api_key=${getThingspeakWriteApiKey()}&field${field}=${value}`;
    const response = await fetch(url);
    const data = await response.text();
    
    // ThingSpeak retorna o entry_id se bem sucedido
    return !isNaN(parseInt(data));
  } catch (error) {
    console.error(`Erro ao atualizar campo ${field} no ThingSpeak:`, error);
    return false;
  }
}

/**
 * Força a sincronização do estado em memória com o banco de dados
 * Útil quando a sincronização parece ter travado
 */
export async function forceDeviceSync(): Promise<{ success: boolean, message: string, state?: any }> {
  // Se estamos no GitHub Pages, simulamos a operação
  if (isGitHubPagesEnv()) {
    return {
      success: true,
      message: "Estado sincronizado com sucesso (simulado)"
    };
  }
  
  try {
    const timestamp = new Date().getTime();
    const res = await apiRequest("POST", `/api/system/force-sync?t=${timestamp}`, {}, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    return res.json();
  } catch (error) {
    console.error('Falha ao forçar sincronização dos dispositivos:', error);
    return {
      success: false,
      message: 'Falha ao forçar sincronização dos dispositivos'
    };
  }
}
