import { useState, useEffect } from 'react';
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatNumber } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface VirtualSensorsDisplayProps {
  data: any;
  isLoading: boolean;
  error: Error | null;
  refreshInterval?: number;
}

interface Sensor {
  label: string;
  value: number;
  unit: string;
  color: string;
  icon: string;
}

export function VirtualSensorsDisplay({ 
  data, 
  isLoading, 
  error, 
  refreshInterval = 2000 
}: VirtualSensorsDisplayProps) {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Atualizar o lastUpdated quando os dados mudarem
  useEffect(() => {
    if (data && data.timestamp) {
      setLastUpdated(new Date());
    }
  }, [data]);

  const formatSensorValue = (value: number, unit: string, decimals: number = 1) => {
    return `${formatNumber(value, decimals)} ${unit}`;
  };

  // Mapear sensores para exibição
  const getSensors = (): Sensor[] => {
    if (!data?.sensors) return [];
    
    return [
      { 
        label: 'Temperatura da Água', 
        value: data.sensors.waterTemp, 
        unit: '°C',
        color: 'bg-blue-500',
        icon: 'fas fa-temperature-high'
      },
      { 
        label: 'Temperatura do Ar', 
        value: data.sensors.airTemp, 
        unit: '°C',
        color: 'bg-yellow-500',
        icon: 'fas fa-sun'
      },
      { 
        label: 'Nível da Água', 
        value: data.sensors.waterLevel, 
        unit: '%',
        color: 'bg-cyan-500',
        icon: 'fas fa-water'
      },
      { 
        label: 'Vazão', 
        value: data.sensors.flowRate, 
        unit: 'L/min',
        color: 'bg-blue-400',
        icon: 'fas fa-tint'
      },
      { 
        label: 'Umidade', 
        value: data.sensors.humidity, 
        unit: '%',
        color: 'bg-teal-500',
        icon: 'fas fa-cloud'
      },
      { 
        label: 'Pressão da Bomba', 
        value: data.sensors.pumpPressure, 
        unit: 'kPa',
        color: 'bg-red-500',
        icon: 'fas fa-thermometer'
      },
      { 
        label: 'pH', 
        value: data.sensors.phLevel, 
        unit: '',
        color: 'bg-green-500',
        icon: 'fas fa-flask'
      },
      { 
        label: 'Nível de Oxigênio', 
        value: data.sensors.oxygenLevel, 
        unit: 'mg/L',
        color: 'bg-blue-600',
        icon: 'fas fa-wind'
      }
    ];
  };

  // Verificar se o emulador está ativo
  const isEmulatorActive = data?.success !== false;

  return (
    <div className="space-y-6">
      {lastUpdated && (
        <div className="text-xs text-muted-foreground">
          Última atualização: {lastUpdated.toLocaleTimeString('pt-BR')}
        </div>
      )}
      
      {/* Mensagem quando o emulador está inativo */}
      {!isEmulatorActive && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-md mb-4">
          <i className="fas fa-exclamation-triangle mr-2"></i>
          O emulador não está ativo. Para ver os valores dos sensores virtuais, ative o emulador na página de Fonte de Dados.
        </div>
      )}
      
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-card rounded-lg p-3 border">
              <Skeleton className="h-5 w-32 mb-2" />
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md">
          <i className="fas fa-exclamation-circle mr-2"></i>
          Erro ao carregar sensores: {error.message}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {getSensors().map((sensor, index) => (
            <div key={index} className="bg-card rounded-lg p-3 border hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`${sensor.color} text-white p-1.5 rounded-full`}>
                  <i className={`${sensor.icon} text-xs`}></i>
                </div>
                <Label className="text-sm text-gray-600">{sensor.label}</Label>
              </div>
              <div className="text-lg font-semibold">
                {formatSensorValue(sensor.value, sensor.unit)}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Separador */}
      <Separator className="my-4" />
      
      {/* Status dos Dispositivos */}
      <div className="mt-4">
        <h3 className="text-md font-medium mb-3">Estado dos Dispositivos</h3>
        
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !error && data?.controlStates ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Bomba */}
            <div className="bg-card rounded-lg p-3 border flex flex-col justify-between">
              <Label className="text-sm text-gray-600">Bomba d'água</Label>
              <div className="flex items-center mt-1">
                <div className={`${data.controlStates.pumpStatus ? 'bg-green-500' : 'bg-gray-300'} 
                  rounded-full w-3 h-3 mr-2`}></div>
                <span className="text-lg font-semibold">
                  {data.controlStates.pumpStatus ? 'Ligada' : 'Desligada'}
                </span>
              </div>
            </div>
            
            {/* Aquecedor */}
            <div className="bg-card rounded-lg p-3 border flex flex-col justify-between">
              <Label className="text-sm text-gray-600">Aquecedor</Label>
              <div className="flex items-center mt-1">
                <div className={`${data.controlStates.heaterStatus ? 'bg-orange-500' : 'bg-gray-300'} 
                  rounded-full w-3 h-3 mr-2`}></div>
                <span className="text-lg font-semibold">
                  {data.controlStates.heaterStatus ? 'Ligado' : 'Desligado'}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}