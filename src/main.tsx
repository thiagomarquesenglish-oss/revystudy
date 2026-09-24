import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerServiceWorker } from "./lib/register-sw";
import { removeLegacyMediaDownloads } from "./lib/cloud-media";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("App root not found");
createRoot(rootElement).render(<App />);

void registerServiceWorker();
void removeLegacyMediaDownloads().catch(error => console.warn('Não foi possível remover o antigo cache de mídias:', error));
