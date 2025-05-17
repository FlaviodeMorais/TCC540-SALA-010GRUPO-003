/**
 * Funções utilitárias para registro de logs na aplicação
 */

/**
 * Registra uma mensagem informativa no log
 * @param message Mensagem principal
 * @param data Dados adicionais (opcional)
 */
export function logInfo(message: string, data?: any): void {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${timestamp} [info] ${message}`);
  if (data) {
    console.log(data);
  }
}

/**
 * Registra uma mensagem de erro no log
 * @param message Mensagem de erro
 * @param error Objeto de erro (opcional)
 */
export function logError(message: string, error?: any): void {
  const timestamp = new Date().toLocaleTimeString();
  console.error(`${timestamp} [error] ❌ ${message}`);
  if (error) {
    if (error instanceof Error) {
      console.error(`${error.name}: ${error.message}`);
      if (error.stack) {
        console.error(error.stack.split('\n').slice(1).join('\n'));
      }
    } else {
      console.error(error);
    }
  }
}

/**
 * Registra uma mensagem de aviso no log
 * @param message Mensagem de aviso
 * @param data Dados adicionais (opcional)
 */
export function logWarning(message: string, data?: any): void {
  const timestamp = new Date().toLocaleTimeString();
  console.warn(`${timestamp} [warning] ⚠️ ${message}`);
  if (data) {
    console.warn(data);
  }
}

/**
 * Registra uma mensagem de depuração no log
 * @param message Mensagem de depuração
 * @param data Dados adicionais (opcional)
 */
export function logDebug(message: string, data?: any): void {
  if (process.env.DEBUG === 'true') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${timestamp} [debug] 🔍 ${message}`);
    if (data) {
      console.log(data);
    }
  }
}