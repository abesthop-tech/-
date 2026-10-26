import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Semantic custom property mappings
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        subtle: 'var(--bg-subtle)',
        'border-subtle': 'var(--border-subtle)',
        'border-strong': 'var(--border-strong)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'accent-primary': 'var(--accent-primary)',
        'accent-hover': 'var(--accent-hover)',
        'accent-subtle': 'var(--accent-subtle)',

        // Warm Editorial specific palette
        editorial: {
          canvas: '#FAF9F6',
          surface: '#FFFFFF',
          subtle: '#F3F2EE',
          border: '#E6E4DD',
          borderStrong: '#C7C4B8',
          text: '#1C1917',
          secondary: '#57534E',
          muted: '#78716C',
          accent: '#C2410C',
          accentHover: '#9A3412',
          accentSubtle: '#FFF7ED',
        },
        // Atmospheric Dark palette
        atmospheric: {
          canvas: '#151821',
          surface: '#1C202B',
          subtle: '#242936',
          border: 'rgba(255, 255, 255, 0.09)',
          borderStrong: 'rgba(255, 255, 255, 0.22)',
          text: '#F4F5F7',
          secondary: '#A3ACBF',
          muted: '#6E788C',
          accent: '#EA580C',
          accentHover: '#C2410C',
          accentSubtle: 'rgba(234, 88, 12, 0.14)',
        },

        // shadcn/ui compatible semantic tokens
        background: 'var(--bg-canvas)',
        foreground: 'var(--text-primary)',
        card: {
          DEFAULT: 'var(--bg-surface)',
          foreground: 'var(--text-primary)',
        },
        popover: {
          DEFAULT: 'var(--bg-surface)',
          foreground: 'var(--text-primary)',
        },
        primary: {
          DEFAULT: 'var(--accent-primary)',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: 'var(--bg-subtle)',
          foreground: 'var(--text-primary)',
        },
        muted: {
          DEFAULT: 'var(--bg-subtle)',
          foreground: 'var(--text-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent-subtle)',
          foreground: 'var(--accent-primary)',
        },
        border: 'var(--border-subtle)',
        input: 'var(--border-strong)',
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '6px',
        lg: '8px',
        xl: '12px',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Hiragino Kaku Gothic ProN"',
          '"Hiragino Sans"',
          '"BIZ UDPGothic"',
          '"Noto Sans JP"',
          'sans-serif',
        ],
      },
      maxWidth: {
        mobile: '390px',
        tablet: '640px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
