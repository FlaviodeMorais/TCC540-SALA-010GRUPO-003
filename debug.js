// Script de diagnóstico para verificar problemas do frontend
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('=== Diagnóstico do Sistema Aquaponia ===');

// Verificar arquivos críticos
console.log('\n1. Verificando arquivos principais:');
const criticalFiles = [
  'client/index.html',
  'client/src/main.tsx',
  'client/src/App.tsx',
  'client/src/index.css',
  'server/index.ts',
  'server/vite.ts',
  'vite.config.ts'
];

criticalFiles.forEach(file => {
  try {
    const stats = fs.statSync(file);
    console.log(`✅ ${file} (${stats.size} bytes)`);
  } catch (err) {
    console.log(`❌ ${file} - ERRO: ${err.message}`);
  }
});

// Verificar configuração do ambiente
console.log('\n2. Configuração do ambiente:');
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  const nodeEnv = envContent.match(/NODE_ENV=([^\n]+)/);
  const port = envContent.match(/PORT=([^\n]+)/);
  
  console.log(`NODE_ENV: ${nodeEnv ? nodeEnv[1] : 'não encontrado'}`);
  console.log(`PORT: ${port ? port[1] : 'não encontrado'}`);
} catch (err) {
  console.log(`Erro ao ler .env: ${err.message}`);
}

// Teste de rede 
console.log('\n3. Teste de conexão com servidor:');
try {
  const result = execSync('curl -s http://localhost:5000/api/readings/latest').toString().substring(0, 100) + '...';
  console.log(`API /readings/latest: ${result}`);
} catch (err) {
  console.log(`Erro ao acessar API: ${err.message}`);
}

// Verificar dependências React no package.json
console.log('\n4. Verificando dependências React:');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const deps = packageJson.dependencies || {};
  
  const reactDeps = Object.keys(deps).filter(dep => 
    dep === 'react' || dep === 'react-dom' || dep.startsWith('@tanstack/react')
  );
  
  reactDeps.forEach(dep => {
    console.log(`- ${dep}: ${deps[dep]}`);
  });
} catch (err) {
  console.log(`Erro ao verificar package.json: ${err.message}`);
}

console.log('\n5. Verificando porta do servidor:');
try {
  const serverFile = fs.readFileSync('server/index.ts', 'utf8');
  const portMatch = serverFile.match(/const port = (\d+)/);
  console.log(`Porta configurada no server/index.ts: ${portMatch ? portMatch[1] : 'não encontrada'}`);
} catch (err) {
  console.log(`Erro ao ler server/index.ts: ${err.message}`);
}

console.log('\n=== Diagnóstico Concluído ===');