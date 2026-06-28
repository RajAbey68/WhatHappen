import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProjectSelector } from '../../components/project-selector'

jest.mock('lucide-react', () => ({
  Plus: (props: any) => <div data-testid="plus-icon" {...props} />,
  Trash2: (props: any) => <div data-testid="trash-icon" {...props} />,
  FolderOpen: (props: any) => <div data-testid="folder-icon" {...props} />,
  Loader2: (props: any) => <div data-testid="loader-icon" {...props} />,
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}))

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <h3 {...props}>{children}</h3>,
}))

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: any) => <div>{children}</div>,
  DialogTrigger: ({ children, asChild }: any) => (asChild ? children : <button>{children}</button>),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}))

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}))

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}))

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}))

describe('ProjectSelector', () => {
  const onProjectSelect = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    window.localStorage.clear()
  })

  test('renders heading and new-project action', async () => {
    render(<ProjectSelector selectedProject={null} onProjectSelect={onProjectSelect} />)

    expect(screen.getByText('Your Projects')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/projects')
    })
  })

  test('shows empty state when API returns no projects', async () => {
    render(<ProjectSelector selectedProject={null} onProjectSelect={onProjectSelect} />)

    expect(await screen.findByText('No Projects Yet')).toBeInTheDocument()
  })

  test('renders projects returned by API', async () => {
    ;(global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'p1',
          name: 'Team Chat',
          description: 'Ops planning',
          createdAt: '2025-01-01T00:00:00.000Z',
          messageCount: 42,
          participants: ['A', 'B'],
        },
      ],
    })

    render(<ProjectSelector selectedProject={null} onProjectSelect={onProjectSelect} />)

    expect(await screen.findByText('Team Chat')).toBeInTheDocument()
    expect(screen.getByText('Ops planning')).toBeInTheDocument()
    expect(screen.getByText(/42 messages/i)).toBeInTheDocument()
  })

  test('selects a project on card click', async () => {
    const user = userEvent.setup()
    ;(global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'p1',
          name: 'Team Chat',
          description: 'Ops planning',
          createdAt: '2025-01-01T00:00:00.000Z',
          messageCount: 42,
          participants: ['A', 'B'],
        },
      ],
    })

    render(<ProjectSelector selectedProject={null} onProjectSelect={onProjectSelect} />)

    const cardTitle = await screen.findByText('Team Chat')
    await user.click(cardTitle)

    expect(onProjectSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', name: 'Team Chat' })
    )
  })
})
