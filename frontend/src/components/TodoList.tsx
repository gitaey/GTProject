'use client'

import {useState} from 'react'

export default function TodoList() {
    const [todos, setTodos] = useState([
        {id: 1, text: 'React 기초 학습하기', completed: true},
        {id: 2, text: 'Next.js 구조 이해하기', completed: false},
        {id: 3, text: 'Zustand 상태관리 배우기', completed: false}
    ])
    const [inputValue, setInputValue] = useState('')

    const addTodo = () => {
        if (inputValue.trim()) {
            const newTodo = {
                id: todos.length + 1,
                text: inputValue,
                completed: false
            }
            setTodos([...todos, newTodo])
            setInputValue('')
        }
    }

    const toggleTodo = (id) => {
        setTodos(todos.map(todo =>
            todo.id === id ? {...todo, completed: !todo.completed} : todo
        ))
    }

    const deleteTodo = (id) => {
        setTodos(todos.filter(todo => todo.id !== id))
    }

    return (
        <div className="p-6 bg-white rounded-lg shadow-md border">
            <h3 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
                📝 TodoList 컴포넌트
                <span className="ml-2 text-sm bg-purple-100 text-purple-600 px-2 py-1 rounded">배열 상태</span>
            </h3>

            <div className="mb-4 flex space-x-2">
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="새 할 일을 입력하세요..."
                    className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyPress={(e) => e.key === 'Enter' && addTodo()}
                />
                <button
                    onClick={addTodo}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                    추가
                </button>
            </div>

            <div className="space-y-2 mb-4">
                {todos.map(todo => (
                    <div key={todo.id}
                         className={`flex items-center justify-between p-3 rounded-lg ${todo.completed ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                        <div className="flex items-center space-x-3">
                            <input
                                type="checkbox"
                                checked={todo.completed}
                                onChange={() => toggleTodo(todo.id)}
                                className="w-4 h-4 text-blue-600"
                            />
                            <span className={`${todo.completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>
                {todo.text}
              </span>
                        </div>
                        <button
                            onClick={() => deleteTodo(todo.id)}
                            className="px-2 py-1 text-red-500 hover:bg-red-100 rounded text-sm"
                        >
                            삭제
                        </button>
                    </div>
                ))}
            </div>

            <div className="text-center text-sm text-gray-500 mb-4">
                전체 {todos.length}개 | 완료 {todos.filter(t => t.completed).length}개 | 남은
                일 {todos.filter(t => !t.completed).length}개
            </div>

            <div className="p-3 bg-gray-50 rounded-lg">
                <h4 className="font-semibold text-sm text-gray-700 mb-2">💡 학습 포인트:</h4>
                <ul className="text-xs text-gray-600 space-y-1">
                    <li>• 배열 상태 관리 (map, filter)</li>
                    <li>• 입력 값 상태 (controlled input)</li>
                    <li>• key prop으로 리스트 렌더링</li>
                    <li>• 이벤트 핸들링 (Enter 키, 클릭)</li>
                </ul>
            </div>
        </div>
    )
}
