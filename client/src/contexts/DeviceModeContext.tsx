import React, { createContext, useState, useContext, useEffect } from 'react';

type DeviceMode = 'NODEMCU' | 'EMULATOR';

// Interface para o modo atual e controles do dispositivo
interface DeviceModeContextType {
  mode: DeviceMode;
  setMode: (mode: DeviceMode) => void;
  toggleMode: () => void;
  isEmulatorEnabled: boolean;
  emulatorConfig: EmulatorConfig | null;
  applySystemSettings: (config: Partial<EmulatorConfig>) => Promise<boolean>;
}

// Interface do estado da configuração do emulador
export interface SensorConfig {
  min: number;
  max: number;
  current: number;
  fluctuation: number;
}

export interface EmulatorConfig {
  enabled: boolean;
  updateInterval: number;
  sensorRanges: {
    waterTemp: SensorConfig;
    airTemp: SensorConfig;
    waterLevel: SensorConfig;
    flowRate: SensorConfig;
    humidity: SensorConfig;
    pumpPressure: SensorConfig;
    phLevel: SensorConfig;
    oxygenLevel: SensorConfig;
  };
  controlStates: {
    pumpStatus: boolean;
    heaterStatus: boolean;
    pumpFlow: number;
  };
  mode: 'stable' | 'fluctuating' | 'random' | 'scenario';
  scenarioName?: string;
}

// Valor inicial do contexto
const DeviceModeContext = createContext<DeviceModeContextType>({
  mode: 'NODEMCU',
  setMode: () => {},
  toggleMode: () => {},
  isEmulatorEnabled: false,
  emulatorConfig: null,
  applySystemSettings: async () => false,
});

export function DeviceModeProvider({ children }: { children: React.ReactNode }) {
  // Recuperar modo salvo do localStorage ou usar o padrão
  const savedMode = localStorage.getItem('aquaponia_device_mode') as DeviceMode | null;
  const [mode, setMode] = useState<DeviceMode>(savedMode || 'NODEMCU');
  const [isEmulatorEnabled, setIsEmulatorEnabled] = useState<boolean>(false);
  const [emulatorConfig, setEmulatorConfig] = useState<EmulatorConfig | null>(null);

  // Verificar se o emulador está ativo e obter sua configuração
  useEffect(() => {
    const checkEmulatorStatus = async () => {
      try {
        const response = await fetch('/api/emulator/status');
        const data = await response.json();
        setIsEmulatorEnabled(data.enabled);
        setEmulatorConfig(data.config);
        
        // Se o emulador estiver ativo, definir o modo como EMULATOR
        if (data.enabled && mode !== 'EMULATOR') {
          setMode('EMULATOR');
        } else if (!data.enabled && mode !== 'NODEMCU') {
          setMode('NODEMCU');
        }
      } catch (error) {
        console.error('Erro ao verificar status do emulador:', error);
        setIsEmulatorEnabled(false);
      }
    };
    
    // Verificar inicialmente
    checkEmulatorStatus();
    
    // Configurar intervalo para verificar periodicamente
    const interval = setInterval(checkEmulatorStatus, 10000);
    
    return () => clearInterval(interval);
  }, [mode]);
  
  // Salvar modo no localStorage quando mudar
  useEffect(() => {
    localStorage.setItem('aquaponia_device_mode', mode);
  }, [mode]);

  // Alternar entre os modos
  const toggleMode = () => {
    const newMode = mode === 'NODEMCU' ? 'EMULATOR' : 'NODEMCU';
    setMode(newMode);
    localStorage.setItem('aquaponia_device_mode', newMode);
  };

  // Aplicar configurações do sistema (emulador e nodeMCU) e salvar no localStorage
  const applySystemSettings = async (config: Partial<EmulatorConfig>): Promise<boolean> => {
    try {
      // Atualizar configuração do emulador
      const response = await fetch('/api/emulator/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      
      if (!response.ok) {
        throw new Error('Falha ao aplicar configurações do sistema');
      }
      
      const result = await response.json();
      
      // Atualizar estado local e salvar no localStorage
      if (result.success) {
        setEmulatorConfig(result.config);
        
        // Salvar configurações do emulador no localStorage
        localStorage.setItem('aquaponia_emulator_config', JSON.stringify(result.config));
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Erro ao aplicar configurações do sistema:', error);
      return false;
    }
  };

  return (
    <DeviceModeContext.Provider 
      value={{ 
        mode, 
        setMode, 
        toggleMode,
        isEmulatorEnabled,
        emulatorConfig,
        applySystemSettings
      }}
    >
      {children}
    </DeviceModeContext.Provider>
  );
}

export function useDeviceMode() {
  return useContext(DeviceModeContext);
}