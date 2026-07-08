"use client"

import { useState } from 'react'

import { AgentConfig } from '@/lib/types/agent'

interface AgentBuilderProps {
  onConfigChange: (config: AgentConfig) => void
  disabled?: boolean
}

export function AgentBuilder({ onConfigChange, disabled }: AgentBuilderProps) {
  const [expertId, setExpertId] = useState<AgentConfig['expertId']>('GENERAL_ANALYST')
  const [jurisdiction, setJurisdiction] = useState<AgentConfig['jurisdiction']>('UK')
  const [regulator, setRegulator] = useState<AgentConfig['regulator']>('NONE')

  const handleConfigUpdate = (key: keyof AgentConfig, value: string) => {
    let newExpertId = expertId
    let newJurisdiction = jurisdiction
    let newRegulator = regulator

    if (key === 'expertId') { newExpertId = value as AgentConfig['expertId']; setExpertId(newExpertId); }
    if (key === 'jurisdiction') { newJurisdiction = value as AgentConfig['jurisdiction']; setJurisdiction(newJurisdiction); }
    if (key === 'regulator') { newRegulator = value as AgentConfig['regulator']; setRegulator(newRegulator); }

    onConfigChange({
      expertId: newExpertId,
      jurisdiction: newJurisdiction,
      regulator: newRegulator
    })
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 my-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
        <svg className="w-5 h-5 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
        Agent Architecture Configuration
      </h3>
      <p className="text-sm text-gray-600 mb-6">
        Configure the specialized expert agent that will process this data. The agent will strictly adhere to the selected jurisdiction and regulatory framework.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Expertise Persona</label>
          <select 
            disabled={disabled}
            value={expertId}
            onChange={(e) => handleConfigUpdate('expertId', e.target.value)}
            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm py-2 px-3 disabled:bg-gray-100"
          >
            <option value="GENERAL_ANALYST">General Data Analyst</option>
            <option value="COUNTERPARTY_EXPERT">Counterparty Communications Expert</option>
            <option value="LEGAL_COUNSEL">Corporate Legal Counsel</option>
            <option value="FINANCIAL_AUDITOR">Financial Ledger Auditor</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Jurisdiction</label>
          <select 
            disabled={disabled}
            value={jurisdiction}
            onChange={(e) => handleConfigUpdate('jurisdiction', e.target.value)}
            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm py-2 px-3 disabled:bg-gray-100"
          >
            <option value="UK">United Kingdom (UK)</option>
            <option value="EU">European Union (EU)</option>
            <option value="US">United States (US)</option>
            <option value="GLOBAL">Global / Neutral</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Regulatory Compliance</label>
          <select 
            disabled={disabled}
            value={regulator}
            onChange={(e) => handleConfigUpdate('regulator', e.target.value)}
            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm py-2 px-3 disabled:bg-gray-100"
          >
            <option value="NONE">None</option>
            <option value="SRA">SRA (Solicitors Regulation Authority)</option>
            <option value="FCA">FCA (Financial Conduct Authority)</option>
            <option value="HIPAA">HIPAA (Health Data)</option>
            <option value="GDPR">GDPR (Data Privacy)</option>
          </select>
        </div>
      </div>
      
      <div className="mt-6 bg-indigo-50 rounded-md p-4 flex items-start">
        <svg className="w-5 h-5 text-indigo-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <div>
          <p className="text-xs text-indigo-700 font-medium">Runtime Context</p>
          <p className="text-xs text-indigo-600 mt-1">
            Data will be processed by a <span className="font-bold">{expertId}</span>, strictly bound to <span className="font-bold">{jurisdiction}</span> jurisdiction, complying with <span className="font-bold">{regulator !== 'NONE' ? regulator : 'standard'}</span> regulations.
          </p>
        </div>
      </div>
    </div>
  )
}
