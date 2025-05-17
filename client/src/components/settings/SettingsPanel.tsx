import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings } from '@/lib/thingspeakApi';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useSystemContext } from '@/contexts/SystemContext';

export function SettingsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setSystemName } = useSystemContext();
  
  // Default values
  const defaultSettings = {
    systemName: 'Aquaponia',
    updateInterval: 1,
    // dataRetention removido da interface mas mantido como 30 dias no backend
    emailAlerts: true,
    pushAlerts: true,
    alertEmail: '',
    tempCriticalMin: 18,
    tempWarningMin: 20,
    tempWarningMax: 28,
    tempCriticalMax: 30,
    levelCriticalMin: 50,
    levelWarningMin: 60,
    levelWarningMax: 85,
    levelCriticalMax: 90,
  };
  
  const [formData, setFormData] = useState(defaultSettings);
  
  // Fetch current settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['/api/settings'],
    queryFn: getSettings,
  });
  
  // Update state when settings are loaded
  useEffect(() => {
    if (settings) {
      setFormData({
        systemName: settings.systemName || defaultSettings.systemName,
        updateInterval: settings.updateInterval || defaultSettings.updateInterval,
        emailAlerts: settings.emailAlerts || defaultSettings.emailAlerts,
        pushAlerts: settings.pushAlerts || defaultSettings.pushAlerts,
        alertEmail: settings.alertEmail || defaultSettings.alertEmail,
        // Mantemos esses campos no estado apenas para não quebrar a interface
        tempCriticalMin: defaultSettings.tempCriticalMin,
        tempWarningMin: defaultSettings.tempWarningMin,
        tempWarningMax: defaultSettings.tempWarningMax,
        tempCriticalMax: defaultSettings.tempCriticalMax,
        levelCriticalMin: defaultSettings.levelCriticalMin,
        levelWarningMin: defaultSettings.levelWarningMin,
        levelWarningMax: defaultSettings.levelWarningMax,
        levelCriticalMax: defaultSettings.levelCriticalMax,
      });
    }
  }, [settings]);
  
  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      toast({
        title: "Configurações salvas",
        description: "As configurações foram atualizadas com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: "Não foi possível salvar as configurações.",
        variant: "destructive",
      });
      console.error("Error updating settings:", error);
    },
  });
  
  // Mutation de atualização de limites removida
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value, type, checked } = e.target;
    
    setFormData({
      ...formData,
      [id]: type === 'checkbox' ? checked : type === 'number' ? Number(value) : value,
    });
  };
  
  const handleSaveSettings = () => {
    try {
      // Atualize apenas as configurações gerais e de alertas
      const settingsToUpdate = {
        systemName: formData.systemName,
        updateInterval: formData.updateInterval,
        emailAlerts: formData.emailAlerts,
        pushAlerts: formData.pushAlerts,
        alertEmail: formData.alertEmail || null,
        // Inclua também os campos de limite removidos da interface, mas usando valores padrão
        // para que o backend possa validar corretamente
        dataRetention: 30, // Valor fixo conforme comentado no código
        tempCriticalMin: formData.tempCriticalMin,
        tempWarningMin: formData.tempWarningMin,
        tempWarningMax: formData.tempWarningMax,
        tempCriticalMax: formData.tempCriticalMax,
        levelCriticalMin: formData.levelCriticalMin,
        levelWarningMin: formData.levelWarningMin,
        levelWarningMax: formData.levelWarningMax,
        levelCriticalMax: formData.levelCriticalMax,
      };
      
      // Envie apenas as configurações que ainda existem na interface
      updateSettingsMutation.mutate(settingsToUpdate);
      
      // Atualiza o nome do sistema no contexto
      setSystemName(formData.systemName);
    } catch (error) {
      console.error("Erro ao preparar configurações para envio:", error);
      toast({
        title: "Erro ao salvar configurações",
        description: "Ocorreu um erro ao preparar as configurações para envio.",
        variant: "destructive",
      });
    }
  };
  
  const handleResetSettings = () => {
    setFormData(defaultSettings);
    
    toast({
      title: "Configurações restauradas",
      description: "As configurações foram restauradas para os valores padrão. Clique em 'Salvar Configurações' para aplicar.",
    });
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <span className="text-lg">Carregando configurações...</span>
      </div>
    );
  }

  return (
    <div className="pb-12">
      <div className="bg-[#0f172a] p-4 sm:p-6 rounded-lg shadow-md mb-6 border border-white/5">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* System Settings */}
          <div className="bg-[#0f172a] p-4 sm:p-6 rounded-lg border border-white/5">
            <h4 className="text-lg font-semibold mb-3 flex items-center gap-2 text-white">
              <i className="fas fa-cogs text-[#5090d3]"></i>
              Configurações Gerais
            </h4>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="systemName" className="flex items-center gap-2 mb-2 text-gray-300 text-sm">
                  <i className="fas fa-tag text-[#5090d3]"></i>
                  Nome do Sistema
                </label>
                <input 
                  type="text" 
                  id="systemName" 
                  className="w-full bg-[#1e293b] border border-white/5 rounded-md p-2 text-sm text-white"
                  value={formData.systemName} 
                  onChange={handleInputChange}
                />
              </div>
              
              <div>
                <label htmlFor="updateInterval" className="flex items-center gap-2 mb-2 text-gray-300 text-sm">
                  <i className="fas fa-clock text-[#5090d3]"></i>
                  Intervalo de Atualização
                </label>
                <div className="flex items-center bg-[#1e293b] border border-white/5 rounded-md pr-3">
                  <input 
                    type="number" 
                    id="updateInterval" 
                    className="w-full bg-transparent border-none p-2 text-sm text-white"
                    value={formData.updateInterval} 
                    min="1" 
                    max="60" 
                    onChange={handleInputChange}
                  />
                  <span className="text-gray-300 text-sm">minutos</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Alert Settings */}
          <div className="bg-[#0f172a] p-4 sm:p-6 rounded-lg border border-white/5">
            <h4 className="text-lg font-semibold mb-3 flex items-center gap-2 text-white">
              <i className="fas fa-bell text-[#5090d3]"></i>
              Configurações de Alertas
            </h4>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label htmlFor="emailAlerts" className="flex items-center gap-2 text-gray-300 text-sm">
                  <i className="fas fa-envelope text-[#5090d3]"></i>
                  Alertas por E-mail
                </label>
                <Switch 
                  id="emailAlerts" 
                  checked={formData.emailAlerts} 
                  onCheckedChange={(checked) => setFormData({...formData, emailAlerts: checked})}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <label htmlFor="pushAlerts" className="flex items-center gap-2 text-gray-300 text-sm">
                  <i className="fas fa-mobile-alt text-[#5090d3]"></i>
                  Notificações Push
                </label>
                <Switch 
                  id="pushAlerts" 
                  checked={formData.pushAlerts} 
                  onCheckedChange={(checked) => setFormData({...formData, pushAlerts: checked})}
                />
              </div>
              
              <div>
                <label htmlFor="alertEmail" className="flex items-center gap-2 mb-2 text-gray-300 text-sm">
                  <i className="fas fa-at text-[#5090d3]"></i>
                  E-mail para Alertas
                </label>
                <input 
                  type="email" 
                  id="alertEmail" 
                  className="w-full bg-[#1e293b] border border-white/5 rounded-md p-2 text-sm text-white"
                  placeholder="seu@email.com" 
                  value={formData.alertEmail}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </div>
          
          {/* Placeholder para informações sobre limites */}
          <div className="bg-[#0f172a] p-4 sm:p-6 rounded-lg border border-white/5">
            <h4 className="text-lg font-semibold mb-3 flex items-center gap-2 text-white">
              <i className="fas fa-info-circle text-[#5090d3]"></i>
              Informação
            </h4>
            
            <div className="space-y-4">
              <p className="text-gray-300 text-sm">
                Os limites de temperatura e nível foram movidos para a seção Sensores. 
                Por favor, acesse a aba Sensores para configurar os limites de alertas.
              </p>
            </div>
          </div>
        </div>
        
        <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3">
          <Button 
            variant="outline"
            onClick={handleResetSettings}
            disabled={updateSettingsMutation.isPending}
            className="py-2 order-2 sm:order-1"
          >
            <span className="flex items-center justify-center gap-2">
              <i className="fas fa-undo-alt text-sm"></i>
              Restaurar Padrões
            </span>
          </Button>
          <Button 
            onClick={handleSaveSettings}
            disabled={updateSettingsMutation.isPending}
            className="py-2 order-1 sm:order-2"
          >
            {updateSettingsMutation.isPending 
              ? (
                <span className="flex items-center justify-center gap-2">
                  <i className="fas fa-spinner fa-spin text-sm"></i>
                  Salvando...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <i className="fas fa-save text-sm"></i>
                  Salvar Configurações
                </span>
              )}
          </Button>
        </div>
      </div>
    </div>
  );
}
