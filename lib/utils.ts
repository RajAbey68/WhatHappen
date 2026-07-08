import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d)
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d)
}

export function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^\w -]+/g, '')
    .replace(/ +/g, '-')
}

export function truncate(str: string, length: number) {
  const chars = Array.from(str)
  if (chars.length <= length) return str
  return chars.slice(0, length).join('') + '...'
} 