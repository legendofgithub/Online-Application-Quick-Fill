import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BallApp } from './BallApp'
import '../index.css'
import '../components/floating-ball.css'
import './ball.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <BallApp />
  </StrictMode>,
)
