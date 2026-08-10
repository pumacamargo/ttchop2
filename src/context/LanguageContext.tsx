import React, { createContext, useContext } from 'react';
import { getT, type Translations } from '../i18n';

const LanguageContext = createContext<Translations>(getT('English'));

export const LanguageProvider: React.FC<{ language: string; children: React.ReactNode }> = ({ language, children }) => (
  <LanguageContext.Provider value={getT(language)}>
    {children}
  </LanguageContext.Provider>
);

export const useT = () => useContext(LanguageContext);
