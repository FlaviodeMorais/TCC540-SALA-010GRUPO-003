/**
 * Rotas para gerenciamento de alertas por e-mail
 */

import express, { Request, Response } from 'express';
import { getAlertConfig, updateAlertConfig, checkAndSendAlert } from './services/alertService';

export const alertsRouter = express.Router();

/**
 * Obter a configuração atual de alertas
 * GET /api/alerts/config
 */
alertsRouter.get('/config', (req: Request, res: Response) => {
  try {
    const config = getAlertConfig();
    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('❌ Erro ao obter configuração de alertas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao obter configuração de alertas'
    });
  }
});

/**
 * Atualizar a configuração de alertas
 * POST /api/alerts/config
 */
alertsRouter.post('/config', express.json(), async (req: Request, res: Response) => {
  try {
    const newConfig = req.body;
    const updatedConfig = await updateAlertConfig(newConfig);
    
    res.json({
      success: true,
      config: updatedConfig
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar configuração de alertas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao atualizar configuração de alertas'
    });
  }
});

/**
 * Testar o envio de alerta por e-mail
 * POST /api/alerts/test
 * Body: { type: 'temperature' | 'level', value: number }
 */
alertsRouter.post('/test', express.json(), async (req: Request, res: Response) => {
  try {
    const { type, value } = req.body;
    
    if (!type || (type !== 'temperature' && type !== 'level')) {
      return res.status(400).json({
        success: false,
        error: 'Tipo de alerta inválido. Deve ser "temperature" ou "level"'
      });
    }
    
    if (typeof value !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Valor inválido. Deve ser um número'
      });
    }
    
    // Forçar o envio de alerta independentemente dos limites configurados
    const result = await checkAndSendAlert(type, value);
    
    res.json({
      success: true,
      alertSent: result
    });
  } catch (error) {
    console.error('❌ Erro ao testar alerta:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao testar alerta'
    });
  }
});

/**
 * Registra as rotas relacionadas ao sistema de alertas
 * @param app Express app
 */
export function setupAlertRoutes(app: express.Express): void {
  app.use('/api/alerts', alertsRouter);
  console.log('📢 Rotas para sistema de alertas registradas');
}