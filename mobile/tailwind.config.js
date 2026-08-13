/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        foreground: "var(--foreground)",
        primary: "var(--primary)",
        "primary-foreground": "var(--primary-foreground)",
        accent: "var(--accent)",
        surface: "var(--surface)",
        "surface-secondary": "var(--surface-secondary)",
        border: "var(--border)",
        "chat-wallpaper": "var(--chat-wallpaper)",
        "chat-bubble-mine": "var(--chat-bubble-mine)",
        danger: "var(--danger)",
        success: "var(--success)",
        warning: "var(--warning)",
      },
      fontFamily: {
        sans: ["Inter"],
        display: ["Manrope"],
      },
    },
  },
  plugins: [],
};
