import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 相対パスで出力し、GitHub Pages の https://ユーザー名.github.io/リポジトリ名/ のようなサブフォルダでも動くようにする
  base: "./",
  server: { host: true },
});
