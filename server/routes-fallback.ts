/**
 * Rotas para o serviço de fallback
 * Este serviço gerencia a troca automática entre sensores reais e virtuais
 * com base na saúde e disponibilidade dos sensores físicos.
 */
import express, { Request, Response } from 'express';
import { fallbackService } from './services/fallbackService';

/**
 * Registra as rotas relacionadas ao sistema de fallback
 * @param app Express app
 */
export function setupFallbackRoutes(app: express.Express): void {
  /**
   * Atualizar valores dos sensores virtuais diretamente
   */
  app.post('/api/fallback/virtual-reading', express.json(), async (req: Request, res: Response) => {
    try {
      const { temperature, level, pump_status, heater_status } = req.body;
      
      const config = fallbackService.getConfig();
      
      // Atualizar valores atuais dos sensores virtuais
      const newConfig = {
        ...config,
        temperature: {
          ...config.temperature,
          current: temperature !== undefined ? parseFloat(temperature) : config.temperature.current
        },
        level: {
          ...config.level,
          current: level !== undefined ? parseFloat(level) : config.level.current
        },
        pumpState: pump_status === 1 || pump_status === true,
        heaterState: heater_status === 1 || heater_status === true
      };
      
      fallbackService.updateConfig(newConfig);
      
      res.json({
        success: true,
        message: 'Valores virtuais atualizados com sucesso',
        config: fallbackService.getConfig()
      });
    } catch (error: any) {
      console.error('❌ Erro ao atualizar leitura virtual:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro interno do servidor'
      });
    }
  });
  /**
   * Obter a configuração atual do sistema de fallback
   */
  app.get('/api/fallback/config', (req: Request, res: Response) => {
    try {
      const config = fallbackService.getConfig();
      res.json({
        success: true,
        config
      });
    } catch (error: any) {
      console.error('❌ Erro ao obter configuração do fallback:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro interno do servidor'
      });
    }
  });

  /**
   * Atualizar a configuração do sistema de fallback
   */
  app.post('/api/fallback/config', express.json(), (req: Request, res: Response) => {
    try {
      const newConfig = req.body;
      
      if (!newConfig || typeof newConfig !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Configuração inválida'
        });
      }
      
      const updatedConfig = fallbackService.updateConfig(newConfig);
      res.json({
        success: true,
        config: updatedConfig
      });
    } catch (error: any) {
      console.error('❌ Erro ao atualizar configuração do fallback:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro interno do servidor'
      });
    }
  });

  /**
   * Obter as fontes atuais dos sensores (hardware/virtual)
   */
  app.get('/api/fallback/sources', (req: Request, res: Response) => {
    try {
      const sources = fallbackService.getSensorSources();
      res.json({
        success: true,
        sources
      });
    } catch (error: any) {
      console.error('❌ Erro ao obter fontes dos sensores:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro interno do servidor'
      });
    }
  });

  /**
   * Definir a fonte de um sensor específico (hardware/virtual)
   */
  app.post('/api/fallback/sources/:sensor', express.json(), async (req: Request, res: Response) => {
    try {
      const { sensor } = req.params;
      const { source } = req.body;
      
      if (!sensor || !source || (source !== 'hardware' && source !== 'virtual')) {
        return res.status(400).json({
          success: false,
          error: 'Parâmetros inválidos. Sensor e fonte (hardware/virtual) são obrigatórios.'
        });
      }
      
      // Método agora é assíncrono e precisa ser aguardado
      await fallbackService.setSensorSource(sensor as any, source);
      
      res.json({
        success: true,
        message: `Fonte do sensor ${sensor} definida como ${source}`,
        sources: fallbackService.getSensorSources()
      });
    } catch (error: any) {
      console.error(`❌ Erro ao definir fonte do sensor:`, error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro interno do servidor'
      });
    }
  });

  /**
   * Obter o status de saúde de todos os sensores
   */
  app.get('/api/fallback/health', (req: Request, res: Response) => {
    try {
      const health = fallbackService.getSensorsHealth();
      res.json({
        success: true,
        health
      });
    } catch (error: any) {
      console.error('❌ Erro ao obter saúde dos sensores:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro interno do servidor'
      });
    }
  });

  /**
   * Forçar verificação de saúde dos sensores
   */
  app.post('/api/fallback/health/check', async (req: Request, res: Response) => {
    try {
      await fallbackService.checkSensorsHealth();
      const health = fallbackService.getSensorsHealth();
      
      res.json({
        success: true,
        message: 'Verificação de saúde dos sensores realizada com sucesso',
        health
      });
    } catch (error: any) {
      console.error('❌ Erro ao verificar saúde dos sensores:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erro interno do servidor'
      });
    }
  });

  console.log('📊 Rotas para o sistema de fallback registradas com sucesso.');
}