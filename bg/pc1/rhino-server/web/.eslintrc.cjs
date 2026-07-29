// related files:
// - bg/pc1/rhino-server/rules.md
// - bg/pc1/rhino-server/compute/scripts/process_abutment_stl.py
// - bg/pc1/rhino-server/compute/scripts/align_stl_coordinate.py
// - web/backend/controllers/bg/bg.controller.js
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: ["eslint:recommended"],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "react-hooks", "react-refresh"],
  settings: {
    react: { version: "detect" },
  },
  ignorePatterns: ["dist", "node_modules"],
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
  },
};
