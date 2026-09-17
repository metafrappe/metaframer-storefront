import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

const Router = import.meta.env.VITE_ROUTER_MODE === "hash"
  ? HashRouter
  : BrowserRouter;
const basename = import.meta.env.VITE_ROUTER_MODE === "hash"
  ? undefined
  : import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router basename={basename}>
      <App />
    </Router>
  </React.StrictMode>,
);
