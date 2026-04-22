import type { Config } from "tailwindcss";

// Morandi blue-green + cream palette — education tool aesthetic.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: "#FBF8F2",
          100: "#F5EFE3",
          200: "#EBE2CF",
        },
        sage: {
          50: "#EEF2EF",
          100: "#D8E1DA",
          200: "#B4C4B6",
          300: "#8FA891",
          400: "#6D8C70",
          500: "#4E7353",
          600: "#3D5A57",
          700: "#2C4442",
          800: "#1F2F2E",
        },
        ink: {
          DEFAULT: "#1f2a2a",
          soft: "#4a5a58",
          mute: "#6b7a78",
        },
        accent: {
          clay: "#B08968",
        },
      },
      // Apple-style system font stack. Uses SF Pro on Apple devices,
      // PingFang SC for Chinese glyphs, with safe fallbacks elsewhere.
      // No web-font downloads — relies on device-native rendering.
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"Helvetica Neue"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          "system-ui",
          "sans-serif",
        ],
        // Alias for any lingering references; same stack.
        serif: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"PingFang SC"',
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(31,42,42,0.04), 0 6px 16px -8px rgba(31,42,42,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
