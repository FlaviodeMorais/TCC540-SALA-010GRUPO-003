import { apiRequest } from "./queryClient";
import { 
  isDirectDeviceControlEnabled,
  isGitHubPagesEnv
} from "./api-config";

// Função auxiliar para atualizar o ThingSpeak diretamente
async function updateThingspeakDirectly(field: number, value: number): Promise<boolean> {
  try {
    // Simular uma atualização bem-sucedida (em um ambiente real, isso faria uma chamada de API)
    console.log(`Simulando atualização do campo ${field} para o valor ${value}`);
    return true;
  } catch (error) {
    console.error('Error updating ThingSpeak directly:', error);
    return false;
  }
}

// Update target temperature (field6)
export async function updateTargetTemperature(targetTemp: number): Promise<{ success: boolean; targetTemp: number }> {
  // Se estamos no GitHub Pages, usar ThingSpeak diretamente se permitido
  if (isGitHubPagesEnv()) {
    // Verificar se o controle direto está habilitado
    if (!isDirectDeviceControlEnabled()) {
      return { 
        success: false, 
        targetTemp: targetTemp // Retornar o valor que foi solicitado para melhor UX
      };
    }
    
    const success = await updateThingspeakDirectly(6, targetTemp);
    return {
      success,
      targetTemp: targetTemp // Assumimos o valor solicitado
    };
  }
  
  // Comportamento normal usando a API local
  const timestamp = new Date().getTime();
  const res = await apiRequest("POST", `/api/control/targettemp?t=${timestamp}`, { targetTemp }, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
  return res.json();
}

// Update pump on timer (field7)
export async function updatePumpOnTimer(pumpOnTimer: number): Promise<{ success: boolean; pumpOnTimer: number }> {
  // Se estamos no GitHub Pages, usar ThingSpeak diretamente se permitido
  if (isGitHubPagesEnv()) {
    // Verificar se o controle direto está habilitado
    if (!isDirectDeviceControlEnabled()) {
      return { 
        success: false, 
        pumpOnTimer: pumpOnTimer // Retornar o valor que foi solicitado para melhor UX
      };
    }
    
    const success = await updateThingspeakDirectly(7, pumpOnTimer);
    return {
      success,
      pumpOnTimer: pumpOnTimer // Assumimos o valor solicitado
    };
  }
  
  // Comportamento normal usando a API local
  const timestamp = new Date().getTime();
  const res = await apiRequest("POST", `/api/control/pumpontimer?t=${timestamp}`, { pumpOnTimer }, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
  return res.json();
}

// Update pump off timer (field8)
export async function updatePumpOffTimer(pumpOffTimer: number): Promise<{ success: boolean; pumpOffTimer: number }> {
  // Se estamos no GitHub Pages, usar ThingSpeak diretamente se permitido
  if (isGitHubPagesEnv()) {
    // Verificar se o controle direto está habilitado
    if (!isDirectDeviceControlEnabled()) {
      return { 
        success: false, 
        pumpOffTimer: pumpOffTimer // Retornar o valor que foi solicitado para melhor UX
      };
    }
    
    const success = await updateThingspeakDirectly(8, pumpOffTimer);
    return {
      success,
      pumpOffTimer: pumpOffTimer // Assumimos o valor solicitado
    };
  }
  
  // Comportamento normal usando a API local
  const timestamp = new Date().getTime();
  const res = await apiRequest("POST", `/api/control/pumpofftimer?t=${timestamp}`, { pumpOffTimer }, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
  return res.json();
}

// Obter o estado atual do ciclo da bomba em modo automático
export interface PumpCycleState {
  success: boolean;
  active: boolean;  // Mantendo como 'active' para compatibilidade com a API
  startTime: number;
  timeRemaining: number;
  currentTimerValue: number;
  currentTimerTotal: number;
  pumpStatus: boolean;
}

export async function getPumpCycleState(): Promise<PumpCycleState> {
  // Se estamos no GitHub Pages, retorna um estado simulado
  if (isGitHubPagesEnv()) {
    // Valores simulados para GitHub Pages
    return { 
      success: true, 
      active: false,
      startTime: Date.now(),
      timeRemaining: 0,
      currentTimerValue: 0,
      currentTimerTotal: 0,
      pumpStatus: false
    };
  }
  
  // Comportamento normal usando a API local
  const timestamp = new Date().getTime();
  try {
    const res = await apiRequest("GET", `/api/automation/pump-cycle?t=${timestamp}`, undefined, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
    return await res.json();
  } catch (error) {
    console.error("Error fetching pump cycle state:", error);
    // Retornar estado padrão em caso de erro
    return {
      success: false,
      active: false,
      startTime: Date.now(),
      timeRemaining: 0,
      currentTimerValue: 0,
      currentTimerTotal: 0,
      pumpStatus: false
    };
  }
}