# Sistema de Monitoramento de Aquaponia

## Visão Geral

Este sistema constitui uma plataforma avançada de monitoramento IoT para sistemas aquapônicos, integrando tecnologias web modernas com sensores remotos para fornecer monitoramento em tempo real e controle preciso do ecossistema. A arquitetura implementada permite manutenção robusta das condições ideais de cultivo através de uma interface intuitiva e responsiva.

## Arquitetura do Sistema

O sistema segue uma arquitetura de microserviços distribuída com comunicação assíncrona entre componentes, conforme ilustrado abaixo:

```
┌─────────────────┐     ┌───────────────────┐     ┌─────────────────┐
│                 │     │                   │     │                 │
│  Cliente Web    │◄────┤  Servidor Express │◄────┤  ThingSpeak API │
│  (React/Vite)   │     │  (Node.js)        │     │  (IoT Cloud)    │
│                 │     │                   │     │                 │
└────────┬────────┘     └─────────┬─────────┘     └────────┬────────┘
         │                        │                        │
         │                        │                        │
         ▼                        ▼                        ▼
┌────────────────┐      ┌──────────────────┐     ┌──────────────────┐
│                │      │                  │     │                  │
│ Interface      │      │ Armazenamento    │     │ Sensores Físicos │
│ do Usuário     │      │ de Dados (SQLite)│     │ (ESP8266/ESP32)  │
│                │      │                  │     │                  │
└────────────────┘      └──────────────────┘     └──────────────────┘
```

### Componentes Principais

1. **Frontend (Cliente Web)**:
   - Desenvolvido com React e TypeScript
   - Utiliza a biblioteca Tailwind CSS para estilização
   - Componentes reutilizáveis baseados em shadcn/ui
   - Visualização de dados em tempo real com React Charts

2. **Backend (Servidor Express)**:
   - Node.js com Express para APIs RESTful
   - Middleware para autenticação e validação de requisições
   - Integração com ThingSpeak para comunicação IoT
   - Sistema de fallback para garantir resiliência

3. **Armazenamento de Dados**:
   - SQLite para persistência local
   - Sistema de sincronização para garantir consistência
   - Memcache para performance aprimorada
   - Mecanismo de backup automático

4. **Sistema de Sensores**:
   - Sensores de temperatura da água
   - Sensores de nível da água
   - Controle de bomba hidráulica
   - Controle de aquecedor

## Diagrama de Fluxo de Dados

```
┌──────────────┐    ┌───────────────┐    ┌────────────────┐
│              │    │               │    │                │
│  Sensores    ├───►│  ThingSpeak   ├───►│  API Express   │
│              │    │               │    │                │
└──────────────┘    └───────────────┘    └────────┬───────┘
                                                  │
                                                  ▼
┌──────────────┐    ┌───────────────┐    ┌────────────────┐
│              │    │               │    │                │
│  Interface   │◄───┤  React/Redux  │◄───┤  SQLite DB     │
│  do Usuário  │    │  State        │    │                │
│              │    │               │    │                │
└──────────────┘    └───────────────┘    └────────────────┘
```

## Subsistema de Fallback

Uma das características mais avançadas do sistema é seu mecanismo de fallback, que detecta automaticamente falhas em sensores físicos e alterna para fontes virtuais de dados:

```
┌─────────────────┐      ┌────────────────┐      ┌────────────────┐
│                 │      │                │      │                │
│ Sensor Físico   ├──┐   │ Detector de    │      │ Sensor Virtual │
│                 │  ├──►│ Falhas         ├─────►│                │
└─────────────────┘  │   │                │      └────────────────┘
                     │   └────────────────┘
┌─────────────────┐  │
│                 │  │
│ Monitoramento   ├──┘
│ de Saúde        │
│                 │
└─────────────────┘
```

O sistema monitora continuamente:
- Conectividade de sensores
- Validade de leituras
- Frequência de atualizações
- Desvios estatísticos de parâmetros

## Implementação e Tecnologias

### Frontend
- **React.js**: Framework de UI reativo
- **TypeScript**: Linguagem tipada para desenvolvimento escalável
- **TanStack Query**: Gerenciamento de estado e cache
- **Tailwind CSS**: Framework de CSS utilitário
- **Recharts**: Biblioteca de visualização de dados

### Backend
- **Node.js**: Ambiente de execução JavaScript
- **Express**: Framework web minimalista
- **SQLite**: Banco de dados relacional embutido
- **Drizzle ORM**: ORM para gerenciamento de banco de dados
- **node-cron**: Agendamento de tarefas

### Integração IoT
- **ThingSpeak API**: Plataforma de IoT para coleta e visualização de dados
- **WebSockets**: Comunicação bidirecional em tempo real
- **Fetch API**: Requisições HTTP para APIs externas

## Características de Resiliência

1. **Detecção Automática de Falhas**:
   - Monitoramento contínuo da saúde dos sensores
   - Detecção de leituras anômalas

2. **Sistema de Fallback Inteligente**:
   - Alternância automática para sensores virtuais quando necessário
   - Calibração baseada em dados históricos

3. **Persistência de Dados**:
   - Armazenamento de leituras históricas para análise
   - Estimativa de tendências para previsão de condições

4. **Sincronização Multi-fonte**:
   - Integração com múltiplas fontes de dados
   - Resolução de conflitos entre fontes

## Conclusão

Este sistema representa uma abordagem moderna para o monitoramento de aquaponia, utilizando conceitos de IoT, arquitetura distribuída e mecanismos de resiliência para garantir operação contínua mesmo em cenários de falha parcial. A combinação de tecnologias web contemporâneas com protocolos IoT estabelecidos resulta em uma plataforma robusta, extensível e de fácil manutenção.

A interface do usuário intuitiva, combinada com a robustez da infraestrutura de backend, permite que tanto usuários técnicos quanto não-técnicos possam monitorar e controlar efetivamente seus sistemas aquapônicos, otimizando a produção e minimizando riscos operacionais.