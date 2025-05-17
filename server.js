const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const port = process.env.PORT || 3000;

// Importação das rotas dos sensores virtuais
const virtualSensorsRoutes = require('./aquaponia-monitor/server/routes-virtual-sensors').default;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Registrar as rotas da API
app.use('/api', virtualSensorsRoutes);

// Logger para requisições
app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.path}`);
  next();
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'aquaponia-monitor/client/src')));

// Serve the HTML file
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'aquaponia-monitor/client/src/index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
  console.log(`Emulator API available at http://0.0.0.0:${port}/api/emulator/status`);
});