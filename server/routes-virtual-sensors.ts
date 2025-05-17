import { Router, Request, Response, Express } from 'express';
import { emulatorService } from './services/emulatorService';

/**
 * Registra as rotas relacionadas aos sensores virtuais
 */
export function registerVirtualSensorsRoutes(app: Express) {
  const router = Router();
  
  /**
   * Rota para obter os dados dos sensores virtuais
   * GET /api/emulator/virtual-sensors
   */
  router.get('/emulator/virtual-sensors', (req: Request, res: Response) => {
    try {
      const status = emulatorService.getStatus();
      
      if (!status.enabled) {
        return res.status(400).json({ 
          success: false, 
          message: 'O emulador não está ativo. Ative-o primeiro.' 
        });
      }
      
      // Dados dos sensores a partir do emulador
      const { config, lastReading } = status;
      
      // Retornar os dados mais recentes
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        sensors: {
          waterTemp: config.sensorRanges.waterTemp.current,
          airTemp: config.sensorRanges.airTemp.current,
          waterLevel: config.sensorRanges.waterLevel.current,
          flowRate: config.sensorRanges.flowRate.current,
          humidity: config.sensorRanges.humidity.current,
          pumpPressure: config.sensorRanges.pumpPressure.current,
          phLevel: config.sensorRanges.phLevel.current,
          oxygenLevel: config.sensorRanges.oxygenLevel.current
        },
        controlStates: {
          pumpStatus: config.controlStates.pumpStatus,
          heaterStatus: config.controlStates.heaterStatus,
          pumpFlow: config.controlStates.pumpFlow
        }
      });
    } catch (error) {
      console.error('Error fetching virtual sensors data:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch virtual sensors data',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  /**
   * Rota para atualizar um sensor virtual específico
   * POST /api/emulator/update-sensor
   * Body: { sensorKey: string, value: number }
   */
  router.post('/emulator/update-sensor', (req: Request, res: Response) => {
    try {
      const { sensorKey, value } = req.body;
      
      if (!sensorKey || typeof value !== 'number') {
        return res.status(400).json({ 
          success: false, 
          message: 'Sensor key and numeric value are required' 
        });
      }
      
      // Atualizar a configuração do emulador para refletir o novo valor do sensor
      const config = emulatorService.getConfig();
      
      // Verificar se a chave do sensor é válida
      if (!(sensorKey in config.sensorRanges)) {
        return res.status(400).json({ 
          success: false, 
          message: `Invalid sensor key: ${sensorKey}` 
        });
      }
      
      // Criar uma cópia parcial da configuração para atualização
      const updatedConfig: any = { 
        sensorRanges: { [sensorKey]: { current: value } } 
      };
      
      // Atualizar a configuração
      emulatorService.updateConfig(updatedConfig);
      
      res.json({ 
        success: true, 
        message: `Sensor ${sensorKey} updated to ${value}`,
        updatedValue: value
      });
    } catch (error) {
      console.error('Error updating virtual sensor:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to update virtual sensor',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Rota para controlar a bomba
   * POST /api/emulator/control/pump
   * Body: { status: boolean }
   */
  router.post('/emulator/control/pump', (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      
      if (typeof status !== 'boolean') {
        return res.status(400).json({ 
          success: false, 
          message: 'Status must be a boolean' 
        });
      }
      
      emulatorService.setPumpStatus(status);
      
      res.json({ 
        success: true, 
        pumpStatus: status 
      });
    } catch (error) {
      console.error('Error controlling pump:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to control pump',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Rota para controlar o aquecedor
   * POST /api/emulator/control/heater
   * Body: { status: boolean }
   */
  router.post('/emulator/control/heater', (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      
      if (typeof status !== 'boolean') {
        return res.status(400).json({ 
          success: false, 
          message: 'Status must be a boolean' 
        });
      }
      
      emulatorService.setHeaterStatus(status);
      
      res.json({ 
        success: true, 
        heaterStatus: status 
      });
    } catch (error) {
      console.error('Error controlling heater:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to control heater',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Rota para atualizar a taxa de fluxo da bomba
   * POST /api/emulator/control/pump-flow
   * Body: { flowRate: number }
   */
  router.post('/emulator/control/pump-flow', (req: Request, res: Response) => {
    try {
      const { flowRate } = req.body;
      
      if (typeof flowRate !== 'number' || flowRate < 0 || flowRate > 100) {
        return res.status(400).json({ 
          success: false, 
          message: 'Flow rate must be a number between 0 and 100' 
        });
      }
      
      // Obter a configuração atual para preservar outros estados
      const currentConfig = emulatorService.getConfig();

      // Criar uma cópia parcial da configuração para atualização
      const updatedConfig = { 
        controlStates: { 
          pumpFlow: flowRate,
          pumpStatus: currentConfig.controlStates.pumpStatus,
          heaterStatus: currentConfig.controlStates.heaterStatus
        } 
      };
      
      // Atualizar a configuração
      emulatorService.updateConfig(updatedConfig);
      
      res.json({ 
        success: true, 
        message: `Pump flow updated to ${flowRate}%`,
        pumpFlow: flowRate
      });
    } catch (error) {
      console.error('Error updating pump flow:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to update pump flow',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Registrar todas as rotas no app principal
  app.use('/api', router);
}