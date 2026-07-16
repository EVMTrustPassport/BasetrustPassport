import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,
    port: 5173,

    proxy: {
      "/base-stats": {
        target: "https://base.blockscout.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) =>
          path.replace(/^\/base-stats/, "/stats-service"),
      },
    

    },
  },

});
