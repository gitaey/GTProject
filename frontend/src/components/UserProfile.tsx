'use client'

import { useState } from 'react'

export default function UserProfile() {
  const [user, setUser] = useState({
    name: '홍길동',
    age: 25,
    job: '개발자',
    isOnline: true
  })

  const updateName = () => {
    const names = ['김철수', '이영희', '박민수', '최영진', '홍길동']
    const randomName = names[Math.floor(Math.random() * names.length)]
    setUser({...user, name: randomName})
  }

  const toggleOnlineStatus = () => {
    setUser({...user, isOnline: !user.isOnline})
  }

  const increaseAge = () => {
    setUser({...user, age: user.age + 1})
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-md border">
      <h3 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
        👤 UserProfile 컴포넌트
        <span className="ml-2 text-sm bg-blue-100 text-blue-600 px-2 py-1 rounded">객체 상태</span>
      </h3>

      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full mx-auto mb-3 flex items-center justify-center">
          <span className="text-2xl text-white font-bold">
            {user.name.charAt(0)}
          </span>
        </div>
        
        <h4 className="text-xl font-bold text-gray-800 mb-1">{user.name}</h4>
        <p className="text-gray-600 mb-2">{user.age}세 • {user.job}</p>
        
        <div className="flex items-center justify-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${user.isOnline ? 'bg-green-500' : 'bg-gray-400'}`}></div>
          <span className={`text-sm font-medium ${user.isOnline ? 'text-green-600' : 'text-gray-500'}`}>
            {user.isOnline ? '온라인' : '오프라인'}
          </span>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <button onClick={updateName} className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
          이름 랜덤 변경
        </button>
        <button onClick={increaseAge} className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
          나이 +1
        </button>
        <button onClick={toggleOnlineStatus} className={`w-full px-4 py-2 rounded-lg ${user.isOnline ? 'bg-gray-500 hover:bg-gray-600' : 'bg-green-500 hover:bg-green-600'} text-white`}>
          {user.isOnline ? '오프라인으로 변경' : '온라인으로 변경'}
        </button>
      </div>

      <div className="p-3 bg-gray-50 rounded-lg">
        <h4 className="font-semibold text-sm text-gray-700 mb-2">💡 학습 포인트:</h4>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>• useState로 객체 상태 관리</li>
          <li>• 스프레드 연산자 (...) 사용</li>
          <li>• 조건부 렌더링 (삼항 연산자)</li>
          <li>• 템플릿 리터럴로 동적 스타일</li>
        </ul>
      </div>
    </div>
  )
}
