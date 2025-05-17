import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "@/lib/utils";

interface BackupStatus {
  success: boolean;
  status: string;
  message: string;
  lastSyncId?: number;
  lastSyncDate?: string;
  totalBackupRecords?: number;
}

interface BackupStats {
  success: boolean;
  stats: {
    dailyStats: {
      date: string;
      minTemperature: number;
      maxTemperature: number;
      avgTemperature: number;
      readingCount: number;
    }[];
    alertCount: number;
    criticalAlertsCount: number;
    syncHistory: {
      success: boolean;
      timestamp: string;
      recordCount: number;
    }[];
  };
}

export function BackupPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [syncDays, setSyncDays] = useState('1');
  const [customSyncDays, setCustomSyncDays] = useState('1');
  const [batchSize, setBatchSize] = useState('moderate');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  // Consulta para obter o status atual do backup
  const { data: backupStatus, isLoading: isStatusLoading } = useQuery<BackupStatus>({
    queryKey: ['/api/backup/status'],
    queryFn: async () => {
      const response = await fetch('/api/backup/status');
      if (!response.ok) {
        throw new Error('Falha ao obter status do backup');
      }
      return response.json();
    },
    refetchInterval: 300000, // Atualiza a cada 5 minutos (300,000ms)
  });

  // Consulta para obter estatísticas do backup
  const { data: backupStats, isLoading: isStatsLoading } = useQuery<BackupStats>({
    queryKey: ['/api/backup/stats'],
    queryFn: async () => {
      const response = await fetch('/api/backup/stats');
      if (!response.ok) {
        throw new Error('Falha ao obter estatísticas do backup');
      }
      return response.json();
    },
    refetchInterval: 300000, // Atualiza a cada 5 minutos (300,000ms)
    enabled: backupStatus?.status === 'online'
  });

  // Função para calcular o tamanho estimado do lote com base na seleção do usuário
  const getBatchSizeValue = (size: string): number => {
    switch(size) {
      case 'small': return 50;
      case 'moderate': return 100;
      case 'large': return 250;
      default: return 100;
    }
  };
  
  // Função para obter a descrição do tamanho do lote
  const getBatchSizeDescription = (size: string): string => {
    switch(size) {
      case 'small': return 'Lento mas estável (50 registros)';
      case 'moderate': return 'Balanceado (100 registros)';
      case 'large': return 'Rápido mas pode sobrecarregar (250 registros)';
      default: return 'Balanceado (100 registros)';
    }
  };

  // Função para validar o número de dias inserido pelo usuário
  const validateSyncDays = (value: string): number => {
    // Converter para número
    let days = parseInt(value);
    
    // Validar se é um número válido
    if (isNaN(days) || days < 1) {
      days = 1; // Valor mínimo
    } else if (days > 30) {
      days = 30; // Valor máximo
    }
    
    return days;
  };

  // Mutação para iniciar sincronização manual
  const syncMutation = useMutation({
    mutationFn: async () => {
      setSyncInProgress(true);
      
      // Obter o número de dias validado
      const days = validateSyncDays(customSyncDays);
      
      // Configurar parâmetros de sincronização com base nas seleções do usuário
      const syncConfig = {
        days: days,
        batchSize: getBatchSizeValue(batchSize)
      };
      
      const response = await fetch('/api/backup/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(syncConfig)
      });
      
      if (!response.ok) {
        throw new Error('Falha na sincronização');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Sincronização concluída",
        description: data.message || "Dados sincronizados com sucesso",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/backup/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/backup/stats'] });
      setSyncInProgress(false);
    },
    onError: (error: any) => {
      toast({
        title: "Erro na sincronização",
        description: error.message || "Não foi possível sincronizar os dados",
        variant: "destructive",
      });
      setSyncInProgress(false);
    }
  });

  // Iniciar sincronização manual
  const handleSync = () => {
    syncMutation.mutate();
  };

  // Formatar data para exibição no padrão DD/MM/YYYY HH:mm:ss
  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    try {
      // Obter objeto de data
      let date: Date;
      
      // Verificar se é um timestamp numérico (em milissegundos)
      if (/^\d+$/.test(dateString)) {
        date = new Date(parseInt(dateString));
      } 
      // Verificar se é uma data ISO 8601 válida
      else if (dateString.includes('T') || dateString.includes('-')) {
        date = new Date(dateString);
        if (isNaN(date.getTime())) {
          return dateString; // Retornar string original se não for uma data válida
        }
      } else {
        return dateString; // Retornar string original para outros formatos
      }
      
      // Usar a função formatDateTime do utils que está configurada com Intl.DateTimeFormat
      // Esta função já está corretamente configurada com o timezone 'America/Sao_Paulo'
      // e retorna a data no formato brasileiro
      
      return formatDateTime(date);
    } catch (e) {
      console.log('Erro ao formatar data:', e);
      return 'Data inválida';
    }
  };

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2 px-4 sm:px-6">
        <CardTitle className="text-xl">Backup e Sincronização de Dados</CardTitle>
        <CardDescription>
          Gerenciamento de backup e sincronização com o banco de dados secundário
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <div className="space-y-4 sm:space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0">
            <div className="space-y-0.5">
              <h3 className="text-base font-medium">Status do Serviço</h3>
              <p className="text-sm text-muted-foreground">
                Estado atual do serviço de backup
              </p>
            </div>
            {isStatusLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <Badge variant={backupStatus?.status === 'online' ? 'default' : 'destructive'} 
                className={`px-3 py-1 ${backupStatus?.status === 'online' ? 'bg-green-500' : ''}`}>
                <span className="flex items-center gap-1.5">
                  <i className={`fas fa-${backupStatus?.status === 'online' ? 'circle text-white' : 'exclamation-circle'} text-xs`}></i>
                  {backupStatus?.status === 'online' ? 'Online' : 'Offline'}
                </span>
              </Badge>
            )}
          </div>

          {/* Informações de backup */}
          <div className="space-y-3">
            <h3 className="text-base font-medium">Informações do Backup</h3>
            
            {isStatusLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row justify-between text-sm">
                  <span className="text-muted-foreground mb-1 sm:mb-0">Última sincronização:</span>
                  <span className="font-medium">{formatDate(backupStatus?.lastSyncDate)}</span>
                </div>
                <div className="flex flex-col sm:flex-row justify-between text-sm">
                  <span className="text-muted-foreground mb-1 sm:mb-0">Registros no backup:</span>
                  <span className="font-medium">{backupStatus?.totalBackupRecords || 0}</span>
                </div>
                <div className="flex flex-col sm:flex-row justify-between text-sm">
                  <span className="text-muted-foreground mb-1 sm:mb-0">Último ID sincronizado:</span>
                  <span className="font-medium">{backupStatus?.lastSyncId || 0}</span>
                </div>
              </div>
            )}
          </div>

          {/* Alertas (se houver dados estatísticos) */}
          {!isStatsLoading && backupStats && (
            <div className="space-y-2">
              <h3 className="text-base font-medium">Alertas</h3>
              <p className="text-xs text-muted-foreground mb-2">
                Os alertas são gerados quando os valores de temperatura ou nível de água estão fora dos intervalos seguros definidos
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <div className="p-3 bg-muted rounded-lg text-center shadow-sm">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl sm:text-2xl font-bold">{backupStats.stats.alertCount}</p>
                  <p className="text-xs text-muted-foreground">Todos os alertas registrados</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center shadow-sm">
                  <p className="text-xs text-muted-foreground">Críticos</p>
                  <p className="text-xl sm:text-2xl font-bold text-red-500">{backupStats.stats.criticalAlertsCount}</p>
                  <p className="text-xs text-muted-foreground">Desvios extremos dos parâmetros</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-0.5">
            <h3 className="text-base font-medium">Sincronização Automática</h3>
            <p className="text-sm text-muted-foreground">
              O sistema sincroniza automaticamente os dados a cada 30 minutos
            </p>
          </div>
          
          {/* Opções de importação */}
          <div className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-medium">Configurações de Importação</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="h-8 px-2 text-xs"
              >
                {showAdvancedOptions ? 'Ocultar opções' : 'Mostrar opções'}
              </Button>
            </div>
            
            {showAdvancedOptions && (
              <div className="space-y-4 bg-muted/40 p-3 rounded-md">
                <div className="space-y-2">
                  <Label htmlFor="period-input">Período de Importação (dias)</Label>
                  <div className="flex items-center space-x-2">
                    <input
                      id="period-input"
                      type="number"
                      min="1"
                      max="30"
                      value={customSyncDays}
                      onChange={(e) => setCustomSyncDays(e.target.value)}
                      className="flex h-10 w-20 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <span className="text-sm text-muted-foreground">dias</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Digite o número de dias de dados a importar do ThingSpeak (1-30)
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button 
                      type="button" 
                      onClick={() => setCustomSyncDays('1')}
                      className="px-2 py-1 text-xs rounded-md bg-secondary hover:bg-secondary/80"
                    >
                      1 dia
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setCustomSyncDays('3')}
                      className="px-2 py-1 text-xs rounded-md bg-secondary hover:bg-secondary/80"
                    >
                      3 dias
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setCustomSyncDays('7')}
                      className="px-2 py-1 text-xs rounded-md bg-secondary hover:bg-secondary/80"
                    >
                      7 dias
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setCustomSyncDays('14')}
                      className="px-2 py-1 text-xs rounded-md bg-secondary hover:bg-secondary/80"
                    >
                      14 dias
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Tamanho do Lote de Processamento</Label>
                  <RadioGroup 
                    value={batchSize} 
                    onValueChange={setBatchSize}
                    className="flex flex-col space-y-1"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="small" id="batch-small" />
                      <Label htmlFor="batch-small" className="text-sm">Pequeno</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="moderate" id="batch-moderate" />
                      <Label htmlFor="batch-moderate" className="text-sm">Moderado</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="large" id="batch-large" />
                      <Label htmlFor="batch-large" className="text-sm">Grande</Label>
                    </div>
                  </RadioGroup>
                  <p className="text-xs text-muted-foreground mt-1">
                    {getBatchSizeDescription(batchSize)}
                  </p>
                </div>
                
                <Alert className="bg-yellow-50 border-yellow-200">
                  <AlertTitle className="text-sm text-yellow-800">Informação sobre importação</AlertTitle>
                  <AlertDescription className="text-xs text-yellow-700">
                    Importar muitos dados de uma só vez pode sobrecarregar o sistema. 
                    Recomendamos iniciar com 1 dia e tamanho de lote pequeno ou moderado.
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="px-4 sm:px-6">
        <Button 
          onClick={handleSync} 
          disabled={syncInProgress || isStatusLoading || backupStatus?.status !== 'online'}
          className="w-full py-2"
        >
          {syncInProgress ? (
            <span className="flex items-center justify-center gap-2">
              <i className="fas fa-spinner fa-spin text-sm"></i>
              Sincronizando...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <i className="fas fa-sync-alt text-sm"></i>
              {showAdvancedOptions 
                ? `Sincronizar ${validateSyncDays(customSyncDays)} ${validateSyncDays(customSyncDays) > 1 ? 'dias' : 'dia'} de dados`
                : 'Sincronizar Agora'
              }
            </span>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}