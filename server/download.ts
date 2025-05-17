import { Express, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

/**
 * Configura rotas para download de arquivos grandes
 */
export function setupDownloadRoutes(app: Express): void {
  // Servir arquivos estáticos da raiz do projeto (para arquivos grandes como o .zip)
  app.get('/aquaponia_sistema_completo.zip', (req: Request, res: Response) => {
    const filePath = path.join(process.cwd(), 'aquaponia_sistema_completo.zip');
    
    // Verificar se o arquivo existe
    if (!fs.existsSync(filePath)) {
      console.error(`Arquivo não encontrado: ${filePath}`);
      return res.status(404).send('Arquivo não encontrado');
    }
    
    // Configurar cabeçalhos para download
    res.setHeader('Content-Disposition', 'attachment; filename=aquaponia_sistema_completo.zip');
    res.setHeader('Content-Type', 'application/octet-stream');
    
    // Enviar o arquivo como stream
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    console.log('Iniciando download do arquivo completo...');
    
    // Log quando o stream terminar
    fileStream.on('end', () => {
      console.log('Download do arquivo completo concluído');
    });
    
    // Tratar erros no stream
    fileStream.on('error', (err) => {
      console.error(`Erro ao transmitir o arquivo: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).send('Erro ao transmitir o arquivo');
      }
    });
  });
  
  // Página de download
  app.get('/download', (req: Request, res: Response) => {
    res.sendFile(path.join(process.cwd(), 'public', 'download-page.html'));
  });
  
  console.log('Rotas de download configuradas com sucesso!');
}
