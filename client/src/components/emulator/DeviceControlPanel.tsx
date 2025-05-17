import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeviceControl } from './DeviceControl';
import { useDeviceMode } from '@/contexts/DeviceModeContext';
import { useQuery } from '@tanstack/react-query';

interface DeviceControlPanelProps {
  refreshInterval?: number;
}

export function DeviceControlPanel({ refreshInterval = 5000 }: DeviceControlPanelProps) {
  const { isEmulatorEnabled } = useDeviceMode();
  const [pumpStatus, setPumpStatus] = useState(false);
  const [heaterStatus, setHeaterStatus] = useState(false);
  
  // Buscar o status atual dos dispositivos
  const { data } = useQuery<any>({
    queryKey: ['/api/device/status'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/device/status');
        
        if (!response.ok) {
          throw new Error('Falha ao obter status dos dispositivos');
        }
        
        return await response.json();
      } catch (error) {
        console.error('Erro ao buscar status dos dispositivos:', error);
        throw error;
      }
    },
    refetchInterval: refreshInterval,
    refetchOnWindowFocus: true,
  });
  
  // Atualizar os estados locais quando os dados forem carregados
  useEffect(() => {
    if (data) {
      setPumpStatus(data.pumpStatus);
      setHeaterStatus(data.heaterStatus);
    }
  }, [data]);
  
  // Se o emulador não estiver ativo, não renderizamos este componente
  if (!isEmulatorEnabled) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl text-primary">
            <i className="fas fa-sliders-h mr-2"></i> Controle de Dispositivos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DeviceControl 
              deviceType="pump"
              initialStatus={pumpStatus}
              onStatusChange={setPumpStatus}
            />
            <DeviceControl 
              deviceType="heater"
              initialStatus={heaterStatus}
              onStatusChange={setHeaterStatus}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}