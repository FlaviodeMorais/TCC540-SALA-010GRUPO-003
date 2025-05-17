import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface PumpFlowControlProps {
  currentFlow: number;
  onFlowChange?: (value: number) => void;
}

export function PumpFlowControl({ currentFlow = 70, onFlowChange }: PumpFlowControlProps) {
  const [flowValue, setFlowValue] = useState(currentFlow);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Atualizar o valor interno quando o currentFlow mudar
  useEffect(() => {
    if (!isDragging) {
      setFlowValue(currentFlow);
    }
  }, [currentFlow, isDragging]);
  
  // Mutation para atualizar a vazão da bomba
  const updatePumpFlowMutation = useMutation({
    mutationFn: async (flowRate: number) => {
      try {
        const response = await fetch('/api/emulator/control/pump-flow', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ flowRate })
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Falha ao atualizar vazão da bomba');
        }
        
        return await response.json();
      } catch (error) {
        console.error('Erro ao atualizar vazão da bomba:', error);
        throw error;
      }
    },
    onSuccess: () => {
      // Invalidar a query para atualizar os dados
      queryClient.invalidateQueries({ queryKey: ['/api/emulator/virtual-sensors'] });
      queryClient.invalidateQueries({ queryKey: ['/api/emulator/status'] });
      
      toast({
        title: 'Vazão atualizada',
        description: `Vazão da bomba definida para ${flowValue}%`,
      });
      
      // Chamar callback se fornecido
      if (onFlowChange) {
        onFlowChange(flowValue);
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar vazão',
        description: `Ocorreu um erro: ${error.message}`,
        variant: 'destructive',
      });
    }
  });
  
  // Handler para quando o usuário arrastar o slider
  const handleSliderDrag = (value: number[]) => {
    setIsDragging(true);
    setFlowValue(value[0]);
  };
  
  // Handler para quando o usuário soltar o slider
  const handleSliderCommit = () => {
    setIsDragging(false);
    
    // Enviar o valor atual para a API
    updatePumpFlowMutation.mutate(flowValue);
  };
  
  return (
    <Card className="shadow-md h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl text-primary">
          <i className="fas fa-tint mr-2"></i> Controle de Vazão
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label htmlFor="pump-flow">Vazão da Bomba</Label>
            <span className="text-lg font-semibold">{flowValue}%</span>
          </div>
          
          <Slider
            id="pump-flow"
            max={100}
            step={5}
            value={[flowValue]}
            onValueChange={handleSliderDrag}
            onValueCommit={handleSliderCommit}
            className="py-4"
          />
          
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Min (0%)</span>
            <span>Max (100%)</span>
          </div>
        </div>
        
        {/* Botões de controles rápidos */}
        <div className="grid grid-cols-3 gap-2 pt-2">
          <Button 
            size="sm" 
            variant="outline" 
            className="w-full"
            onClick={() => {
              setFlowValue(0);
              updatePumpFlowMutation.mutate(0);
            }}
          >
            0%
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            className="w-full"
            onClick={() => {
              setFlowValue(50);
              updatePumpFlowMutation.mutate(50);
            }}
          >
            50%
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            className="w-full"
            onClick={() => {
              setFlowValue(100);
              updatePumpFlowMutation.mutate(100);
            }}
          >
            100%
          </Button>
        </div>
        
        <div className="text-sm text-muted-foreground mt-4">
          <p>Controle a vazão da bomba d'água do sistema aquapônico. Valores mais altos aumentam a circulação de água.</p>
        </div>
      </CardContent>
    </Card>
  );
}