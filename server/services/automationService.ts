/**
 * AutomationService - Responsável pelo controle preciso dos ciclos de automação
 * 
 * Este serviço implementa um controlador de automação que:
 * 1. Gerencia o temporizador da bomba no modo automático
 * 2. Garante que os tempos exatos configurados sejam respeitados
 * 3. Mantém a bomba ligada/desligada pelos períodos especificados
 */
import { updatePumpStatus } from './thingspeakService';

interface CycleState {
  isActive: boolean;
  startTime: number;
  timeRemaining: number;
  currentTimer: number;
  currentTimerTotal: number;
  pumpStatus: boolean;
}

class AutomationService {
  private static instance: AutomationService;
  
  // Estado atual do ciclo
  private cycleState: CycleState = {
    isActive: false,
    startTime: 0,
    timeRemaining: 0,
    currentTimer: 0,
    currentTimerTotal: 0,
    pumpStatus: false
  };
  
  // Timer para verificação do ciclo
  private intervalId: NodeJS.Timeout | null = null;
  
  // Modo automático está habilitado
  private autoModeEnabled: boolean = false;
  
  // Valor dos timers
  private pumpOnTimer: number = 30;  // segundos padrão
  private pumpOffTimer: number = 30; // segundos padrão
  
  // Constante para intervalo de verificação
  private readonly CHECK_INTERVAL_MS = 1000; // Verifica a cada 1 segundo
  
  // Último status conhecido da bomba
  private lastPumpStatus: boolean = false;
  
  private constructor() {
    console.log('🤖 Iniciando serviço de automação de ciclos...');
  }
  
  /**
   * Obtém a instância única do serviço
   */
  public static getInstance(): AutomationService {
    if (!AutomationService.instance) {
      AutomationService.instance = new AutomationService();
    }
    return AutomationService.instance;
  }
  
  /**
   * Inicia o serviço de automação
   */
  public start(): void {
    // Só inicia se não estiver rodando
    if (this.intervalId) {
      return;
    }
    
    // Inicia o timer de verificação constante
    this.intervalId = setInterval(() => this.checkCycle(), this.CHECK_INTERVAL_MS);
    
    // Verifica o estado atual após 5 segundos para garantir que tudo está inicializado
    setTimeout(() => {
      if (this.autoModeEnabled && !this.cycleState.isActive) {
        console.log('🔍 Verificação inicial: Modo automático ativo, mas ciclo inativo. Iniciando ciclo.');
        this.startNewCycle(this.lastPumpStatus);
      }
    }, 5000);
  }
  
  /**
   * Força o início de um novo ciclo (usado para depuração)
   */
  public forceStartCycle(): void {
    // Para depuração, forçar o inicio mesmo que o modo automático não esteja ativo
    console.log(`⚡ Forçando início de um novo ciclo com bomba ${this.lastPumpStatus ? 'LIGADA' : 'DESLIGADA'}`);
    console.log(`⚙️ Status atual: autoModeEnabled = ${this.autoModeEnabled}, isActive = ${this.cycleState.isActive}`);
    
    // Garantir que o modo automático está ativo
    this.autoModeEnabled = true;
    
    // Iniciar o ciclo
    this.startNewCycle(this.lastPumpStatus);
  }
  
  /**
   * Para o serviço de automação
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.cycleState.isActive = false;
    }
  }
  
  /**
   * Atualiza os timers usados para controle da bomba
   */
  public updateTimers(onTimer: number, offTimer: number): void {
    this.pumpOnTimer = onTimer;
    this.pumpOffTimer = offTimer;
    
    // Se um ciclo estiver ativo, atualiza os tempos restantes proporcionalmente
    if (this.cycleState.isActive) {
      const currentStatus = this.cycleState.pumpStatus;
      const newTotal = currentStatus ? onTimer : offTimer;
      const oldTotal = this.cycleState.currentTimerTotal;
      
      // Calcula a porcentagem completa do ciclo atual
      const percentComplete = (oldTotal - this.cycleState.timeRemaining) / oldTotal;
      
      // Atualiza o tempo restante para manter a mesma porcentagem no novo timer
      this.cycleState.currentTimerTotal = newTotal;
      this.cycleState.timeRemaining = Math.round(newTotal * (1 - percentComplete));
    }
  }
  
  /**
   * Atualiza o status do modo automático
   */
  public setAutoMode(enabled: boolean): void {
    // Se o modo automático está sendo habilitado
    if (enabled && !this.autoModeEnabled) {
      this.autoModeEnabled = true;
      console.log('🔄 Modo automático ativado, iniciando ciclos');
      // Forçar início do ciclo com um atraso curto para garantir que outras inicializações terminaram
      setTimeout(() => {
        this.startNewCycle(this.lastPumpStatus);
        console.log('🚀 Ciclo automático iniciado com delay para sincronização');
      }, 1000);
    }
    // Se já está no modo automático, verifica se o ciclo está ativo
    else if (enabled && this.autoModeEnabled && !this.cycleState.isActive) {
      console.log('🔄 Modo automático já ativo, mas ciclo inativo. Reiniciando ciclo.');
      this.startNewCycle(this.lastPumpStatus);
    }
    // Se o modo automático está sendo desabilitado
    else if (!enabled && this.autoModeEnabled) {
      this.autoModeEnabled = false;
      this.cycleState.isActive = false;
      console.log('🛑 Modo automático desativado, interrompendo ciclos');
    }
  }
  
  /**
   * Atualiza o status da bomba
   */
  public setPumpStatus(status: boolean): void {
    this.lastPumpStatus = status;
    
    // Se a bomba mudou de estado e o modo automático está ativo,
    // inicia um novo ciclo com o estado atual
    if (this.autoModeEnabled && this.cycleState.pumpStatus !== status) {
      console.log(`🔄 Estado da bomba alterado externamente para: ${status ? 'LIGADA' : 'DESLIGADA'}`);
      this.startNewCycle(status);
    }
  }
  
  /**
   * Determina se um ciclo deve começar ou terminar, baseado no tempo decorrido
   * e nos valores configurados pelo usuário (pumpOnTimer e pumpOffTimer)
   */
  private async checkCycle(): Promise<void> {
    // Só executa se o modo automático estiver ativo
    if (!this.autoModeEnabled) {
      return;
    }
    
    // Se o ciclo não está ativo, iniciar novo ciclo
    if (!this.cycleState.isActive) {
      console.log('🔄 Ciclo não está ativo, iniciando novo ciclo com bomba ' + (this.lastPumpStatus ? 'LIGADA' : 'DESLIGADA'));
      this.startNewCycle(this.lastPumpStatus); // Usa o estado atual da bomba
      return;
    }
    
    // Atualiza o tempo restante
    this.cycleState.timeRemaining -= 1;
    
    // Logs de debug a cada 5 segundos
    if (this.cycleState.timeRemaining % 5 === 0 || this.cycleState.timeRemaining <= 5) {
      console.log(`⏱️ Ciclo em andamento: bomba ${this.cycleState.pumpStatus ? 'LIGADA' : 'DESLIGADA'} por mais ${this.cycleState.timeRemaining}s de ${this.cycleState.currentTimerTotal}s totais`);
    }
    
    // Verifica se o ciclo atual chegou ao fim
    if (this.cycleState.timeRemaining <= 0) {
      // Alterna o estado da bomba
      const newPumpStatus = !this.cycleState.pumpStatus;
      console.log(`⏱️ Tempo de ciclo atingido (${this.cycleState.currentTimerTotal}s), alterando bomba para: ${newPumpStatus ? 'LIGADA' : 'DESLIGADA'}`);
      
      // Envia o novo estado APENAS DA BOMBA para o ThingSpeak
      // Aqui alteramos somente o campo da bomba, sem afetar o estado do aquecedor
      try {
        await updatePumpStatus(newPumpStatus);
        this.lastPumpStatus = newPumpStatus;
        
        // Inicia um novo ciclo com o estado oposto
        this.startNewCycle(newPumpStatus);
      } catch (error) {
        console.error('❌ Erro ao alternar a bomba:', error);
      }
    }
  }
  
  /**
   * Inicia um novo ciclo com o estado da bomba especificado
   */
  private startNewCycle(pumpStatus: boolean): void {
    const timerValue = pumpStatus ? this.pumpOnTimer : this.pumpOffTimer;
    
    this.cycleState = {
      isActive: true,
      startTime: Date.now(),
      timeRemaining: timerValue,
      currentTimer: timerValue,
      currentTimerTotal: timerValue,
      pumpStatus
    };
    
    console.log(`🔄 Novo ciclo iniciado: Bomba ${pumpStatus ? 'LIGADA' : 'DESLIGADA'} por ${timerValue} segundos`);
  }
  
  /**
   * Retorna o estado atual do ciclo para informação no frontend
   */
  public getCycleState(): {
    success: boolean;
    active: boolean;
    pumpStatus: boolean;
    startTime: number;
    timeRemaining: number;
    currentTimerValue: number; 
    currentTimerTotal: number;
  } {
    return {
      success: true,
      active: this.cycleState.isActive,
      pumpStatus: this.cycleState.pumpStatus,
      startTime: this.cycleState.startTime,
      timeRemaining: this.cycleState.timeRemaining,
      currentTimerValue: this.cycleState.currentTimer,
      currentTimerTotal: this.cycleState.currentTimerTotal
    };
  }
}

export const automationService = AutomationService.getInstance();