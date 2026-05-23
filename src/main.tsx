import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import './index.css'
import App from './App.tsx'

// Register Chart.js components globally (once)
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

// Automatically reload the page if a dynamically imported module fails to load (often due to a new deployment replacing old chunks)
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
