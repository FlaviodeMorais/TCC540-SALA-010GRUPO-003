import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { registerHistoricalDataRoutes } from "./routes-historical-data";
import { setupFallbackRoutes } from "./routes-fallback";
import { setupVite, serveStatic, log } from "./vite";
import path from "path";
import { checkHistoricalTables, initHistoricalDatabase } from "./services/historicalDataService";
import { settingsRouter } from './routes-settings';
// Importar o sistema de lotes do ThingSpeak
import './services/integration';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/downloads', express.static(path.join(process.cwd(), 'public', 'downloads')));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Inicializar tabelas para dados históricos
  try {
    const tablesExist = await checkHistoricalTables();
    if (!tablesExist) {
      console.log('📊 Inicializando tabelas para dados históricos...');
      await initHistoricalDatabase();
      console.log('✅ Tabelas para dados históricos inicializadas com sucesso!');
    } else {
      console.log('📊 Tabelas para dados históricos já existem.');
    }
  } catch (error) {
    console.error('❌ Erro ao inicializar tabelas históricas:', error);
  }
  
  const server = await registerRoutes(app);
  
  // Registrar rotas para dados históricos
  registerHistoricalDataRoutes(app);
  console.log('📊 Rotas para dados históricos registradas.');
  
  // Registrar rotas para o sistema de fallback
  setupFallbackRoutes(app);
  console.log('🔄 Rotas para sistema de fallback registradas.');
  
  // Registrar rotas para configurações
  app.use('/api/settings', settingsRouter);
  console.log('⚙️ Rotas para configurações registradas.');

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
