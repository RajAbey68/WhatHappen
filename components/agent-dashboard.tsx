"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface AgentTask {
  id: string
  fileName: string
  status: string
  error?: string
  expertise?: string
  jurisdiction?: string
}

export function AgentDashboard() {
  const [tasks, setTasks] = useState<AgentTask[]>([])

  useEffect(() => {
    // Fetch initial active tasks
    const fetchTasks = async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .in('processing_status', ['processing', 'pending'])
        .order('created_at', { ascending: false })
        .limit(10)

      if (data) {
        setTasks(
          data.map((row) => ({
            id: row.id,
            fileName: row.file_name,
            status: row.processing_status,
            error: row.processing_error,
            expertise: 'Counterparty Communications Expert', // Mocked or retrieved from related Project
            jurisdiction: 'UK'
          }))
        )
      }
    }

    fetchTasks()

    // Subscribe to realtime updates on sessions to see agent progress
    const channel = supabase
      .channel('agent_progress')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions' },
        (payload) => {
          setTasks((prev) => {
            const index = prev.findIndex((t) => t.id === payload.new.id)
            if (index > -1) {
              const newTasks = [...prev]
              newTasks[index] = {
                ...newTasks[index],
                status: payload.new.processing_status,
                error: payload.new.processing_error
              }
              return newTasks
            }
            return prev
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  if (tasks.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mt-8">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center">
          <svg className="w-5 h-5 mr-2 text-indigo-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
          Active Agents Monitoring
        </h3>
        <span className="bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
          {tasks.length} Active
        </span>
      </div>
      
      <ul className="divide-y divide-gray-200">
        {tasks.map((task) => (
          <li key={task.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-indigo-100">
                    <span className="text-sm font-medium leading-none text-indigo-700">AI</span>
                  </span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {task.fileName}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Persona: <span className="font-semibold text-gray-700">{task.expertise}</span> • Jurisdiction: {task.jurisdiction}
                  </p>
                  {task.error && (
                    <p className="text-xs text-blue-600 mt-1.5 flex items-center">
                      <svg className="w-3 h-3 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {task.error}
                    </p>
                  )}
                </div>
              </div>
              <div className="ml-4 flex-shrink-0">
                <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                  {task.status === 'processing' ? 'Processing...' : 'Queued'}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
