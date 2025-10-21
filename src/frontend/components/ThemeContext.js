import React, { createContext, useContext, useState, useEffect } from "react";

// Create Context
export const ThemeContext = createContext();

// Provider Component
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("Light");   // Light | Dark | System
  const [fontSize, setFontSize] = useState("Medium"); // Small | Medium | Large

  // 🔹 Apply theme + font size to body
  useEffect(() => {
    document.body.setAttribute("data-theme", theme.toLowerCase());
    document.body.setAttribute("data-font", fontSize.toLowerCase());
  }, [theme, fontSize]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, fontSize, setFontSize }}>
      {children}
    </ThemeContext.Provider>
  );
}

// 🔹 Custom hook for easier usage
export function useTheme() {
  return useContext(ThemeContext);
}
