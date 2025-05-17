const express = require('express');
const path = require('path');
const app = express();
const port = 3001;

// Base HTML content
const html = `
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sistema de Monitoramento Aquapônico</title>
    <style>
      body { 
        font-family: Arial, sans-serif; 
        max-width: 800px; 
        margin: 0 auto; 
        padding: 20px;
      }
      .container {
        border: 1px solid #ccc;
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 20px;
      }
      h1 { color: #0066cc; }
      .gauge {
        width: 150px;
        height: 150px;
        border-radius: 50%;
        background: linear-gradient(90deg, #2ecc71 0%, #f1c40f 50%, #e74c3c 100%);
        position: relative;
        margin: 20px auto;
        overflow: hidden;
      }
      .gauge::after {
        content: '';
        position: absolute;
        width: 120px;
        height: 120px;
        background: white;
        border-radius: 50%;
        top: 15px;
        left: 15px;
      }
      .device {
        display: inline-block;
        padding: 10px 20px;
        border-radius: 4px;
        margin: 10px;
        font-weight: bold;
      }
      .on { background-color: #2ecc71; color: white; }
      .off { background-color: #e74c3c; color: white; }
    </style>
  </head>
  <body>
    <h1>Sistema de Monitoramento Aquapônico</h1>
    
    <div class="container">
      <h2>Status Atual</h2>
      <p>Última atualização: 26/03/2025 18:52</p>
      
      <div style="display: flex; justify-content: space-around;">
        <div>
          <h3>Temperatura da Água</h3>
          <div class="gauge"></div>
          <p style="text-align: center; font-size: 24px; font-weight: bold;">24.5°C</p>
        </div>
        
        <div>
          <h3>Nível da Água</h3>
          <div class="gauge"></div>
          <p style="text-align: center; font-size: 24px; font-weight: bold;">78%</p>
        </div>
      </div>
      
      <h3>Dispositivos</h3>
      <div>
        <div class="device on">Bomba: LIGADA</div>
        <div class="device off">Aquecedor: DESLIGADO</div>
      </div>
    </div>
    
    <div class="container">
      <h2>Navegação</h2>
      <ul>
        <li><a href="/">Dashboard</a></li>
        <li><a href="/settings">Configurações</a></li>
        <li><a href="/data-source">Fonte de Dados</a></li>
      </ul>
    </div>
  </body>
</html>
`;

// Serve HTML directly
app.get('*', (req, res) => {
  res.send(html);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor de demonstração rodando em http://localhost:${port}`);
});