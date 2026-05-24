import { createContext, useContext } from 'react';

export const ConfigContext = createContext({ pontosAtivados: true });

export const useConfig = () => useContext(ConfigContext);
