import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installFetchGuard } from "./shared/api/installFetchGuard.ts";

installFetchGuard();

createRoot(document.getElementById("root")!).render(<App />);
