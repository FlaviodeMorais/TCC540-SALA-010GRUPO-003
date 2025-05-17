/**
 * Rotas para acesso aos dados históricos agregados
 */

import { Express } from 'express';
import { z } from 'zod';
import {
  getHistoricalData,
  processHistoricalData,
  logSystemEvent,
  getSyncHistory,
  getSystemEvents,
  PeriodType
} from './services/historicalDataService';

/**
 * Registra as rotas para dados históricos na aplicação Express
 * @param app Instância do aplicativo Express
 */
export function registerHistoricalDataRoutes(app: Express) {
  // Endpoints específicos para o componente de análise histórica
  app.get('/api/historical-data/temperature', async (req, res) => {
    try {
      const schema = z.object({
        startDate: z.string().transform(s => new Date(s).getTime()),
        endDate: z.string().transform(s => new Date(s).getTime()),
        periodType: z.enum(['hourly', 'daily', 'weekly', 'monthly']).default('daily')
      });

      // Validar parâmetros
      const { startDate, endDate, periodType } = schema.parse(req.query);
      
      console.log(`Fetching temperature readings from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()} from local database...`);
      
      // Obter dados históricos específicos de temperatura
      const data = await getHistoricalData(startDate, endDate, periodType as PeriodType);
      
      // Retornar estrutura esperada pelo componente de análise histórica
      return res.json({
        success: true,
        readings: data,
        setpoints: {
          temperature: { min: 24, max: 28 },
          waterLevel: { min: 60, max: 85 }
        }
      });
    } catch (error) {
      console.error('Erro ao buscar dados históricos de temperatura:', error);
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });
  
  app.get('/api/historical-data/water-level', async (req, res) => {
    try {
      const schema = z.object({
        startDate: z.string().transform(s => new Date(s).getTime()),
        endDate: z.string().transform(s => new Date(s).getTime()),
        periodType: z.enum(['hourly', 'daily', 'weekly', 'monthly']).default('daily')
      });

      // Validar parâmetros
      const { startDate, endDate, periodType } = schema.parse(req.query);
      
      console.log(`Fetching water level readings from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()} from local database...`);
      
      // Obter dados históricos específicos de nível da água
      const data = await getHistoricalData(startDate, endDate, periodType as PeriodType);
      
      // Retornar estrutura esperada pelo componente de análise histórica
      return res.json({
        success: true,
        readings: data,
        setpoints: {
          temperature: { min: 24, max: 28 },
          waterLevel: { min: 60, max: 85 }
        }
      });
    } catch (error) {
      console.error('Erro ao buscar dados históricos de nível da água:', error);
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  });
  
  // Endpoint para obter dados históricos agregados (endpoint original)
  app.get('/api/historical-data', async (req, res) => {
    try {
      const schema = z.object({
        startDate: z.string().transform(s => new Date(s).getTime()),
        endDate: z.string().transform(s => new Date(s).getTime()),
        periodType: z.enum(['hourly', 'daily', 'weekly', 'monthly']).default('daily')
      });
      
      // Validar parâmetros
      const validation = schema.safeParse(req.query);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: 'Parâmetros inválidos', 
          details: validation.error.format() 
        });
      }
      
      const { startDate, endDate, periodType } = validation.data;
      
      console.log(`Buscando dados históricos ${periodType} de ${new Date(startDate).toISOString()} até ${new Date(endDate).toISOString()}`);
      
      // Buscar dados do banco
      const historicalData = await getHistoricalData(
        startDate,
        endDate,
        periodType as PeriodType
      );
      
      return res.json({ success: true, historicalData });
    } catch (error) {
      console.error('Erro ao buscar dados históricos:', error);
      await logSystemEvent(
        'error',
        'Erro ao buscar dados históricos',
        error instanceof Error ? error.message : String(error)
      );
      return res.status(500).json({ error: 'Erro ao buscar dados históricos' });
    }
  });
  
  // Endpoint para processar e agregar dados históricos
  app.post('/api/historical-data/process', async (req, res) => {
    try {
      const schema = z.object({
        startDate: z.string().transform(s => new Date(s).getTime()),
        endDate: z.string().transform(s => new Date(s).getTime())
      });
      
      // Validar parâmetros
      const validation = schema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: 'Parâmetros inválidos', 
          details: validation.error.format() 
        });
      }
      
      const { startDate, endDate } = validation.data;
      
      console.log(`Iniciando processamento de dados históricos de ${new Date(startDate).toISOString()} até ${new Date(endDate).toISOString()}`);
      
      // Este processo pode ser demorado para grandes volumes de dados
      // Executando em background e retornando resposta imediata
      res.json({ 
        success: true, 
        message: 'Processamento de dados históricos iniciado em segundo plano' 
      });
      
      // Executar processamento em background
      processHistoricalData(startDate, endDate)
        .then(result => {
          console.log('Processamento de dados históricos concluído:', result);
          logSystemEvent(
            'info',
            'Processamento de dados históricos concluído',
            `Agregados ${result.hourly} registros horários, ${result.daily} diários, ${result.weekly} semanais e ${result.monthly} mensais.`
          );
        })
        .catch(error => {
          console.error('Erro durante processamento de dados históricos:', error);
          logSystemEvent(
            'error',
            'Erro durante processamento de dados históricos',
            error instanceof Error ? error.message : String(error)
          );
        });
      
    } catch (error) {
      console.error('Erro ao iniciar processamento de dados históricos:', error);
      await logSystemEvent(
        'error',
        'Erro ao iniciar processamento de dados históricos',
        error instanceof Error ? error.message : String(error)
      );
      return res.status(500).json({ error: 'Erro ao iniciar processamento de dados históricos' });
    }
  });
  
  // Endpoint para obter histórico de sincronizações
  app.get('/api/sync-history', async (req, res) => {
    try {
      const schema = z.object({
        limit: z.string().transform(s => parseInt(s, 10)).default('100'),
        offset: z.string().transform(s => parseInt(s, 10)).default('0')
      });
      
      // Validar parâmetros
      const validation = schema.safeParse(req.query);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: 'Parâmetros inválidos', 
          details: validation.error.format() 
        });
      }
      
      const { limit, offset } = validation.data;
      
      // Buscar histórico de sincronização
      const syncHistory = await getSyncHistory(limit, offset);
      
      return res.json({ success: true, syncHistory });
    } catch (error) {
      console.error('Erro ao buscar histórico de sincronização:', error);
      return res.status(500).json({ error: 'Erro ao buscar histórico de sincronização' });
    }
  });
  
  // Endpoint para obter eventos do sistema
  app.get('/api/system-events', async (req, res) => {
    try {
      const schema = z.object({
        limit: z.string().transform(s => parseInt(s, 10)).default('100'),
        offset: z.string().transform(s => parseInt(s, 10)).default('0'),
        type: z.enum(['error', 'warning', 'info']).optional()
      });
      
      // Validar parâmetros
      const validation = schema.safeParse(req.query);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: 'Parâmetros inválidos', 
          details: validation.error.format() 
        });
      }
      
      const { limit, offset, type } = validation.data;
      
      // Buscar eventos do sistema
      const systemEvents = await getSystemEvents(limit, offset, type);
      
      return res.json({ success: true, systemEvents });
    } catch (error) {
      console.error('Erro ao buscar eventos do sistema:', error);
      return res.status(500).json({ error: 'Erro ao buscar eventos do sistema' });
    }
  });
}