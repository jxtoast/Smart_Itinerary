import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  daisyui: {
    themes: ["dark"], // Or "dark", "cupcake", etc.
  },
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Brighter background colors
        'main-1': "#F8FAFC", // Very light background (slate-50)
        'main-2': "#F1F5F9", // Light background for cards (slate-100)
        'main-3': "#E2E8F0", // Slightly darker for sections (slate-200)
        'colortext-1':"#2C2F33",
        // Additional background shades
        'main-4': '#CBD5E1', // slate-300
        'main-5': '#94A3B8', // slate-400
        // Additional text colors for more range
        'colortext-2': '#4B5563', // Gray-600 for secondary text
        'colortext-3': '#9CA3AF', // Gray-400 for tertiary text
        // Button color palette
        'btn': {
          'primary': {
            'base': '#818CF8',  // Lighter indigo (indigo-400)
            'hover': '#6366F1', // Original color for hover (indigo-500)
            'active': '#4F46E5', // Slightly darker for active state (indigo-600)
          },
          'secondary': {
            'base': '#F59E0B',
            'hover': '#D97706',
            'active': '#B45309',
          },
          'neutral': {
            'base': 'transparent',
            'hover': '#E2E8F0', // Same as main-3
            'border': '#CBD5E1', // Same as main-4
          },
          'success': {
            'base': '#0D9488',
            'hover': '#0F766E',
            'active': '#115E59',
          },
          'danger': {
            'base': '#EF4444',
            'hover': '#DC2626',
            'active': '#B91C1C',
          }
        }
          
      },
      animation: {
        "bounce-once": "bounce 0.8s ease-in-out 1",
      },
    },
  },
  plugins: [require("daisyui")],
} satisfies Config;
