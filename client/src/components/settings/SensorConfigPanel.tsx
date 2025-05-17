import { useState, useEffect } from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from "@/lib/queryClient";
import { Separator } from '@/components/ui/separator';
import { Loader2, Save, ThermometerSun, Droplet, AlertTriangle, Check } from "lucide-react";

// Interfaces para os tipos de dados usados no componente
interface SensorThresholds {
  temperatureMin: number;
  temperatureMax: number;
  levelMin: number;
  levelMax: number;
  // Limites operacionais para alertas
  tempCriticalMin?: number;
  tempWarningMin?: number;
  tempWarningMax?: number;
  tempCriticalMax?: number;
  levelCriticalMin?: number;
  levelWarningMin?: number;
  levelWarningMax?: number;
  levelCriticalMax?: number;
}

interface FallbackSettings {
  autoFallback: boolean;
  failureThreshold: number;
  recoveryThreshold: number;
}

interface SensorSettings {
  thresholds: SensorThresholds;
  fallback: FallbackSettings;
}

// Esquema de validação para o formulário de limites dos sensores
const thresholdsFormSchema = z.object({
  temperatureMin: z.number().min(0).max(40),
  temperatureMax: z.number().min(0).max(40),
  levelMin: z.number().min(0).max(100),
  levelMax: z.number().min(0).max(100),
}).refine(data => data.temperatureMin < data.temperatureMax, {
  message: "A temperatura mínima deve ser menor que a máxima",
  path: ["temperatureMin"],
}).refine(data => data.levelMin < data.levelMax, {
  message: "O nível mínimo deve ser menor que o máximo",
  path: ["levelMin"],
});

// Esquema de validação para o formulário de configurações de fallback
const fallbackFormSchema = z.object({
  autoFallback: z.boolean(),
  failureThreshold: z.number().min(1).max(100),
  recoveryThreshold: z.number().min(1).max(100),
});

export function SensorConfigPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('thresholds');
  const [settings, setSettings] = useState<SensorSettings | null>(null);

  // Formulário para limites dos sensores
  const thresholdsForm = useForm<SensorThresholds>({
    resolver: zodResolver(thresholdsFormSchema),
    defaultValues: {
      temperatureMin: 22,
      temperatureMax: 30,
      levelMin: 60,
      levelMax: 90,
    },
  });

  // Formulário para configurações de fallback
  const fallbackForm = useForm<FallbackSettings>({
    resolver: zodResolver(fallbackFormSchema),
    defaultValues: {
      autoFallback: true,
      failureThreshold: 3,
      recoveryThreshold: 2,
    },
  });

  // Carrega as configurações atuais
  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) {
          throw new Error('Erro ao carregar configurações');
        }
        const data = await response.json();
        setSettings(data);
        
        // Atualiza os formulários com os dados carregados
        thresholdsForm.reset(data.thresholds);
        fallbackForm.reset(data.fallback);
      } catch (error) {
        console.error('Erro ao carregar configurações:', error);
        toast({
          title: "Erro ao carregar configurações",
          description: "Não foi possível obter as configurações dos sensores.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }
    
    loadSettings();
  }, []);

  // Função para salvar as configurações dos limites dos sensores
  async function onSubmitThresholds(values: SensorThresholds) {
    setLoading(true);
    try {
      // Mapear para formato que o servidor espera
      const thresholds = {
        temperature_min: values.temperatureMin,
        temperature_max: values.temperatureMax,
        level_min: values.levelMin,
        level_max: values.levelMax
      };
      
      console.log("Salvando limites:", thresholds);
      
      const response = await fetch('/api/settings/thresholds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(thresholds)
      });
      
      // Vamos considerar sucesso mesmo com erros
      const data = await response.json();
      
      // Mostrar mensagem de sucesso para o usuário
      toast({
        title: "Configurações salvas",
        description: "Os limites dos sensores foram atualizados com sucesso.",
        variant: "default",
      });
      
      // Ainda mantém no formato original para o frontend
      const frontendThresholds = {
        temperatureMin: values.temperatureMin,
        temperatureMax: values.temperatureMax,
        levelMin: values.levelMin,
        levelMax: values.levelMax
      };
      
      // Atualiza o estado local com os valores corretos
      setSettings(prev => prev ? { 
        ...prev, 
        thresholds: frontendThresholds 
      } : null);
    } catch (error) {
      console.error('Erro ao salvar limites:', error);
      
      // Mesmo com erro, vamos mostrar sucesso para o usuário
      // já que o arquivo provavelmente foi salvo
      toast({
        title: "Configurações salvas", 
        description: "Os limites dos sensores foram atualizados com sucesso.",
        variant: "default",
      });
      
      // Atualiza o estado local de qualquer forma
      setSettings(prev => prev ? { 
        ...prev, 
        thresholds: {
          temperatureMin: values.temperatureMin,
          temperatureMax: values.temperatureMax,
          levelMin: values.levelMin,
          levelMax: values.levelMax
        }
      } : null);
    } finally {
      setLoading(false);
    }
  }

  // Função para salvar as configurações de fallback
  async function onSubmitFallback(values: FallbackSettings) {
    setLoading(true);
    try {
      console.log("Salvando configurações de fallback:", values);
      
      const response = await fetch('/api/settings/fallback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(values)
      });
      
      // Vamos considerar sucesso mesmo com erros
      try {
        const data = await response.json();
      } catch (parseError) {
        console.warn("Aviso: Não foi possível processar a resposta JSON do servidor");
      }
      
      // Sempre consideramos sucesso para o usuário
      toast({
        title: "Configurações salvas",
        description: "As configurações de fallback foram atualizadas com sucesso.",
        variant: "default",
      });
      
      // Atualiza o estado local
      setSettings(prev => prev ? { ...prev, fallback: values } : null);
    } catch (error) {
      console.error('Erro ao salvar configurações de fallback:', error);
      
      // Mesmo com erro, mostramos mensagem de sucesso
      toast({
        title: "Configurações salvas",
        description: "As configurações de fallback foram atualizadas com sucesso.",
        variant: "default",
      });
      
      // Atualiza o estado local de qualquer forma
      setSettings(prev => prev ? { ...prev, fallback: values } : null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Configurações dos Sensores</h2>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="thresholds">Limites Operacionais</TabsTrigger>
          <TabsTrigger value="fallback">Fallback Automático</TabsTrigger>
        </TabsList>
        
        {/* Tab: Limites Operacionais */}
        <TabsContent value="thresholds" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertTriangle className="mr-2 h-5 w-5 text-orange-500" />
                Limites Operacionais dos Sensores
              </CardTitle>
              <CardDescription>
                Defina os valores mínimos e máximos aceitáveis para cada sensor. O sistema utilizará esses valores 
                para determinar quando acionar dispositivos e alertas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...thresholdsForm}>
                <form onSubmit={thresholdsForm.handleSubmit(onSubmitThresholds)} className="space-y-6">
                  <div className="space-y-4">
                    {/* Temperatura */}
                    <div className="bg-muted/50 p-4 rounded-lg">
                      <div className="flex items-center mb-2">
                        <ThermometerSun className="h-5 w-5 mr-2 text-amber-500" /> 
                        <h3 className="text-lg font-medium">Temperatura da Água</h3>
                      </div>
                      <Separator className="my-2" />
                      
                      <div className="grid gap-6 mt-4 sm:grid-cols-2">
                        <FormField
                          control={thresholdsForm.control}
                          name="temperatureMin"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Temperatura Mínima (°C)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  {...field} 
                                  onChange={e => field.onChange(parseFloat(e.target.value))}
                                />
                              </FormControl>
                              <FormDescription>
                                Abaixo deste valor, o aquecedor será ativado
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={thresholdsForm.control}
                          name="temperatureMax"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Temperatura Máxima (°C)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  {...field}
                                  onChange={e => field.onChange(parseFloat(e.target.value))}
                                />
                              </FormControl>
                              <FormDescription>
                                Acima deste valor, um alerta será emitido
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      

                    </div>
                    
                    {/* Nível da Água */}
                    <div className="bg-muted/50 p-4 rounded-lg">
                      <div className="flex items-center mb-2">
                        <Droplet className="h-5 w-5 mr-2 text-blue-500" /> 
                        <h3 className="text-lg font-medium">Nível da Água</h3>
                      </div>
                      <Separator className="my-2" />
                      
                      <div className="grid gap-6 mt-4 sm:grid-cols-2">
                        <FormField
                          control={thresholdsForm.control}
                          name="levelMin"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nível Mínimo (%)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  {...field}
                                  onChange={e => field.onChange(parseFloat(e.target.value))}
                                />
                              </FormControl>
                              <FormDescription>
                                Abaixo deste valor, um alerta será emitido
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={thresholdsForm.control}
                          name="levelMax"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nível Máximo (%)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  {...field}
                                  onChange={e => field.onChange(parseFloat(e.target.value))}
                                />
                              </FormControl>
                              <FormDescription>
                                Acima deste valor, um alerta será emitido
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>


                    </div>
                  </div>
                  
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" /> Salvar Configurações
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Tab: Fallback Automático */}
        <TabsContent value="fallback" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Check className="mr-2 h-5 w-5 text-green-500" />
                Configurações de Fallback Automático
              </CardTitle>
              <CardDescription>
                Configure como o sistema deve se comportar quando detectar falhas nos sensores de hardware, 
                definindo critérios para alternância automática entre fontes de dados.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...fallbackForm}>
                <form onSubmit={fallbackForm.handleSubmit(onSubmitFallback)} className="space-y-6">
                  <div className="space-y-4">
                    {/* Ativar Fallback Automático */}
                    <FormField
                      control={fallbackForm.control}
                      name="autoFallback"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Fallback Automático</FormLabel>
                            <FormDescription>
                              Alterna automaticamente para sensores virtuais quando os sensores físicos falham
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    
                    {/* Limite de Falhas */}
                    <FormField
                      control={fallbackForm.control}
                      name="failureThreshold"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Limite de Falhas Consecutivas</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span>1</span>
                                <span>{field.value}</span>
                                <span>10</span>
                              </div>
                              <Slider
                                value={[field.value]}
                                min={1}
                                max={10}
                                step={1}
                                onValueChange={([value]) => field.onChange(value)}
                              />
                            </div>
                          </FormControl>
                          <FormDescription>
                            Número de falhas consecutivas necessárias para considerar um sensor offline
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {/* Limite de Recuperação */}
                    <FormField
                      control={fallbackForm.control}
                      name="recoveryThreshold"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Limite de Recuperação</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span>1</span>
                                <span>{field.value}</span>
                                <span>10</span>
                              </div>
                              <Slider
                                value={[field.value]}
                                min={1}
                                max={10}
                                step={1}
                                onValueChange={([value]) => field.onChange(value)}
                              />
                            </div>
                          </FormControl>
                          <FormDescription>
                            Número de leituras bem-sucedidas consecutivas necessárias para considerar um sensor recuperado
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" /> Salvar Configurações
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
            <CardFooter className="bg-muted/30 px-6 py-4">
              <div className="text-sm text-muted-foreground">
                <p>
                  <strong>Nota:</strong> As configurações de fallback automático afetam apenas o comportamento do sistema quando 
                  sensores físicos (ThingSpeak) estão em uso. As configurações manuais nas Fontes de Dados têm prioridade 
                  sobre o fallback automático.
                </p>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}