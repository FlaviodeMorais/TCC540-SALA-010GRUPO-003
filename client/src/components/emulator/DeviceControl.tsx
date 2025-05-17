import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';

interface DeviceControlProps {
  deviceType: 'pump' | 'heater';
  initialStatus: boolean;
  onStatusChange?: (status: boolean) => void;
}

export function DeviceControl({ deviceType, initialStatus, onStatusChange }: DeviceControlProps) {
  const [status, setStatus] = useState(initialStatus);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Atualizar o status interno quando o initialStatus mudar
  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);
  
  const deviceLabels = {
    pump: {
      title: 'Controle da Bomba',
      icon: 'fas fa-pump-soap',
      description: 'Controle a bomba d\'água do sistema aquapônico. A bomba é responsável pela circulação da água entre os tanques.'
    },
    heater: {
      title: 'Controle do Aquecedor',
      icon: 'fas fa-temperature-high',
      description: 'Controle o aquecedor do sistema aquapônico. O aquecedor mantém a temperatura da água adequada para os peixes.'
    }
  };
  
  // Mutation para atualizar o status do dispositivo
  const updateDeviceStatusMutation = useMutation({
    mutationFn: async (newStatus: boolean) => {
      try {
        const endpoint = deviceType === 'pump' 
          ? '/api/emulator/control/pump' 
          : '/api/emulator/control/heater';
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status: newStatus })
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `Falha ao atualizar status do ${deviceType}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error(`Erro ao atualizar status do ${deviceType}:`, error);
        throw error;
      }
    },
    onSuccess: (data) => {
      // Invalidar a query para atualizar os dados
      queryClient.invalidateQueries({ queryKey: ['/api/emulator/virtual-sensors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/emulator/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/device/status'] });
      
      // Extrair o status do dispositivo da resposta
      const deviceStatus = deviceType === 'pump' 
        ? data.pumpStatus 
        : data.heaterStatus;
      
      setStatus(deviceStatus);
      
      toast({
        title: `${deviceType === 'pump' ? 'Bomba' : 'Aquecedor'} atualizado`,
        description: `Dispositivo ${deviceStatus ? 'LIGADO' : 'DESLIGADO'}`,
      });
      
      // Chamar callback se fornecido
      if (onStatusChange) {
        onStatusChange(deviceStatus);
      }
    },
    onError: (error: Error) => {
      toast({
        title: `Erro ao atualizar ${deviceType === 'pump' ? 'bomba' : 'aquecedor'}`,
        description: `Ocorreu um erro: ${error.message}`,
        variant: 'destructive',
      });
    }
  });
  
  // Toggle handler
  const handleToggle = (newStatus: boolean) => {
    updateDeviceStatusMutation.mutate(newStatus);
  };

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl text-primary flex items-center justify-between">
          <div>
            <i className={`${deviceLabels[deviceType].icon} mr-2`}></i> 
            {deviceLabels[deviceType].title}
          </div>
          <Badge variant={status ? "default" : "outline"}>
            {status ? "LIGADO" : "DESLIGADO"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <Label htmlFor={`${deviceType}-status`} className="flex-1">
            Status do dispositivo
          </Label>
          <div className="flex items-center space-x-3">
            <Switch
              id={`${deviceType}-status`}
              checked={status}
              onCheckedChange={handleToggle}
              disabled={updateDeviceStatusMutation.isPending}
            />
            <span>{status ? "ON" : "OFF"}</span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <Button 
            variant={status ? "outline" : "default"} 
            size="sm"
            onClick={() => handleToggle(false)}
            disabled={updateDeviceStatusMutation.isPending || !status}
          >
            Desligar
          </Button>
          <Button 
            variant={status ? "default" : "outline"} 
            size="sm"
            onClick={() => handleToggle(true)}
            disabled={updateDeviceStatusMutation.isPending || status}
          >
            Ligar
          </Button>
        </div>
        
        <div className="text-sm text-muted-foreground mt-4">
          <p>{deviceLabels[deviceType].description}</p>
        </div>
      </CardContent>
    </Card>
  );
}