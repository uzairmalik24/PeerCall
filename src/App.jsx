import { Routes, Route } from 'react-router-dom'
import useLenis from './hooks/useLenis'
import Home from './pages/Home'
import Call from './pages/Call'

export default function App() {
  useLenis()

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/call" element={<Call />} />
    </Routes>
  )
}
