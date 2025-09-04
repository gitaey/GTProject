'use client'

import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)
  
  return (
    <div className="p-6 bg-white rounded-lg shadow-md border">
      <h3 className="text-lg font-semibold mb-4">🔢 Counter</h3>
      <div className="text-center mb-4">
        <div className="text-4xl font-bold text-blue-600">{count}</div>
      </div>
      <div className="flex space-x-3 justify-center">
        <button onClick={() => setCount(count - 1)} className="px-4 py-2 bg-red-500 text-white rounded">-1</button>
        <button onClick={() => setCount(0)} className="px-4 py-2 bg-gray-500 text-white rounded">Reset</button>
        <button onClick={() => setCount(count + 1)} className="px-4 py-2 bg-blue-500 text-white rounded">+1</button>
      </div>
    </div>
  )
}
