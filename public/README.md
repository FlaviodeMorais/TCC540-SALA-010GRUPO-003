# Sistema de Monitoramento Aquapônico - Pacote Completo

## Conteúdo do Pacote

Este arquivo ZIP contém a versão completa do Sistema de Monitoramento Aquapônico, incluindo:

- **Projeto Principal**: Código-fonte completo do sistema atualizado
- **PI-V_FINAL**: Versão final do projeto original 
- **PI5_Deploy**: Versão otimizada para deploy
- **TCC**: Versão adaptada para demonstração do Trabalho de Conclusão de Curso

## Instruções de Instalação

### Requisitos do Sistema

- Node.js 18 ou superior
- NPM 8 ou superior
- Mínimo de 200MB de espaço em disco
- Conexão com internet (para comunicação com ThingSpeak)

### Passos para Instalação

1. **Extração dos Arquivos**
   - Extraia o conteúdo do arquivo ZIP para um diretório de sua escolha

2. **Instalação das Dependências**
   ```
   npm install
   ```

3. **Configuração das Variáveis de Ambiente**
   - Crie um arquivo `.env` na raiz do projeto (baseado no `.env.example`)
   ```
   THINGSPEAK_READ_API_KEY=5UWNQD21RD2A7QHG
   THINGSPEAK_WRITE_API_KEY=9NG6QLIN8UXLE2AH
   THINGSPEAK_CHANNEL_ID=2840207
   REFRESH_INTERVAL=300000
   PORT=3000
   DATABASE_FILE=aquaponia.db
   BACKUP_DATABASE_FILE=aquaponia_backup.db
   ```

4. **Execução do Sistema**
   ```
   npm run dev
   ```

5. **Acesso à Interface**
   - Abra o navegador e acesse: `http://localhost:3000`

## Implantação em Produção

### GitHub Pages

Para implantar no GitHub Pages:

1. Configure o arquivo `gh-pages-config.json` com as informações do seu repositório
2. Execute o script de deploy:
   ```
   ./github-pages-deploy.sh
   ```

### Render ou Outros Serviços de Hospedagem

Para implantar em outros serviços:

1. Gere a versão de produção:
   ```
   npm run build
   ```
2. Configure o arquivo `api-config.ts` com as informações de API
3. Execute o script de deploy apropriado:
   ```
   ./deploy.sh
   ```

## Funcionalidades do Sistema

- **Monitoramento em Tempo Real**: Visualização dos dados de temperatura e nível da água
- **Controle de Equipamentos**: Liga/desliga remoto da bomba d'água e aquecedor
- **Configuração de Limites**: Definição de limiares para temperatura e nível da água
- **Análise de Dados Históricos**: Visualização de tendências e estatísticas
- **Sistema de Backup**: Backup automático dos dados em banco secundário
- **Modo Emulador**: Simulação de sensores para testes sem hardware

## Cálculo de Uptime

O sistema agora inclui funcionalidade de cálculo de uptime, mostrando há quanto tempo o sistema está operacional com base na primeira leitura registrada no banco de dados.

## Documentação Completa

Para documentação mais detalhada sobre instalação, configuração, uso e solução de problemas, consulte o arquivo `documentacao.html` incluído neste pacote.

## Credenciais ThingSpeak

- **Canal**: 2840207
- **Chave de Leitura**: 5UWNQD21RD2A7QHG
- **Chave de Escrita**: 9NG6QLIN8UXLE2AH

## Suporte

Para suporte ou dúvidas sobre o sistema, entre em contato com:

- Flavio de Morais - RA: 2110349 - Polo Cosmópolis
- Email: [contato@sistema-aquaponia.com](mailto:contato@sistema-aquaponia.com)

---

**Sistema de Monitoramento para Aquaponia © 2025**