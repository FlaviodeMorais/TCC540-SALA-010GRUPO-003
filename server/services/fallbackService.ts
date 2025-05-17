import { Reading } from '@shared/sqlite-schema';
import { 
  fetchLatestReading, 
  getCurrentDeviceStatus,
  updatePumpStatus,
  updateHeaterStatus,
  updateOperationMode,
  updateTargetTemperature,
  updatePumpOnTimer,
  updatePumpOffTimer
} from './thingspeakService';
import { emulatorService } from './emulatorService';

// Tipo das leituras do ThingSpeak
interface ThingspeakReading {
  temperature: number;
  level: number;
  pumpStatus: boolean;
  heaterStatus: boolean;
  timestamp: Date;
}

// Interfaces para comunicação entre serviços
interface DeviceStatus {
  pumpStatus: boolean;
  heaterStatus: boolean;
  operationMode: boolean;
  targetTemp: number;
  pumpOnTimer: number;
  pumpOffTimer: number;
  lastUpdate: Date | string;
}

// Tipos para configuração do fallback
export interface SensorRange {
  min: number;
  max: number;
  current: number;
  fluctuation: number;
}

export interface VirtualSensorConfig {
  enabled: boolean;
  temperature: SensorRange;
  level: SensorRange;
  pumpState: boolean;
  heaterState: boolean;
  operationMode: boolean;
  targetTemp: number;
  pumpOnTimer: number;
  pumpOffTimer: number;
  mode: 'stable' | 'fluctuating' | 'random';
}

// Tipos para controle das fontes de sensores
export type SensorSource = 'hardware' | 'virtual';

export interface SensorSources {
  temperature: SensorSource;
  level: SensorSource;
  pumpStatus: SensorSource;
  heaterStatus: SensorSource;
  operationMode: SensorSource;
  targetTemp: SensorSource;
  pumpOnTimer: SensorSource;
  pumpOffTimer: SensorSource;
}

// Tipo para monitoramento de saúde dos sensores
export interface SensorHealth {
  status: 'online' | 'offline' | 'unknown';
  lastCheck: Date;
  failCount: number;
  failThreshold: number;
  lastValue: any;
}

export interface SensorsHealth {
  temperature: SensorHealth;
  level: SensorHealth;
  pumpStatus: SensorHealth;
  heaterStatus: SensorHealth;
  operationMode: SensorHealth;
  targetTemp: SensorHealth;
  pumpOnTimer: SensorHealth;
  pumpOffTimer: SensorHealth;
}

class FallbackService {
  // Configuração para sensores virtuais
  private config: VirtualSensorConfig = {
    enabled: true,
    temperature: {
      min: 18,
      max: 32,
      current: 24.5,
      fluctuation: 0.5
    },
    level: {
      min: 20,
      max: 100,
      current: 85,
      fluctuation: 2
    },
    pumpState: false,
    heaterState: false,
    operationMode: false,
    targetTemp: 26.5,
    pumpOnTimer: 15,
    pumpOffTimer: 30,
    mode: 'fluctuating'
  };
  
  // Fontes atuais dos sensores (hardware ou virtual)
  private sources: SensorSources = {
    temperature: 'hardware',
    level: 'hardware',
    pumpStatus: 'hardware',
    heaterStatus: 'hardware',
    operationMode: 'hardware',
    targetTemp: 'hardware',
    pumpOnTimer: 'hardware',
    pumpOffTimer: 'hardware'
  };
  
  // Monitoramento de saúde dos sensores
  private health: SensorsHealth = {
    temperature: this.createDefaultHealth(),
    level: this.createDefaultHealth(),
    pumpStatus: this.createDefaultHealth(),
    heaterStatus: this.createDefaultHealth(),
    operationMode: this.createDefaultHealth(),
    targetTemp: this.createDefaultHealth(),
    pumpOnTimer: this.createDefaultHealth(),
    pumpOffTimer: this.createDefaultHealth()
  };
  
  private createDefaultHealth(): SensorHealth {
    return {
      status: 'unknown',
      lastCheck: new Date(),
      failCount: 0,
      failThreshold: 3,
      lastValue: null
    };
  }
  
  // Arquivo de configuração para persistência
  private configFilePath = './fallback_config.json';
  
  // Inicialização com verificação automática periódica
  constructor() {
    console.log('🔄 Iniciando serviço de fallback...');
    
    // Carregar configuração salva, se existir (assíncrono)
    setTimeout(async () => {
      await this.loadConfiguration();
      console.log('✅ Configuração inicial do fallback concluída');
    }, 1000);
    
    // Verificar sensores a cada 2 minutos
    setInterval(() => this.checkSensorsHealth(), 2 * 60 * 1000);
    
    // Salvar configuração periodicamente (a cada 30 segundos)
    setInterval(async () => {
      await this.saveConfiguration();
    }, 30 * 1000);
    
    // Adicionar hook para salvar ao sair
    process.on('exit', () => {
      console.log('⚠️ Finalizando aplicação, salvando configurações...');
      // Não podemos usar await em um listener de evento, mas vamos tentar
      this.saveConfiguration().catch(err => {
        console.error('❌ Erro ao salvar configurações durante o encerramento:', err);
      });
    });
    
    // Verificação inicial após 10 segundos
    setTimeout(() => this.checkSensorsHealth(), 10 * 1000);
    
    console.log('🔄 Serviço de fallback iniciado');
  }
  
  // MÉTODOS PÚBLICOS
  
  getConfig(): VirtualSensorConfig {
    return { ...this.config };
  }
  
  updateConfig(newConfig: Partial<VirtualSensorConfig>): VirtualSensorConfig {
    this.config = { ...this.config, ...newConfig };
    console.log('🔄 Configuração de sensores virtuais atualizada');
    return this.config;
  }
  
  getSensorSources(): SensorSources {
    return { ...this.sources };
  }
  
  async setSensorSource(sensor: keyof SensorSources, source: SensorSource): Promise<void> {
    this.sources[sensor] = source;
    console.log(`🔄 Fonte do sensor ${sensor} alterada para ${source}`);
    
    // Resetar contagem de falhas quando alterado manualmente
    if (this.health[sensor]) {
      this.health[sensor].failCount = 0;
      this.health[sensor].status = 'unknown';
    }
    
    // Salvar configurações imediatamente para persistir as mudanças
    try {
      await this.saveConfiguration();
      console.log(`✅ Configurações de fontes salvas após alteração de ${sensor} para ${source}`);
    } catch (error) {
      console.error(`❌ Erro ao salvar configuração após alteração de fonte: ${error}`);
    }
  }
  
  getSensorsHealth(): SensorsHealth {
    return JSON.parse(JSON.stringify(this.health)); // Deep copy
  }
  
  async getReading(): Promise<Reading> {
    // Inicializar com timestamp
    const timestamp = new Date();
    
    // Obter dados do emulador para uso como valores virtuais
    const emulatorData = emulatorService.getLastReading();
    
    // Extrair valores do emulador (convertendo conforme necessário)
    const virtualTemp = emulatorData ? parseFloat(String(emulatorData.field1 || '0')) : 24.5;
    const virtualLevel = emulatorData ? parseFloat(String(emulatorData.field2 || '0')) * 100 : 85; // Converte 0-1 para 0-100%
    const virtualPumpStatus = emulatorData ? (emulatorData.field3 === '1' ? 1 : 0) : (this.config.pumpState ? 1 : 0);
    const virtualHeaterStatus = emulatorData ? (emulatorData.field4 === '1' ? 1 : 0) : (this.config.heaterState ? 1 : 0);
    
    // Início com valores virtuais para todos os sensores
    let reading: Reading = {
      id: 0,
      timestamp: timestamp.getTime(),
      temperature: virtualTemp,
      level: virtualLevel / 100, // Converter de novo para 0-1 para compatibilidade no banco
      pump_status: virtualPumpStatus,
      heater_status: virtualHeaterStatus
    };
    
    // Verificar quais sensores estão configurados como hardware
    const needsHardwareData = Object.values(this.sources).some(source => source === 'hardware');
    
    // Tentar obter dados do hardware apenas se necessário
    if (needsHardwareData) {
      try {
        const thingspeakData = await fetchLatestReading();
        
        if (thingspeakData) {
          // O ThingSpeak retorna um tipo diferente do Reading
          // Precisamos converter para o formato do Reading
          let pumpStatusValue = 0;
          let heaterStatusValue = 0;
          
          // Converter valores para pump e heater status verificando propriedades
          if ('pumpStatus' in thingspeakData) {
            const pumpStatus = (thingspeakData as any).pumpStatus;
            pumpStatusValue = typeof pumpStatus === 'boolean' ? (pumpStatus ? 1 : 0) : Number(pumpStatus || 0);
          } else if ('pump_status' in thingspeakData) {
            pumpStatusValue = Number(thingspeakData.pump_status || 0);
          }
          
          if ('heaterStatus' in thingspeakData) {
            const heaterStatus = (thingspeakData as any).heaterStatus;
            heaterStatusValue = typeof heaterStatus === 'boolean' ? (heaterStatus ? 1 : 0) : Number(heaterStatus || 0);
          } else if ('heater_status' in thingspeakData) {
            heaterStatusValue = Number(thingspeakData.heater_status || 0);
          }
          
          // Atualizar valores de saúde para todos os sensores, independente da fonte selecionada
          this.updateSensorHealthWithValue('temperature', thingspeakData.temperature);
          this.updateSensorHealthWithValue('level', thingspeakData.level);
          this.updateSensorHealthWithValue('pumpStatus', pumpStatusValue);
          this.updateSensorHealthWithValue('heaterStatus', heaterStatusValue);
          
          // Substituir apenas os valores dos sensores configurados como hardware
          if (this.sources.temperature === 'hardware' && this.isValidValue(thingspeakData.temperature)) {
            reading.temperature = thingspeakData.temperature;
          }
          
          if (this.sources.level === 'hardware' && this.isValidValue(thingspeakData.level)) {
            reading.level = thingspeakData.level;
          }
          
          if (this.sources.pumpStatus === 'hardware' && this.isValidValue(pumpStatusValue)) {
            reading.pump_status = pumpStatusValue;
          }
          
          if (this.sources.heaterStatus === 'hardware' && this.isValidValue(heaterStatusValue)) {
            reading.heater_status = heaterStatusValue;
          }
        } else {
          console.log('⚠️ Nenhum dado recebido do ThingSpeak, usando valores virtuais para sensores');
        }
      } catch (error) {
        console.error('❌ Erro ao obter dados do hardware:', error);
      }
    } else {
      console.log('ℹ️ Todos os sensores configurados como virtuais, usando emulador');
    }
    
    // Obter o estado atual em memória como backup para controles (bomba e aquecedor)
    const memoryState = getCurrentDeviceStatus();
    
    // Usar o estado em memória como último recurso para controles se hardware falhou
    if (this.sources.pumpStatus === 'hardware' && !this.isValidValue(reading.pump_status)) {
      reading.pump_status = memoryState.pumpStatus ? 1 : 0;
      console.log('ℹ️ Usando estado em memória para pump_status:', reading.pump_status);
    }
    
    if (this.sources.heaterStatus === 'hardware' && !this.isValidValue(reading.heater_status)) {
      reading.heater_status = memoryState.heaterStatus ? 1 : 0;
      console.log('ℹ️ Usando estado em memória para heater_status:', reading.heater_status);
    }
    
    // Forçar valores virtuais para sensores configurados explicitamente como virtuais
    // Esta etapa garante que mesmo que a lógica acima tenha alterado os valores,
    // respeitamos estritamente a configuração do usuário
    if (this.sources.temperature === 'virtual') {
      reading.temperature = virtualTemp;
    }
    
    if (this.sources.level === 'virtual') {
      reading.level = virtualLevel / 100; // Novamente, converter para 0-1
    }
    
    if (this.sources.pumpStatus === 'virtual') {
      reading.pump_status = virtualPumpStatus;
    }
    
    if (this.sources.heaterStatus === 'virtual') {
      reading.heater_status = virtualHeaterStatus;
    }
    
    // Sincronizar estado do emulador 
    if (this.sources.pumpStatus === 'virtual') {
      emulatorService.setPumpStatus(reading.pump_status === 1);
    }
    
    if (this.sources.heaterStatus === 'virtual') {
      emulatorService.setHeaterStatus(reading.heater_status === 1);
    }
    
    // Registrar detalhes para debug com mais informações
    console.log(`📊 Leitura final: temp=${reading.temperature.toFixed(1)}°C (${this.sources.temperature}), level=${(reading.level * 100).toFixed(1)}% (${this.sources.level}), pump=${reading.pump_status ? 'ON' : 'OFF'} (${this.sources.pumpStatus}), heater=${reading.heater_status ? 'ON' : 'OFF'} (${this.sources.heaterStatus})`);
    
    return reading;
  }
  
  // Verifica saúde de todos os sensores
  async checkSensorsHealth(): Promise<void> {
    console.log('🔍 Verificando saúde dos sensores...');
    
    try {
      // Obter a leitura mais recente do hardware
      const thingspeakData = await fetchLatestReading();
      
      if (thingspeakData) {
        // Verificar sensores básicos (agora usando await)
        await this.checkSensorHealth('temperature', thingspeakData.temperature);
        await this.checkSensorHealth('level', thingspeakData.level);
        
        // Converter valores para pump e heater status
        // Verificar se as propriedades existem no objeto
        let pumpValue = 0;
        let heaterValue = 0;
        
        if ('pumpStatus' in thingspeakData) {
          const pumpStatus = (thingspeakData as any).pumpStatus;
          pumpValue = typeof pumpStatus === 'boolean' ? (pumpStatus ? 1 : 0) : Number(pumpStatus || 0);
        } else if ('pump_status' in thingspeakData) {
          pumpValue = Number(thingspeakData.pump_status || 0);
        }
        
        if ('heaterStatus' in thingspeakData) {
          const heaterStatus = (thingspeakData as any).heaterStatus;
          heaterValue = typeof heaterStatus === 'boolean' ? (heaterStatus ? 1 : 0) : Number(heaterStatus || 0);
        } else if ('heater_status' in thingspeakData) {
          heaterValue = Number(thingspeakData.heater_status || 0);
        }
        
        await this.checkSensorHealth('pumpStatus', pumpValue);
        await this.checkSensorHealth('heaterStatus', heaterValue);
      } else {
        console.warn('⚠️ Nenhuma leitura obtida do hardware');
        // Incrementar falhas para os sensores principais
        this.incrementFailCount('temperature');
        this.incrementFailCount('level');
        this.incrementFailCount('pumpStatus');
        this.incrementFailCount('heaterStatus');
      }
      
      // Verificar configurações usando o estado atual em memória
      try {
        const memoryState = getCurrentDeviceStatus();
        
        await this.checkSensorHealth('operationMode', memoryState.operationMode);
        await this.checkSensorHealth('targetTemp', memoryState.targetTemp);
        await this.checkSensorHealth('pumpOnTimer', memoryState.pumpOnTimer);
        await this.checkSensorHealth('pumpOffTimer', memoryState.pumpOffTimer);
      } catch (error) {
        console.error('❌ Erro ao verificar parâmetros de configuração:', error);
        this.incrementFailCount('operationMode');
        this.incrementFailCount('targetTemp');
        this.incrementFailCount('pumpOnTimer');
        this.incrementFailCount('pumpOffTimer');
      }
    } catch (error) {
      console.error('❌ Erro ao verificar saúde dos sensores:', error);
      // Em caso de falha geral, incrementar todas as falhas
      Object.keys(this.sources).forEach(key => {
        this.incrementFailCount(key as keyof SensorSources);
      });
    }
    
    // Resumo do estado atual
    this.logHealthSummary();
  }
  
  // Atualizar estado de um dispositivo
  async updateDeviceState(device: 'pump' | 'heater', state: boolean): Promise<boolean> {
    // Atualizar estado virtual em ambos os serviços (fallback e emulador)
    if (device === 'pump') {
      this.config.pumpState = state;
      // Atualizar também o emulador para manter consistência
      emulatorService.setPumpStatus(state);
    } else {
      this.config.heaterState = state;
      // Atualizar também o emulador para manter consistência
      emulatorService.setHeaterStatus(state);
    }
    
    // Se estiver usando fonte virtual para este dispositivo, retornar sucesso
    if ((device === 'pump' && this.sources.pumpStatus === 'virtual') ||
        (device === 'heater' && this.sources.heaterStatus === 'virtual')) {
      console.log(`🔄 Atualizando ${device} no modo virtual: ${state ? 'ON' : 'OFF'}`);
      return true;
    }
    
    // Caso contrário, tentar atualizar ThingSpeak
    try {
      if (device === 'pump') {
        await updatePumpStatus(state);
      } else {
        await updateHeaterStatus(state);
      }
      return true;
    } catch (error) {
      console.error(`❌ Erro ao atualizar ${device} no ThingSpeak:`, error);
      // Incrementar contador de falhas
      this.incrementFailCount(device === 'pump' ? 'pumpStatus' : 'heaterStatus');
      return false;
    }
  }
  
  // MÉTODOS PRIVADOS
  
  private async checkSensorHealth(sensor: keyof SensorSources, value: any): Promise<void> {
    if (this.isValidValue(value)) {
      // Sensor está respondendo
      this.health[sensor].status = 'online';
      this.health[sensor].failCount = 0;
      this.health[sensor].lastCheck = new Date();
      this.health[sensor].lastValue = value;
      
      // Se estava em modo virtual automaticamente (por falha) e sensor está online, 
      // verificamos se a configuração atual indica modo virtual manual
      if (this.sources[sensor] === 'virtual') {
        try {
          // Verificamos as fontes configuradas no arquivo de configuração
          const configSources = await this.getConfigSources();
          
          // Se o arquivo de configuração indica que o modo deve ser virtual,
          // não alteramos automaticamente para hardware
          if (configSources && configSources[sensor] === 'virtual') {
            console.log(`⚠️ Sensor ${sensor} está respondendo, mas mantendo no modo virtual conforme configuração manual.`);
            return;
          }
          
          // Caso contrário, retornamos para o modo hardware
          console.log(`✅ Sensor ${sensor} voltou a responder. Retornando para modo hardware.`);
          this.sources[sensor] = 'hardware';
          // Salvar a configuração atualizada
          await this.saveConfiguration().catch(err => {
            console.error('❌ Erro ao salvar configuração após retorno ao modo hardware:', err);
          });
        } catch (error) {
          console.error(`❌ Erro ao verificar configuração para o sensor ${sensor}:`, error);
        }
      }
    } else {
      // Incrementar contagem de falhas
      this.incrementFailCount(sensor);
    }
  }
  
  // Método auxiliar para obter fontes do arquivo de configuração
  private async getConfigSources(): Promise<Record<string, SensorSource> | null> {
    try {
      // Usar importação dinâmica para o módulo fs
      const fs = await import('fs/promises');
      
      try {
        // Verificar se o arquivo existe
        await fs.access(this.configFilePath);
        
        // Ler os dados do arquivo
        const data = await fs.readFile(this.configFilePath, 'utf8');
        const configData = JSON.parse(data);
        return configData.sources || null;
      } catch (accessError) {
        // Arquivo não existe
        return null;
      }
    } catch (error) {
      console.error('❌ Erro ao ler fontes do arquivo de configuração:', error);
      return null;
    }
  }
  
  private updateSensorHealthWithValue(sensor: keyof SensorSources, value: any): void {
    // Apenas atualiza o último valor recebido, sem alterar status
    if (this.isValidValue(value)) {
      this.health[sensor].lastValue = value;
    }
  }
  
  private incrementFailCount(sensor: keyof SensorSources): void {
    const health = this.health[sensor];
    health.failCount++;
    health.lastCheck = new Date();
    
    if (health.failCount >= health.failThreshold) {
      // Marcar como offline
      health.status = 'offline';
      
      // Mudar para modo virtual se ainda estiver em hardware
      if (this.sources[sensor] === 'hardware') {
        console.log(`⚠️ Sensor ${sensor} offline após ${health.failCount} falhas. Alternando para modo virtual.`);
        this.sources[sensor] = 'virtual';
      }
    }
  }
  
  private isValidValue(value: any): boolean {
    return value !== null && value !== undefined;
  }
  
  private logHealthSummary(): void {
    const status = Object.entries(this.health).map(([sensor, health]) => {
      return `${sensor}: ${health.status} (${health.failCount}/${health.failThreshold})`;
    }).join(', ');
    
    console.log(`🏥 Status de saúde: ${status}`);
  }
  
  // Funções para persistência de configuração
  private async loadConfiguration(): Promise<void> {
    try {
      // Usar importação dinâmica para o módulo fs
      const fs = await import('fs/promises');
      
      try {
        // Verificar se o arquivo existe
        await fs.access(this.configFilePath);
        
        // Ler os dados do arquivo
        const data = await fs.readFile(this.configFilePath, 'utf8');
        const savedConfig = JSON.parse(data);
        
        // Carregar configuração
        if (savedConfig.config) {
          this.config = savedConfig.config;
          console.log('✅ Configurações de sensores virtuais carregadas com sucesso');
        }
        
        // Carregar fontes de sensores
        if (savedConfig.sources) {
          this.sources = savedConfig.sources;
          console.log('✅ Fontes de sensores carregadas com sucesso');
        }
      } catch (accessError) {
        // Arquivo não existe
        console.log('⚠️ Arquivo de configuração não encontrado, usando valores padrão');
      }
    } catch (error) {
      console.error('❌ Erro ao carregar configurações:', error);
    }
  }
  
  private async saveConfiguration(): Promise<void> {
    try {
      // Usar importação dinâmica para o módulo fs
      const fs = await import('fs/promises');
      
      const data = {
        config: this.config,
        sources: this.sources,
        savedAt: new Date()
      };
      
      await fs.writeFile(this.configFilePath, JSON.stringify(data, null, 2), 'utf8');
      console.log('✅ Configurações de fallback salvas com sucesso');
    } catch (error) {
      console.error('❌ Erro ao salvar configurações:', error);
    }
  }
  
  /* 
   * Os métodos de geração de valores virtuais foram removidos nesta versão.
   * Agora usamos os dados do emulador para os sensores virtuais.
   * Isso reduz a duplicação de código e evita inconsistências entre os sistemas.
   */
}

export const fallbackService = new FallbackService();