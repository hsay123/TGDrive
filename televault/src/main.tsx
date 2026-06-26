window.onerror = (msg, src, line, col, err) => {
  document.body.style.background = '#1a1a2e'
  document.body.style.color = '#ff6b6b'
  document.body.style.fontFamily = 'monospace'
  document.body.style.padding = '20px'
  document.body.innerHTML = `<h2>Startup Error</h2><pre>${msg}\n${src}:${line}\n${err?.stack}</pre>`
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
