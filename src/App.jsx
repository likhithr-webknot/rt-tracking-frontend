import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import LoginPage from "./components/LoginPage.jsx";

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <LoginPage />
        <div className="p-6 bg-red-500 text-white rounded-xl">Tailwind works</div>
    </>
  )
}

export default App
