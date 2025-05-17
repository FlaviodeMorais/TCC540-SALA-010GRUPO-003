
// Script para verificar e corrigir o tsconfig.json
const fs = require('fs');
const path = require('path');

// Função para verificar um diretório
function checkDirectory(dirPath) {
  try {
    const stats = fs.statSync(dirPath);
    return stats.isDirectory();
  } catch (err) {
    return false;
  }
}

// Função para contar arquivos em um diretório recursivamente
function countFiles(dirPath, extension) {
  if (!checkDirectory(dirPath)) return 0;
  
  let count = 0;
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      count += countFiles(filePath, extension);
    } else if (file.endsWith(extension)) {
      count++;
    }
  }
  
  return count;
}

console.log('Verificando configuração do TypeScript...');

// Verificar se o arquivo tsconfig.json existe
if (!fs.existsSync('tsconfig.json')) {
  console.log('ERRO: tsconfig.json não encontrado!');
  process.exit(1);
}

// Ler o arquivo tsconfig.json
let tsconfig;
try {
  tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
  console.log('tsconfig.json carregado com sucesso.');
} catch (err) {
  console.log(`ERRO ao ler tsconfig.json: ${err.message}`);
  process.exit(1);
}

// Verificar os caminhos de inclusão
const include = tsconfig.include || [];
console.log(`Caminhos de inclusão atuais: ${include.join(', ')}`);

let totalFiles = 0;
for (const pattern of include) {
  // Remova o caractere * para obter o diretório base
  const baseDir = pattern.replace(/\/\*\*\/\*$/, '');
  if (checkDirectory(baseDir)) {
    const count = countFiles(baseDir, '.ts');
    console.log(`${baseDir}: ${count} arquivos TypeScript encontrados`);
    totalFiles += count;
  } else {
    console.log(`AVISO: Diretório ${baseDir} não existe!`);
  }
}

console.log(`Total de arquivos TypeScript encontrados: ${totalFiles}`);

// Verificar estrutura atual do projeto e sugerir correções
const existingDirs = [];
['client/src', 'server', 'shared'].forEach(dir => {
  if (checkDirectory(dir)) {
    existingDirs.push(dir);
    console.log(`Diretório ${dir} existe e tem ${countFiles(dir, '.ts')} arquivos .ts`);
  }
});

// Atualizar tsconfig.json se necessário
if (totalFiles === 0 && existingDirs.length > 0) {
  console.log('Atualizando tsconfig.json com os diretórios existentes...');
  
  // Criar padrões de inclusão para diretórios existentes
  const newInclude = existingDirs.map(dir => `${dir}/**/*`);
  
  // Atualizar o objeto tsconfig
  tsconfig.include = newInclude;
  
  // Salvar o arquivo atualizado
  try {
    fs.writeFileSync('tsconfig.json', JSON.stringify(tsconfig, null, 2));
    console.log(`tsconfig.json atualizado com sucesso. Novos caminhos de inclusão: ${newInclude.join(', ')}`);
  } catch (err) {
    console.log(`ERRO ao salvar tsconfig.json: ${err.message}`);
  }
} else if (totalFiles > 0) {
  console.log('Nenhuma alteração necessária em tsconfig.json, arquivos TypeScript foram encontrados.');
} else {
  console.log('AVISO: Não foi possível detectar arquivos TypeScript nas estruturas de diretório padrão.');
}
