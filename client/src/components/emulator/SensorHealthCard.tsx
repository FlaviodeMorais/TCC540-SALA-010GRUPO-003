import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw } from "lucide-react";
import { format } from 'date-fns';

// Interfaces
interface SensorHealth {
  status: 'online' | 'offline' | 'unknown';
  lastCheck: string;
  failCount: number;
  failThreshold: number;
  lastValue: any;
}

interface SensorsHealth {
  temperature: SensorHealth;
  level: SensorHealth;
  pumpStatus: SensorHealth;
  heaterStatus: SensorHealth;
  operationMode: SensorHealth;
  targetTemp: SensorHealth;
  pumpOnTimer: SensorHealth;
  pumpOffTimer: SensorHealth;
}

const SensorHealthCard: React.FC = () => {
  const [health, setHealth] = useState<SensorsHealth | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const { toast } = useToast();

  // Carregar dados iniciais
  useEffect(() => {
    fetchHealth();
  }, []);

  // Buscar estado de saúde dos sensores
  const fetchHealth = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/fallback/health');
      const data = await response.json();
      
      if (data.success) {
        setHealth(data.health);
      } else {
        throw new Error(data.error || 'Falha ao buscar dados de saúde dos sensores');
      }
    } catch (error) {
      console.error('Erro ao buscar saúde dos sensores:', error);
      toast({
        title: "Erro",
        description: "Não foi possível obter dados de saúde dos sensores",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Forçar verificação de saúde dos sensores
  const checkHealth = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/fallback/health/check', {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.success) {
        setHealth(data.health);
        toast({
          title: "Sucesso",
          description: "Verificação de saúde dos sensores realizada com sucesso",
          variant: "default"
        });
      } else {
        throw new Error(data.error || 'Falha ao verificar saúde dos sensores');
      }
    } catch (error) {
      console.error('Erro ao verificar saúde dos sensores:', error);
      toast({
        title: "Erro",
        description: "Não foi possível verificar saúde dos sensores",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Retornar badge apropriada para o status
  const getStatusBadge = (status: 'online' | 'offline' | 'unknown') => {
    switch (status) {
      case 'online':
        return <Badge className="bg-green-500">Online</Badge>;
      case 'offline':
        return <Badge variant="destructive">Offline</Badge>;
      case 'unknown':
      default:
        return <Badge variant="outline">Desconhecido</Badge>;
    }
  };

  if (!health) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-md flex items-center justify-between">
            Status de Saúde dos Sensores
            <Button 
              variant="outline" 
              size="icon"
              onClick={fetchHealth}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-muted-foreground">Carregando dados de saúde dos sensores...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-md flex items-center justify-between">
          Status de Saúde dos Sensores
          <Button 
            variant="outline" 
            size="icon"
            onClick={checkHealth}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Temperatura</p>
              <div className="flex items-center justify-between">
                {getStatusBadge(health.temperature.status)}
                <span className="text-xs text-muted-foreground">
                  Falhas: {health.temperature.failCount}/{health.temperature.failThreshold}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Nível de Água</p>
              <div className="flex items-center justify-between">
                {getStatusBadge(health.level.status)}
                <span className="text-xs text-muted-foreground">
                  Falhas: {health.level.failCount}/{health.level.failThreshold}
                </span>
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Status da Bomba</p>
              <div className="flex items-center justify-between">
                {getStatusBadge(health.pumpStatus.status)}
                <span className="text-xs text-muted-foreground">
                  Falhas: {health.pumpStatus.failCount}/{health.pumpStatus.failThreshold}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Status do Aquecedor</p>
              <div className="flex items-center justify-between">
                {getStatusBadge(health.heaterStatus.status)}
                <span className="text-xs text-muted-foreground">
                  Falhas: {health.heaterStatus.failCount}/{health.heaterStatus.failThreshold}
                </span>
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Modo de Operação</p>
              <div className="flex items-center justify-between">
                {getStatusBadge(health.operationMode.status)}
                <span className="text-xs text-muted-foreground">
                  Falhas: {health.operationMode.failCount}/{health.operationMode.failThreshold}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Temperatura Alvo</p>
              <div className="flex items-center justify-between">
                {getStatusBadge(health.targetTemp.status)}
                <span className="text-xs text-muted-foreground">
                  Falhas: {health.targetTemp.failCount}/{health.targetTemp.failThreshold}
                </span>
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Timer Ligado</p>
              <div className="flex items-center justify-between">
                {getStatusBadge(health.pumpOnTimer.status)}
                <span className="text-xs text-muted-foreground">
                  Falhas: {health.pumpOnTimer.failCount}/{health.pumpOnTimer.failThreshold}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Timer Desligado</p>
              <div className="flex items-center justify-between">
                {getStatusBadge(health.pumpOffTimer.status)}
                <span className="text-xs text-muted-foreground">
                  Falhas: {health.pumpOffTimer.failCount}/{health.pumpOffTimer.failThreshold}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-2 text-xs text-muted-foreground">
            Última verificação: {health.temperature.lastCheck ? format(new Date(health.temperature.lastCheck), 'dd/MM/yyyy HH:mm:ss') : 'N/A'}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SensorHealthCard;