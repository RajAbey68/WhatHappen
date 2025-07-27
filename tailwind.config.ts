import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  safelist: [
    // Gradients
    'bg-gradient-to-br',
    'bg-gradient-to-r',
    'from-slate-50',
    'via-blue-50',
    'to-indigo-100',
    'dark:from-slate-900',
    'dark:via-blue-900',
    'dark:to-indigo-900',
    'from-blue-600/10',
    'to-purple-600/10',
    'from-blue-500',
    'to-purple-600',
    'from-yellow-400',
    'to-orange-500',
    'from-slate-200',
    'to-slate-300',
    'dark:from-slate-700',
    'dark:to-slate-600',
    'from-blue-600',
    'to-purple-600',
    'bg-clip-text',
    'text-transparent',
    'from-blue-500/10',
    'to-purple-600/10',
    // Background effects
    'bg-white/80',
    'dark:bg-slate-800/80',
    'backdrop-blur-sm',
    'backdrop-blur-3xl',
    // Shadows and borders
    'shadow-lg',
    'shadow-2xl',
    'rounded-2xl',
    'rounded-3xl',
    'rounded-full',
    'border-slate-200',
    'dark:border-slate-700',
    'border-dashed',
    'border-2',
    // Animations
    'animate-pulse',
    'transition-all',
    'duration-300',
    'transition-colors',
    // Hover states
    'hover:scale-[1.02]',
    'hover:border-blue-400',
    'hover:bg-blue-50/50',
    'dark:hover:bg-blue-900/10',
    'group-hover:from-blue-500',
    'group-hover:to-purple-600',
    'group-hover:shadow-lg',
    'group-hover:text-white',
    // Active states
    'data-[state=active]:bg-gradient-to-r',
    'data-[state=active]:from-blue-500',
    'data-[state=active]:to-purple-600',
    'data-[state=active]:text-white',
    'data-[state=active]:shadow-lg',
    'data-[state=active]:bg-background',
    // Text colors
    'text-slate-600',
    'dark:text-slate-300',
    'text-slate-800',
    'dark:text-white',
    'text-blue-600',
    'dark:text-blue-400',
    'text-white',
    'text-blue-500',
    'text-yellow-500',
    'text-green-500',
    'text-purple-500',
    'text-slate-700',
    'dark:text-slate-300',
    // Sizing
    'h-4', 'w-4', 'h-6', 'w-6', 'h-8', 'w-8', 'h-12', 'w-12',
    'text-5xl', 'text-xl', 'text-lg', 'text-2xl', 'text-sm',
    'font-bold', 'font-medium', 'leading-relaxed',
    // Layout
    'min-h-screen', 'max-w-3xl', 'max-w-7xl', 'mx-auto',
    'flex', 'items-center', 'justify-center', 'grid', 'grid-cols-5',
    'relative', 'absolute', 'inset-0', 'overflow-hidden',
    // Spacing
    'p-2', 'p-3', 'p-6', 'p-8', 'p-12',
    'px-4', 'py-2', 'px-6', 'py-3',
    'gap-2', 'gap-3', 'gap-6',
    'space-y-3', 'space-y-6', 'space-y-8',
    'mb-6', 'mt-8', 'mt-2', 'pt-4', 'pb-8', 'pb-16',
    'sm:px-6', 'lg:px-8', 'py-16', 'sm:inline', 'hidden',
    // Other utilities
    'tracking-tight', 'cursor-pointer', 'group',
    'justify-center', 'whitespace-nowrap',
    'ring-offset-background', 'focus-visible:outline-none',
    'focus-visible:ring-2', 'focus-visible:ring-ring', 'focus-visible:ring-offset-2',
    'disabled:pointer-events-none', 'disabled:opacity-50',
    'duration-200'
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config 