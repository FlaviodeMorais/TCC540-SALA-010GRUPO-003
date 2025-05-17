import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useQuery } from '@tanstack/react-query';
import { VirtualSensorsDisplay } from './VirtualSensorsDisplay';
import { PumpFlowControl } from './PumpFlowControl';
import { DeviceControlPanel } from './DeviceControlPanel';
import { useDeviceMode } from '@/contexts/DeviceModeContext';

interface VirtualSensorsPanelProps {
  refreshInterval?: number;
}

export function VirtualSensorsPanel({ refreshInterval = 5000 }: VirtualSensorsPanelProps) {
  const { isEmulatorEnabled } = useDeviceMode();
  const [currentFlow, setCurrentFlow] = useState(0);
  
  // Buscar dados dos sensores virtuais
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ['/api/emulator/virtual-sensors'],
    queryFn: async () => {
      try {
        // Usar o apiRequest da queryClient para fazer a requisição corretamente
        const response = await fetch('/api/emulator/virtual-sensors', {
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Falha ao buscar sensores virtuais: ${response.status}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.warn('Resposta não é JSON:', contentType);
          throw new Error('Servidor não retornou JSON válido');
        }
        
        const data = await response.json();
        
        // Atualizar o estado do fluxo atual da bomba
        if (data.controlStates && typeof data.controlStates.pumpFlow === 'number') {
          setCurrentFlow(data.controlStates.pumpFlow);
        }
        
        return data;
      } catch (error) {
        console.error('Erro ao buscar sensores virtuais:', error);
        throw error;
      }
    },
    refetchInterval: refreshInterval,
    enabled: isEmulatorEnabled,
    retry: false,
    refetchOnWindowFocus: true,
  });

  // Se o emulador não estiver ativo, não renderizamos este componente
  if (!isEmulatorEnabled) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Painel de sensores */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="shadow-md h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl text-primary">
                <i className="fas fa-microchip mr-2"></i> Sensores Virtuais
              </CardTitle>
            </CardHeader>
            <CardContent>
              <VirtualSensorsDisplay 
                data={data}
                isLoading={isLoading}
                error={error}
              />
            </CardContent>
          </Card>
        </div>
        
        <div className="lg:col-span-1">
          <PumpFlowControl 
            currentFlow={currentFlow}
            onFlowChange={setCurrentFlow}
          />
        </div>
      </div>
      
      {/* Painel de controle de dispositivos */}
      <DeviceControlPanel refreshInterval={refreshInterval} />
    </div>
  );
}