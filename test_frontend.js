// Script para testar se o frontend React está sendo corretamente servido pelo Vite
import fs from 'fs';
import { execSync } from 'child_process';

console.log('=== Teste de Conexão com o Frontend React ===');

try {
  console.log('\n1. Verificando resposta da página raiz:');
  const rootResult = execSync('curl -s http://localhost:5000/').toString().substring(0, 500);
  console.log(rootResult);
  
  console.log('\n2. Verificando se o script main.tsx está sendo servido:');
  const mainScript = execSync('curl -s http://localhost:5000/src/main.tsx').toString().substring(0, 200);
  console.log(mainScript);
  
  console.log('\n3. Verificando resposta do servidor Vite:');
  const viteResponse = execSync('curl -I -s http://localhost:5000/@vite/client').toString();
  console.log(viteResponse);
  
  console.log('\n4. Verificando se os estilos estão sendo servidos:');
  const cssResponse = execSync('curl -I -s http://localhost:5000/src/index.css').toString();
  console.log(cssResponse);
} catch (err) {
  console.log(`Erro ao testar frontend: ${err.message}`);
}

console.log('\n=== Teste Concluído ===');