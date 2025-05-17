import { 
  createContext, 
  useContext, 
  useState, 
  ReactNode, 
  useEffect 
} from 'react';

interface SystemContextProps {
  systemName: string;
  setSystemName: (name: string) => void;
}

const defaultState: SystemContextProps = {
  systemName: 'Aquaponia',
  setSystemName: () => {}
};

const SystemContext = createContext<SystemContextProps>(defaultState);

export function useSystemContext() {
  return useContext(SystemContext);
}

interface SystemProviderProps {
  children: ReactNode;
}

export function SystemProvider({ children }: SystemProviderProps) {
  // Inicializa com o valor padrão ou o que está armazenado no localStorage
  const [systemName, setSystemName] = useState<string>(() => {
    const savedName = localStorage.getItem('systemName');
    return savedName || 'Aquaponia';
  });

  // Persiste o nome do sistema no localStorage quando for alterado
  useEffect(() => {
    localStorage.setItem('systemName', systemName);
  }, [systemName]);

  const value = {
    systemName,
    setSystemName
  };

  return (
    <SystemContext.Provider value={value}>
      {children}
    </SystemContext.Provider>
  );
}