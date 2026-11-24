import { createContext, type ReactNode } from 'react';

// The extension supplies its notice; the web app keeps its existing guide.
export const PrivacyNoticeContext = createContext<ReactNode>(null);
