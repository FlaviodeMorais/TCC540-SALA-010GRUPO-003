import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Activity } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// Tipos
type SensorSource = 'hardware' | 'virtual';

interface SensorSources {
  temperature: SensorSource;
  level: SensorSource;
  pumpStatus: SensorSource;
  heaterStatus: SensorSource;
  operationMode: SensorSource;
  targetTemp: SensorSource;
  pumpOnTimer: SensorSource;
  pumpOffTimer: SensorSource;
}

// Mapeamento de nomes de sensores para exibição
const sensorNames: Record<keyof SensorSources, string> = {
  temperature: 'Temperatura',
  level: 'Nível de Água',
  pumpStatus: 'Status da Bomba',
  heaterStatus: 'Status do Aquecedor',
  operationMode: 'Modo de Operação',
  targetTemp: 'Temperatura Alvo',
  pumpOnTimer: 'Timer Ligado',
  pumpOffTimer: 'Timer Desligado'
};

// Componente
const SensorSourceControl: React.FC = () => {
  const [sources, setSources] = useState<SensorSources | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('basic');
  const { toast } = useToast();

  // Carregar dados iniciais
  useEffect(() => {
    fetchSources();
  }, []);

  // Buscar fontes dos sensores
  const fetchSources = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/fallback/sources');
      const data = await response.json();
      
      if (data.success) {
        setSources(data.sources);
      } else {
        throw new Error(data.error || 'Falha ao buscar fonte dos sensores');
      }
    } catch (error) {
      console.error('Erro ao buscar fonte dos sensores:', error);
      toast({
        title: "Erro",
        description: "Não foi possível obter a fonte dos sensores",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Atualizar fonte de um sensor
  const updateSource = async (sensor: keyof SensorSources, source: SensorSource) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/fallback/sources/${sensor}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ source })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSources(data.sources);
        toast({
          title: "Sucesso",
          description: `Fonte do sensor ${sensorNames[sensor]} alterada para ${source === 'hardware' ? 'Hardware' : 'Virtual'}`,
          variant: "default"
        });
      } else {
        throw new Error(data.error || 'Falha ao atualizar fonte do sensor');
      }
    } catch (error) {
      console.error(`Erro ao atualizar fonte do sensor ${sensor}:`, error);
      toast({
        title: "Erro",
        description: `Não foi possível alterar a fonte do sensor ${sensorNames[sensor]}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Handler para alterar fonte
  const handleSourceChange = (sensor: keyof SensorSources, source: SensorSource) => {
    if (sources && sources[sensor] !== source) {
      updateSource(sensor, source);
    }
  };

  // Renderizar controle para um sensor
  const renderSensorControl = (sensor: keyof SensorSources) => {
    if (!sources) return null;
    
    return (
      <div className="space-y-2 py-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={`source-${sensor}`} className="text-sm font-medium">
            {sensorNames[sensor]}
          </Label>
        </div>
        <RadioGroup 
          id={`source-${sensor}`} 
          value={sources[sensor]} 
          className="flex space-x-4"
          onValueChange={(value) => handleSourceChange(sensor, value as SensorSource)}
        >
          <div className="flex items-center space-x-1">
            <RadioGroupItem value="hardware" id={`hardware-${sensor}`} disabled={loading} />
            <Label htmlFor={`hardware-${sensor}`} className="text-xs">Hardware</Label>
          </div>
          <div className="flex items-center space-x-1">
            <RadioGroupItem value="virtual" id={`virtual-${sensor}`} disabled={loading} />
            <Label htmlFor={`virtual-${sensor}`} className="text-xs">Virtual</Label>
          </div>
        </RadioGroup>
      </div>
    );
  };

  if (!sources) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-md flex items-center justify-between">
            Fonte dos Sensores
            <Button 
              variant="outline" 
              size="icon"
              onClick={fetchSources}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-muted-foreground">Carregando fontes dos sensores...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-md flex items-center justify-between">
          <div className="flex items-center">
            <Activity className="mr-2 h-5 w-5" />
            Fonte dos Sensores
          </div>
          <Button 
            variant="outline" 
            size="icon"
            onClick={fetchSources}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="basic" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic">Sensores Básicos</TabsTrigger>
            <TabsTrigger value="config">Configurações</TabsTrigger>
          </TabsList>
          
          <TabsContent value="basic" className="space-y-4 pt-3">
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Sensores Primários</h3>
              <p className="text-xs text-muted-foreground">
                Fonte de dados dos sensores principais do sistema
              </p>
            </div>
            
            {renderSensorControl('temperature')}
            {renderSensorControl('level')}
            
            <Separator className="my-3" />
            
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Dispositivos de Controle</h3>
              <p className="text-xs text-muted-foreground">
                Fonte de dados dos atuadores do sistema
              </p>
            </div>
            
            {renderSensorControl('pumpStatus')}
            {renderSensorControl('heaterStatus')}
          </TabsContent>
          
          <TabsContent value="config" className="space-y-4 pt-3">
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Parâmetros de Configuração</h3>
              <p className="text-xs text-muted-foreground">
                Fonte de dados dos parâmetros configuráveis
              </p>
            </div>
            
            {renderSensorControl('operationMode')}
            {renderSensorControl('targetTemp')}
            
            <Separator className="my-3" />
            
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Temporizadores</h3>
              <p className="text-xs text-muted-foreground">
                Fonte de dados dos temporizadores da bomba
              </p>
            </div>
            
            {renderSensorControl('pumpOnTimer')}
            {renderSensorControl('pumpOffTimer')}
          </TabsContent>
        </Tabs>
        
        <div className="mt-4">
          <p className="text-xs text-muted-foreground italic">
            Hardware: Dados obtidos do hardware real via ThingSpeak<br />
            Virtual: Dados gerados pelo emulador local
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default SensorSourceControl;