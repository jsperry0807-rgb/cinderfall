import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { useAuth } from "./stores/auth";
import "./styles/app.css";

// Guest-first: establish a session in the background while the game boots.
void useAuth.getState().bootstrap();

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <ErrorBoundary>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </ErrorBoundary>
    </StrictMode>,
);
