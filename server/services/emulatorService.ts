import { InsertReading } from "@shared/schema";
import { updateDeviceStatus } from "./thingspeakService";
import { ThingspeakResponse } from "./thingspeakConfig";
import { storage } from "../storage";
import * as fs from 'fs';
import * as path from 'path';

/**
 * Interface para definir as configurações do emulador
 */
export interface EmulatorConfig {
  enabled: boolean;
  updateInterval: number; // em milissegundos
  sensorRanges: {
    waterTemp: { min: number; max: number; current: number; fluctuation: number };
    airTemp: { min: number; max: number; current: number; fluctuation: number };
    waterLevel: { min: number; max: number; current: number; fluctuation: number };
    flowRate: { min: number; max: number; current: number; fluctuation: number };
    humidity: { min: number; max: number; current: number; fluctuation: number };
    pumpPressure: { min: number; max: number; current: number; fluctuation: number };
    phLevel: { min: number; max: number; current: number; fluctuation: number };
    oxygenLevel: { min: number; max: number; current: number; fluctuation: number };
  };
  controlStates: {
    pumpStatus: boolean;
    heaterStatus: boolean;
    pumpFlow: number; // 0-100%
  };
  mode: 'stable' | 'fluctuating' | 'random' | 'scenario';
  scenarioName?: string;
}

// Caminho para o arquivo de configuração persistente
const CONFIG_FILE_PATH = path.join(process.cwd(), 'emulator_config.json');

/**
 * Valores padrão para o emulador
 */
const DEFAULT_CONFIG: EmulatorConfig = {
  enabled: false,
  updateInterval: 2000, // 2 segundos por padrão para testes
  sensorRanges: {
    waterTemp: { min: 20, max: 30, current: 25, fluctuation: 0.2 },
    airTemp: { min: 18, max: 35, current: 22, fluctuation: 0.3 },
    waterLevel: { min: 60, max: 85, current: 73.11, fluctuation: 0.7 },
    flowRate: { min: 0, max: 10, current: 5, fluctuation: 0.5 },
    humidity: { min: 40, max: 90, current: 60, fluctuation: 2 },
    pumpPressure: { min: 0, max: 10, current: 5, fluctuation: 0.2 },
    phLevel: { min: 6, max: 8.5, current: 7.2, fluctuation: 0.2 },
    oxygenLevel: { min: 5, max: 15, current: 8.5, fluctuation: 0.5 }
  },
  controlStates: {
    pumpStatus: false,
    heaterStatus: false,
    pumpFlow: 70 // 70% por padrão
  },
  mode: 'stable'
};

/**
 * Cenários pré-definidos para simulação
 */
const SCENARIOS: Record<string, EmulatorConfig> = {
  'normal': {
    ...DEFAULT_CONFIG,
    mode: 'fluctuating'
  },
  'aquecimentoNecessario': {
    ...DEFAULT_CONFIG,
    sensorRanges: {
      ...DEFAULT_CONFIG.sensorRanges,
      waterTemp: { min: 18, max: 22, current: 20, fluctuation: 0.1 },
    },
    mode: 'fluctuating'
  },
  'nivelBaixoAgua': {
    ...DEFAULT_CONFIG,
    sensorRanges: {
      ...DEFAULT_CONFIG.sensorRanges,
      waterLevel: { min: 0, max: 30, current: 15, fluctuation: 1 },
    },
    mode: 'fluctuating'
  },
  'temperaturaAlta': {
    ...DEFAULT_CONFIG,
    sensorRanges: {
      ...DEFAULT_CONFIG.sensorRanges,
      waterTemp: { min: 28, max: 35, current: 32, fluctuation: 0.5 },
      airTemp: { min: 30, max: 40, current: 35, fluctuation: 0.8 },
    },
    mode: 'fluctuating'
  },
  'falhaNaBomba': {
    ...DEFAULT_CONFIG,
    sensorRanges: {
      ...DEFAULT_CONFIG.sensorRanges,
      flowRate: { min: 0, max: 2, current: 0.5, fluctuation: 0.3 },
      pumpPressure: { min: 0, max: 3, current: 1, fluctuation: 0.5 },
    },
    controlStates: {
      ...DEFAULT_CONFIG.controlStates,
      pumpFlow: 20
    },
    mode: 'fluctuating'
  },
  'falhaSensor': {
    ...DEFAULT_CONFIG,
    mode: 'random'
  },
  'baixaQualidadeAgua': {
    ...DEFAULT_CONFIG,
    sensorRanges: {
      ...DEFAULT_CONFIG.sensorRanges,
      phLevel: { min: 5, max: 6, current: 5.5, fluctuation: 0.2 },
      oxygenLevel: { min: 3, max: 6, current: 4.5, fluctuation: 0.3 },
    },
    mode: 'fluctuating'
  },
  'condicoesOtimas': {
    ...DEFAULT_CONFIG,
    sensorRanges: {
      ...DEFAULT_CONFIG.sensorRanges,
      waterTemp: { min: 24, max: 26, current: 25, fluctuation: 0.1 },
      airTemp: { min: 22, max: 28, current: 25, fluctuation: 0.2 },
      waterLevel: { min: 73.11, max: 73.11, current: 73.11, fluctuation: 0 },
      flowRate: { min: 5, max: 10, current: 7.5, fluctuation: 0.2 },
      humidity: { min: 60, max: 80, current: 70, fluctuation: 1 },
      pumpPressure: { min: 3, max: 5, current: 4, fluctuation: 0.1 },
      phLevel: { min: 6.8, max: 7.4, current: 7.0, fluctuation: 0.1 },
      oxygenLevel: { min: 8, max: 12, current: 10, fluctuation: 0.2 },
    },
    controlStates: {
      pumpStatus: true,
      heaterStatus: false,
      pumpFlow: 80
    },
    mode: 'fluctuating'
  }
};

/**
 * Classe que implementa um emulador para NodeMCU
 */
export class EmulatorService {
  private config: EmulatorConfig = DEFAULT_CONFIG;
  private intervalId: NodeJS.Timeout | null = null;
  private lastReading: ThingspeakResponse | null = null;

  constructor() {
    // Carregar configuração salva ou usar padrão
    this.loadConfigFromFile();
    this.lastReading = this.generateDefaultReading();
  }

  /**
   * Carrega as configurações salvas do arquivo
   */
  private loadConfigFromFile(): void {
    try {
      if (fs.existsSync(CONFIG_FILE_PATH)) {
        const configData = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
        const savedConfig = JSON.parse(configData);
        this.config = { ...DEFAULT_CONFIG, ...savedConfig };
        console.log('✅ Configurações do emulador carregadas do arquivo:', CONFIG_FILE_PATH);
      } else {
        console.log('ℹ️ Arquivo de configuração não encontrado. Usando valores padrão.');
      }
    } catch (error) {
      console.error('❌ Erro ao carregar configurações do emulador:', error);
    }
  }

  /**
   * Salva as configurações atuais no arquivo
   */
  private saveConfigToFile(): void {
    try {
      // Não salvar o estado de ativação, apenas as configurações
      const configToSave = { ...this.config };
      fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(configToSave, null, 2), 'utf8');
      console.log('✅ Configurações do emulador salvas no arquivo:', CONFIG_FILE_PATH);
    } catch (error) {
      console.error('❌ Erro ao salvar configurações do emulador:', error);
    }
  }

  /**
   * Inicializa o emulador
   */
  start(config?: Partial<EmulatorConfig>): void {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Se um cenário for especificado, usá-lo
    if (config?.scenarioName && Object.prototype.hasOwnProperty.call(SCENARIOS, config.scenarioName)) {
      const scenarioName = config.scenarioName as keyof typeof SCENARIOS;
      this.config = { ...this.config, ...SCENARIOS[scenarioName] };
    }

    this.config.enabled = true;
    
    console.log(`🔄 Iniciando emulador NodeMCU no modo ${this.config.mode}...`);
    
    // Limpar intervalo anterior se existir
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    // Iniciar novo intervalo de atualização
    this.intervalId = setInterval(() => {
      this.generateReading();
    }, this.config.updateInterval);
    
    // Gerar leitura inicial
    this.generateReading();
  }

  /**
   * Para o emulador
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.config.enabled = false;
    console.log('⏹️ Emulador NodeMCU desativado');
  }

  /**
   * Altera a configuração do emulador
   */
  updateConfig(config: Partial<EmulatorConfig>): EmulatorConfig {
    const wasEnabled = this.config.enabled;
    const newInterval = config.updateInterval && config.updateInterval !== this.config.updateInterval;
    
    // Atualizar configuração
    this.config = { ...this.config, ...config };
    
    // Salvar configuração atualizada no arquivo
    this.saveConfigToFile();
    
    // Se mudou o intervalo ou estava desligado e agora está ligado, reiniciar
    if ((wasEnabled && newInterval) || (!wasEnabled && this.config.enabled)) {
      this.stop();
      this.start();
    } else if (wasEnabled && !this.config.enabled) {
      // Se estava ligado e agora está desligado
      this.stop();
    }
    
    return this.config;
  }

  /**
   * Retorna o status atual do emulador
   */
  getStatus(): { enabled: boolean; config: EmulatorConfig; lastReading: ThingspeakResponse | null } {
    return {
      enabled: this.config.enabled,
      config: this.config,
      lastReading: this.lastReading
    };
  }
  
  /**
   * Retorna a última leitura gerada pelo emulador
   */
  getLastReading(): ThingspeakResponse | null {
    return this.lastReading;
  }

  /**
   * Retorna a configuração atual do emulador
   */
  getConfig(): EmulatorConfig {
    return this.config;
  }

  /**
   * Retorna os cenários disponíveis
   */
  getAvailableScenarios(): string[] {
    return Object.keys(SCENARIOS);
  }

  /**
   * Atualiza o status dos controles do emulador
   * Esta é a função chave para garantir que o emulador reflita
   * as mudanças feitas pelos controles do dashboard
   * 
   * @param pumpStatus Status da bomba (opcional)
   * @param heaterStatus Status do aquecedor (opcional)
   * @param pumpFlow Valor da vazão da bomba, 0-100% (opcional)
   * @returns A configuração atualizada do emulador
   */
  updateControlState(pumpStatus?: boolean, heaterStatus?: boolean, pumpFlow?: number): EmulatorConfig {
    let stateChanged = false;
    
    // Somente atualizar valores não-undefined
    if (pumpStatus !== undefined) {
      // Atualizar somente se o valor for diferente do atual
      if (this.config.controlStates.pumpStatus !== pumpStatus) {
        this.config.controlStates.pumpStatus = pumpStatus;
        console.log(`📊 Emulador: Status da bomba atualizado para ${pumpStatus ? 'ON' : 'OFF'}`);
        stateChanged = true;
      }
    }
    
    if (heaterStatus !== undefined) {
      // Atualizar somente se o valor for diferente do atual
      if (this.config.controlStates.heaterStatus !== heaterStatus) {
        this.config.controlStates.heaterStatus = heaterStatus;
        console.log(`📊 Emulador: Status do aquecedor atualizado para ${heaterStatus ? 'ON' : 'OFF'}`);
        stateChanged = true;
      }
    }
    
    if (pumpFlow !== undefined) {
      // Atualizar somente se o valor for diferente do atual
      if (this.config.controlStates.pumpFlow !== pumpFlow) {
        this.config.controlStates.pumpFlow = pumpFlow;
        console.log(`📊 Emulador: Vazão da bomba atualizada para ${pumpFlow}%`);
        stateChanged = true;
      }
    }
    
    // Salvar a configuração atualizada se houve mudança
    if (stateChanged) {
      this.saveConfigToFile();
      
      // Se o emulador não estiver rodando, a alteração será aplicada quando iniciar
      if (this.config.enabled) {
        // Gerar uma nova leitura imediatamente com os novos valores
        this.generateReading();
      }
    }
    
    return this.config;
  }

  /**
   * Carrega um cenário pré-definido
   */
  loadScenario(scenarioName: string): boolean {
    if (Object.prototype.hasOwnProperty.call(SCENARIOS, scenarioName)) {
      const scenario = scenarioName as keyof typeof SCENARIOS;
      this.stop();
      this.config = { ...SCENARIOS[scenario], scenarioName };
      // Salvar configuração quando carregar um cenário
      this.saveConfigToFile();
      this.start();
      return true;
    }
    return false;
  }

  /**
   * Controles manuais para os dispositivos
   */
  setPumpStatus(status: boolean): void {
    this.config.controlStates.pumpStatus = status;
    // Salvar configuração ao alterar estado da bomba
    this.saveConfigToFile();
    this.notifyDeviceUpdate();
  }

  setHeaterStatus(status: boolean): void {
    this.config.controlStates.heaterStatus = status;
    // Salvar configuração ao alterar estado do aquecedor
    this.saveConfigToFile();
    this.notifyDeviceUpdate();
  }

  /**
   * Notifica a mudança de estado dos dispositivos
   */
  private async notifyDeviceUpdate(): Promise<void> {
    try {
      // Atualizar ThingSpeak com o novo estado
      await updateDeviceStatus(
        this.config.controlStates.pumpStatus,
        this.config.controlStates.heaterStatus
      );
      
      // Gerar nova leitura com os estados atualizados
      this.generateReading();
    } catch (error) {
      console.error('Erro ao notificar mudança de dispositivo:', error);
    }
  }

  /**
   * Gera uma leitura padrão
   */
  private generateDefaultReading(): ThingspeakResponse {
    return {
      field1: this.config.sensorRanges.waterTemp.current.toString(),
      field2: this.config.sensorRanges.waterLevel.current.toString(), // Já enviado como percentual (0-100)
      field3: this.config.controlStates.pumpStatus ? '1' : '0',
      field4: this.config.controlStates.heaterStatus ? '1' : '0',
      field5: '1', // Modo automático por padrão
      field6: null, // Temperatura setpoint (não usado no emulador)
      field7: this.config.sensorRanges.flowRate.current.toString(),
      field8: this.config.sensorRanges.humidity.current.toString(),
      created_at: new Date().toISOString(),
      entry_id: Date.now()
    };
  }

  /**
   * Gera uma nova leitura simulada com base no modo selecionado
   */
  private async generateReading(): Promise<void> {
    if (!this.config.enabled) return;

    try {
      let reading: ThingspeakResponse = this.generateDefaultReading();
      
      // Aplicar o modo de simulação selecionado
      switch (this.config.mode) {
        case 'stable':
          // Usar valores fixos das configurações
          reading = {
            ...reading,
            field1: this.config.sensorRanges.waterTemp.current.toString(),
            field2: this.config.sensorRanges.waterLevel.current.toString(), // Enviado como percentual (0-100)
            field3: this.config.controlStates.pumpStatus ? '1' : '0',
            field4: this.config.controlStates.heaterStatus ? '1' : '0',
            field7: this.config.sensorRanges.flowRate.current.toString(),
            field8: this.config.sensorRanges.humidity.current.toString()
          };
          break;

        case 'fluctuating':
          // Adicionar pequenas variações aos valores (todos os sensores)
          const waterTemp = this.applyFluctuation('waterTemp');
          const airTemp = this.applyFluctuation('airTemp');
          // Permitir variação no nível da água também
          const waterLevel = this.applyFluctuation('waterLevel');
          const flowRate = this.applyFluctuation('flowRate');
          const humidity = this.applyFluctuation('humidity');
          const pumpPressure = this.applyFluctuation('pumpPressure');
          const phLevel = this.applyFluctuation('phLevel');
          const oxygenLevel = this.applyFluctuation('oxygenLevel');
          
          reading = {
            ...reading,
            field1: waterTemp.toString(),
            field2: waterLevel.toString(), // Enviado como percentual (0-100)
            field3: this.config.controlStates.pumpStatus ? '1' : '0',
            field4: this.config.controlStates.heaterStatus ? '1' : '0',
            field5: this.config.controlStates.pumpFlow.toString(), // Vazão da bomba
            field6: airTemp.toString(), // Temperatura ambiente
            field7: flowRate.toString(),
            field8: humidity.toString()
          };
          
          // Também incluímos pH e oxigênio, embora não estejam sendo enviados para ThingSpeak,
          // eles estão disponíveis através da API do emulador
          
          // Atualizar valores atuais na configuração
          this.config.sensorRanges.waterTemp.current = waterTemp;
          this.config.sensorRanges.airTemp.current = airTemp;
          this.config.sensorRanges.waterLevel.current = waterLevel;
          this.config.sensorRanges.flowRate.current = flowRate;
          this.config.sensorRanges.humidity.current = humidity;
          this.config.sensorRanges.pumpPressure.current = pumpPressure;
          this.config.sensorRanges.phLevel.current = phLevel;
          this.config.sensorRanges.oxygenLevel.current = oxygenLevel;
          break;

        case 'random':
          // Gerar falhas aleatórias (valores null ocasionais ou fora da faixa)
          const hasError = Math.random() < 0.3; // 30% de chance de erro
          
          if (hasError) {
            // Tipo de erro aleatório
            const errorType = Math.floor(Math.random() * 3);
            
            switch (errorType) {
              case 0:
                // Valores null
                reading.field1 = null;
                break;
              case 1:
                // Valores extremos
                reading.field1 = (-127).toString();
                break;
              case 2:
                // Valores zero
                reading.field1 = '0';
                break;
            }
          } else {
            // Valores normais com flutuação
            reading.field1 = this.applyFluctuation('waterTemp').toString();
            reading.field2 = (this.applyFluctuation('waterLevel') / 100).toString();
          }
          break;

        default:
          // Caso padrão usa modo estável
          break;
      }

      // Salvar última leitura
      this.lastReading = reading;
      console.log('📊 Leitura simulada do NodeMCU:', reading);

      // Criar leitura para salvar no banco
      const insertReading: InsertReading = {
        temperature: parseFloat(String(reading.field1 || '0')),
        level: parseFloat(String(reading.field2 || '0')), // Já está na escala 0-1
        pump_status: reading.field3 === '1' ? 1 : 0,
        heater_status: reading.field4 === '1' ? 1 : 0
      };

      // Salvar no banco de dados
      
      // LOG DEBUG: Verificando os valores antes de salvar
      console.log('🔍 [DEBUG] Valores para inserção:', {
        raw_field3: reading.field3,
        calculated_pumpStatus: reading.field3 === '1',
        config_pumpStatus: this.config.controlStates.pumpStatus,
        raw_field4: reading.field4,
        calculated_heaterStatus: reading.field4 === '1',
        config_heaterStatus: this.config.controlStates.heaterStatus,
      });
      
      // CORREÇÃO: Forçar consistência com os valores corretos
      insertReading.pump_status = this.config.controlStates.pumpStatus ? 1 : 0;
      insertReading.heater_status = this.config.controlStates.heaterStatus ? 1 : 0;
      
      // Salvar no banco de dados com valores consistentes
      await storage.saveReading(insertReading);

    } catch (error) {
      console.error('Erro ao gerar leitura simulada:', error);
    }
  }

  /**
   * Aplica flutuação aleatória a um valor dentro dos limites configurados
   */
  private applyFluctuation(sensorType: keyof EmulatorConfig['sensorRanges']): number {
    const sensor = this.config.sensorRanges[sensorType];
    const fluctuation = (Math.random() * 2 - 1) * sensor.fluctuation;
    
    // Aplicar flutuação e garantir que esteja dentro dos limites
    let newValue = sensor.current + fluctuation;
    newValue = Math.max(sensor.min, Math.min(sensor.max, newValue));
    
    return parseFloat(newValue.toFixed(2)); // Arredondar para 2 casas decimais
  }
}

// Exportar instância única do emulador
export const emulatorService = new EmulatorService();