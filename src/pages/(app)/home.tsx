/**
 * /home redirects to the War Room board — the app's main surface.
 */
import { Navigate } from 'react-router-dom'

export default function HomePage() {
  return <Navigate to="/board" replace />
}
