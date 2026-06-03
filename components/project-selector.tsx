'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, FolderOpen, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Project } from '@/lib/supabase'

interface ProjectSelectorProps {
  onProjectSelect: (project: Project | null) => void
  selectedProject: Project | null
}

export function ProjectSelector({ onProjectSelect, selectedProject }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDescription, setNewProjectDescription] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  // Load projects from Supabase API
  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/projects')
      if (response.ok) {
        const data = await response.json()
        setProjects(data)
      } else {
        throw new Error('Failed to fetch projects')
      }
    } catch (error) {
      console.error('Error loading projects:', error)
      // Fallback to localStorage if API fails (for demo/development convenience)
      try {
        const stored = localStorage.getItem('whatsapp-analyzer-projects')
        if (stored) {
          setProjects(JSON.parse(stored))
        }
      } catch (e) {
        console.error('LocalStorage fallback error:', e)
      }
    } finally {
      setIsLoading(false)
      setIsInitialLoad(false)
    }
  }

  const createProject = async () => {
    if (!newProjectName.trim()) return

    setIsLoading(true)
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProjectName.trim(),
          description: newProjectDescription.trim() || undefined
        })
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success && result.project) {
          const newProj = result.project
          const updatedProjects = [newProj, ...projects]
          setProjects(updatedProjects)
          
          // Also sync to localStorage fallback
          localStorage.setItem('whatsapp-analyzer-projects', JSON.stringify(updatedProjects))

          setNewProjectName('')
          setNewProjectDescription('')
          setIsCreateDialogOpen(false)
          
          // Auto-select the new project
          onProjectSelect(newProj)
        } else {
          throw new Error(result.error || 'Failed to create project')
        }
      } else {
        throw new Error('Failed to create project')
      }
    } catch (error) {
      console.error('Error creating project:', error)
      alert(error instanceof Error ? error.message : 'Error creating project. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const deleteProject = async (projectId: string) => {
    if (confirm('Are you sure you want to delete this project? All associated messages and analysis will be permanently removed.')) {
      setIsLoading(true)
      try {
        const response = await fetch(`/api/projects/${projectId}`, {
          method: 'DELETE'
        })

        if (response.ok) {
          const updatedProjects = projects.filter(p => p.id !== projectId)
          setProjects(updatedProjects)
          localStorage.setItem('whatsapp-analyzer-projects', JSON.stringify(updatedProjects))
          
          if (selectedProject?.id === projectId) {
            onProjectSelect(null)
          }
        } else {
          throw new Error('Failed to delete project')
        }
      } catch (error) {
        console.error('Error deleting project:', error)
        alert('Error deleting project. Please try again.')
      } finally {
        setIsLoading(false)
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-slate-700">Your Projects</h2>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600">
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>
                Set up a new WhatsApp analysis project. Zero-knowledge local encryption will be used to protect your message privacy.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Project Name</Label>
                <Input
                  id="name"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="My WhatsApp Analysis"
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder="Brief description of this analysis project"
                  rows={3}
                  disabled={isLoading}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={createProject}
                  disabled={!newProjectName.trim() || isLoading}
                  className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                >
                  {isLoading ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isInitialLoad && projects.length === 0 ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-2 text-slate-600 font-medium">Loading projects...</span>
        </div>
      ) : projects.length === 0 ? (
        <Card className="text-center py-12 bg-white/50 backdrop-blur-sm border border-white/20">
          <CardContent>
            <FolderOpen className="h-16 w-16 mx-auto text-slate-400 mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Projects Yet</h3>
            <p className="text-slate-600 mb-4">Create your first WhatsApp analysis project</p>
            <Button 
              onClick={() => setIsCreateDialogOpen(true)}
              className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create First Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card 
              key={project.id}
              className={`cursor-pointer transition-all duration-200 hover:shadow-lg bg-white/80 backdrop-blur-sm border ${
                selectedProject?.id === project.id 
                  ? 'border-blue-500 ring-2 ring-blue-500/20' 
                  : 'border-white/20 hover:border-blue-300'
              }`}
              onClick={() => onProjectSelect(project)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg line-clamp-1">{project.name}</CardTitle>
                    {project.description && (
                      <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                        {project.description}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteProject(project.id)
                    }}
                    className="text-slate-400 hover:text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between text-sm text-slate-500">
                  <span>{project.messageCount.toLocaleString()} messages</span>
                  <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}