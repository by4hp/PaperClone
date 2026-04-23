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
          50: "#F7F9FC",
          100: "#EFF3FA",
          200: "#E2E9F4",
        },
        // Token name kept as `sage` for backward compatibility with existing
        // class names; values are a soft, slightly lavender-leaning brand
        // blue tuned to the reference mock.
        sage: {
          50: "#F3F6FE",
          100: "#E5EDFD",
          200: "#CFDBFA",
          300: "#A9BEF4",
          400: "#849FEC",
          500: "#5C7DE6",
          600: "#4965DB",
          700: "#3850BE",
          800: "#2A3D94",
        },
        ink: {
          DEFAULT: "#1A2233",
          soft: "#3F4A63",
          mute: "#6A7388",
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
        card: "0 1px 2px rgba(26,34,51,0.04), 0 6px 16px -8px rgba(26,34,51,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
