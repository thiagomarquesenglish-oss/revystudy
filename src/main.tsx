import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerServiceWorker } from "./lib/register-sw";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("App root not found");
createRoot(rootElement).render(<App />);

void registerServiceWorker();
