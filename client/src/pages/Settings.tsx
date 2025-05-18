import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { BackupPanel } from "@/components/settings/BackupPanel";
import { SensorConfigPanel } from "@/components/settings/SensorConfigPanel";
import { AlertsTab } from "@/components/settings/AlertsTab";
import SensorHealthCard from '@/components/emulator/SensorHealthCard';
import SensorSourceControl from '@/components/emulator/SensorSourceControl';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

export default function Settings() {
  const [currentTab, setCurrentTab] = useState('general');

  return (
    <div className="space-y-6 pb-8 px-4 sm:px-6">
      <h1 className="text-2xl md:text-3xl font-bold my-6">Configurações do Sistema</h1>
      
      <Tabs value={currentTab} onValueChange={setCurrentTab} className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full max-w-xl">
          <TabsTrigger value="general">Gerais</TabsTrigger>
          <TabsTrigger value="sensors">Sensores</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="fallback">Fontes de Dados</TabsTrigger>
        </TabsList>
        
        {/* Tab: Configurações Gerais */}
        <TabsContent value="general" className="space-y-6">
          <SettingsPanel />
        </TabsContent>

        {/* Tab: Configurações dos Sensores */}
        <TabsContent value="sensors" className="space-y-6">
          <SensorConfigPanel />
        </TabsContent>
        
        {/* Tab: Backup */}
        {/* Tab: Alertas por E-mail */}
        <TabsContent value="alerts" className="space-y-6">
          <AlertsTab />
        </TabsContent>
        
        <TabsContent value="backup" className="space-y-6">
          <BackupPanel />
        </TabsContent>
        
        {/* Tab: Fontes de Dados (originalmente Fallback) */}
        <TabsContent value="fallback" className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2">
            <div>
              <Card className="mb-6">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center text-lg">
                    <i className="fas fa-exchange-alt mr-2"></i>
                    Sistema de Fallback
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    O sistema de fallback monitora a saúde dos sensores e automaticamente alterna entre fontes
                    de dados de hardware (ThingSpeak) e virtuais (emulador local) quando necessário.
                  </p>
                  <Separator className="my-4" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Como funciona:</p>
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-2">
                      <li>Os sensores são verificados continuamente para garantir que estão funcionando corretamente</li>
                      <li>Quando um sensor fica offline, o sistema automaticamente usa dados virtuais em seu lugar</li>
                      <li>Você pode definir manualmente qual fonte usar para cada sensor</li>
                      <li>A verificação de saúde conta falhas consecutivas antes de marcar um sensor como offline</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
              
              <SensorHealthCard />
            </div>
            
            <SensorSourceControl />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
