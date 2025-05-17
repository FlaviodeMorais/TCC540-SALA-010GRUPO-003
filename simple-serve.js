const express = require('express');
const path = require('path');
const fs = require('fs');

// Criar uma aplicação Express dedicada para downloads
const app = express();
const PORT = 3001;

// Diretório raiz do projeto
const ROOT_DIR = process.cwd();

// Servir a página HTML de download
app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'download-page.html'));
});

// Rota para download direto do arquivo
app.get('/download', (req, res) => {
  const filePath = path.join(ROOT_DIR, 'aquaponia_sistema_completo.zip');
  
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

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor de download rodando em http://localhost:${PORT}`);
  console.log(`Link direto para download: http://localhost:${PORT}/download`);
});
