import React, { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

// Interface para configuração de alertas
interface AlertConfig {
  enabled: boolean;
  email: string;
  senderEmail: string;
  temperature: {
    enabled: boolean;
    min: number;
    max: number;
  };
  level: {
    enabled: boolean;
    min: number;
    max: number;
  };
  alertInterval: number;
}

export function AlertsTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState<AlertConfig>({
    enabled: false,
    email: "",
    senderEmail: "sistema-aquaponico@example.com",
    temperature: {
      enabled: true,
      min: 20,
      max: 30,
    },
    level: {
      enabled: true,
      min: 50,
      max: 80,
    },
    alertInterval: 30 * 60 * 1000, // 30 minutos em milissegundos
  });

  // Carregar configuração atual
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch("/api/alerts/config");
        const data = await response.json();
        
        if (data.success && data.config) {
          setConfig(data.config);
        }
      } catch (error) {
        console.error("Erro ao carregar configuração de alertas:", error);
        toast({
          title: "Erro",
          description: "Não foi possível carregar a configuração de alertas",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [toast]);

  // Salvar configuração
  const saveConfig = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/alerts/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Configuração salva",
          description: "As configurações de alerta foram salvas com sucesso",
        });
      } else {
        throw new Error(data.error || "Erro desconhecido");
      }
    } catch (error) {
      console.error("Erro ao salvar configuração de alertas:", error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar a configuração de alertas",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Testar envio de e-mail
  const testEmail = async (type: 'temperature' | 'level') => {
    setTesting(true);
    try {
      const testValue = type === 'temperature' 
        ? config.temperature.max + 1 // Valor acima do máximo para temperatura
        : config.level.min - 1;      // Valor abaixo do mínimo para nível
        
      const response = await fetch("/api/alerts/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type, value: testValue }),
      });

      const data = await response.json();

      if (data.success && data.alertSent) {
        toast({
          title: "E-mail de teste enviado",
          description: `Um e-mail de teste foi enviado para ${config.email}`,
        });
      } else if (data.success && !data.alertSent) {
        toast({
          title: "Alerta não enviado",
          description: "O e-mail de teste não pôde ser enviado. Verifique se o sistema de alertas está ativado.",
          variant: "destructive",
        });
      } else {
        throw new Error(data.error || "Erro desconhecido");
      }
    } catch (error) {
      console.error("Erro ao testar envio de e-mail:", error);
      toast({
        title: "Erro",
        description: "Não foi possível enviar o e-mail de teste",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configuração de Alertas por E-mail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <Label htmlFor="alerts-enable">Ativar alertas por e-mail</Label>
            <Switch
              id="alerts-enable"
              checked={config.enabled}
              onCheckedChange={(checked) => 
                setConfig((prev) => ({ ...prev, enabled: checked }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="alerts-email">E-mail para receber alertas</Label>
            <Input
              id="alerts-email"
              type="email"
              placeholder="seu@email.com"
              value={config.email}
              onChange={(e) => 
                setConfig((prev) => ({ ...prev, email: e.target.value }))
              }
            />
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="temp-alerts-enable"
                  checked={config.temperature.enabled}
                  onCheckedChange={(checked) => 
                    setConfig((prev) => ({
                      ...prev,
                      temperature: {
                        ...prev.temperature,
                        enabled: checked === true,
                      },
                    }))
                  }
                />
                <Label htmlFor="temp-alerts-enable">Alertas de Temperatura</Label>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="space-y-2">
                  <Label htmlFor="temp-min">Mínima (°C)</Label>
                  <div className="flex items-center space-x-2">
                    <Slider
                      id="temp-min"
                      min={0}
                      max={40}
                      step={0.5}
                      value={[config.temperature.min]}
                      onValueChange={(value) => 
                        setConfig((prev) => ({
                          ...prev,
                          temperature: {
                            ...prev.temperature,
                            min: value[0],
                          },
                        }))
                      }
                      disabled={!config.temperature.enabled}
                    />
                    <span className="w-10 text-center">{config.temperature.min}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="temp-max">Máxima (°C)</Label>
                  <div className="flex items-center space-x-2">
                    <Slider
                      id="temp-max"
                      min={0}
                      max={40}
                      step={0.5}
                      value={[config.temperature.max]}
                      onValueChange={(value) => 
                        setConfig((prev) => ({
                          ...prev,
                          temperature: {
                            ...prev.temperature,
                            max: value[0],
                          },
                        }))
                      }
                      disabled={!config.temperature.enabled}
                    />
                    <span className="w-10 text-center">{config.temperature.max}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="level-alerts-enable"
                  checked={config.level.enabled}
                  onCheckedChange={(checked) => 
                    setConfig((prev) => ({
                      ...prev,
                      level: {
                        ...prev.level,
                        enabled: checked === true,
                      },
                    }))
                  }
                />
                <Label htmlFor="level-alerts-enable">Alertas de Nível</Label>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="space-y-2">
                  <Label htmlFor="level-min">Mínimo (%)</Label>
                  <div className="flex items-center space-x-2">
                    <Slider
                      id="level-min"
                      min={0}
                      max={100}
                      step={1}
                      value={[config.level.min]}
                      onValueChange={(value) => 
                        setConfig((prev) => ({
                          ...prev,
                          level: {
                            ...prev.level,
                            min: value[0],
                          },
                        }))
                      }
                      disabled={!config.level.enabled}
                    />
                    <span className="w-10 text-center">{config.level.min}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="level-max">Máximo (%)</Label>
                  <div className="flex items-center space-x-2">
                    <Slider
                      id="level-max"
                      min={0}
                      max={100}
                      step={1}
                      value={[config.level.max]}
                      onValueChange={(value) => 
                        setConfig((prev) => ({
                          ...prev,
                          level: {
                            ...prev.level,
                            max: value[0],
                          },
                        }))
                      }
                      disabled={!config.level.enabled}
                    />
                    <span className="w-10 text-center">{config.level.max}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-4">
            <Button 
              onClick={saveConfig} 
              disabled={saving || !config.email}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Configurações
            </Button>
            <Button 
              variant="outline" 
              onClick={() => testEmail('temperature')} 
              disabled={testing || !config.enabled || !config.email || !config.temperature.enabled}
            >
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Testar Alerta de Temperatura
            </Button>
            <Button 
              variant="outline" 
              onClick={() => testEmail('level')} 
              disabled={testing || !config.enabled || !config.email || !config.level.enabled}
            >
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Testar Alerta de Nível
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}