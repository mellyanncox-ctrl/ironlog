// vite.config.mts
import { defineConfig } from "file:///sessions/relaxed-magical-maxwell/mnt/strong/node_modules/vite/dist/node/index.js";
import react from "file:///sessions/relaxed-magical-maxwell/mnt/strong/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///sessions/relaxed-magical-maxwell/mnt/strong/node_modules/@tailwindcss/vite/dist/index.mjs";
import { VitePWA } from "file:///sessions/relaxed-magical-maxwell/mnt/strong/node_modules/vite-plugin-pwa/dist/index.js";
var vite_config_default = defineConfig({
  root: "app",
  base: "./",
  // relative — works at any GitHub Pages repo path
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,wasm,webmanifest}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: "index.html"
      },
      manifest: {
        name: "Ironlog",
        short_name: "Ironlog",
        description: "Local-first strength training tracker",
        theme_color: "#0a0a0b",
        background_color: "#0a0a0b",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      }
    })
  ],
  build: { outDir: "../dist", emptyOutDir: true }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcubXRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL3Nlc3Npb25zL3JlbGF4ZWQtbWFnaWNhbC1tYXh3ZWxsL21udC9zdHJvbmdcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9zZXNzaW9ucy9yZWxheGVkLW1hZ2ljYWwtbWF4d2VsbC9tbnQvc3Ryb25nL3ZpdGUuY29uZmlnLm10c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vc2Vzc2lvbnMvcmVsYXhlZC1tYWdpY2FsLW1heHdlbGwvbW50L3N0cm9uZy92aXRlLmNvbmZpZy5tdHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSAnQHRhaWx3aW5kY3NzL3ZpdGUnO1xuaW1wb3J0IHsgVml0ZVBXQSB9IGZyb20gJ3ZpdGUtcGx1Z2luLXB3YSc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHJvb3Q6ICdhcHAnLFxuICBiYXNlOiAnLi8nLCAvLyByZWxhdGl2ZSBcdTIwMTQgd29ya3MgYXQgYW55IEdpdEh1YiBQYWdlcyByZXBvIHBhdGhcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgdGFpbHdpbmRjc3MoKSxcbiAgICBWaXRlUFdBKHtcbiAgICAgIHJlZ2lzdGVyVHlwZTogJ2F1dG9VcGRhdGUnLFxuICAgICAgd29ya2JveDoge1xuICAgICAgICBnbG9iUGF0dGVybnM6IFsnKiovKi57anMsY3NzLGh0bWwsc3ZnLHBuZyxpY28sd2FzbSx3ZWJtYW5pZmVzdH0nXSxcbiAgICAgICAgbWF4aW11bUZpbGVTaXplVG9DYWNoZUluQnl0ZXM6IDQgKiAxMDI0ICogMTAyNCxcbiAgICAgICAgbmF2aWdhdGVGYWxsYmFjazogJ2luZGV4Lmh0bWwnLFxuICAgICAgfSxcbiAgICAgIG1hbmlmZXN0OiB7XG4gICAgICAgIG5hbWU6ICdJcm9ubG9nJyxcbiAgICAgICAgc2hvcnRfbmFtZTogJ0lyb25sb2cnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0xvY2FsLWZpcnN0IHN0cmVuZ3RoIHRyYWluaW5nIHRyYWNrZXInLFxuICAgICAgICB0aGVtZV9jb2xvcjogJyMwYTBhMGInLFxuICAgICAgICBiYWNrZ3JvdW5kX2NvbG9yOiAnIzBhMGEwYicsXG4gICAgICAgIGRpc3BsYXk6ICdzdGFuZGFsb25lJyxcbiAgICAgICAgb3JpZW50YXRpb246ICdwb3J0cmFpdCcsXG4gICAgICAgIHN0YXJ0X3VybDogJy4vJyxcbiAgICAgICAgc2NvcGU6ICcuLycsXG4gICAgICAgIGljb25zOiBbXG4gICAgICAgICAgeyBzcmM6ICdpY29uLTE5Mi5wbmcnLCBzaXplczogJzE5MngxOTInLCB0eXBlOiAnaW1hZ2UvcG5nJyB9LFxuICAgICAgICAgIHsgc3JjOiAnaWNvbi01MTIucG5nJywgc2l6ZXM6ICc1MTJ4NTEyJywgdHlwZTogJ2ltYWdlL3BuZycgfSxcbiAgICAgICAgICB7IHNyYzogJ2ljb24tbWFza2FibGUtNTEyLnBuZycsIHNpemVzOiAnNTEyeDUxMicsIHR5cGU6ICdpbWFnZS9wbmcnLCBwdXJwb3NlOiAnbWFza2FibGUnIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgIH0pLFxuICBdLFxuICBidWlsZDogeyBvdXREaXI6ICcuLi9kaXN0JywgZW1wdHlPdXREaXI6IHRydWUgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUF3VCxTQUFTLG9CQUFvQjtBQUNyVixPQUFPLFdBQVc7QUFDbEIsT0FBTyxpQkFBaUI7QUFDeEIsU0FBUyxlQUFlO0FBRXhCLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLE1BQU07QUFBQSxFQUNOLE1BQU07QUFBQTtBQUFBLEVBQ04sU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBLElBQ1osUUFBUTtBQUFBLE1BQ04sY0FBYztBQUFBLE1BQ2QsU0FBUztBQUFBLFFBQ1AsY0FBYyxDQUFDLGlEQUFpRDtBQUFBLFFBQ2hFLCtCQUErQixJQUFJLE9BQU87QUFBQSxRQUMxQyxrQkFBa0I7QUFBQSxNQUNwQjtBQUFBLE1BQ0EsVUFBVTtBQUFBLFFBQ1IsTUFBTTtBQUFBLFFBQ04sWUFBWTtBQUFBLFFBQ1osYUFBYTtBQUFBLFFBQ2IsYUFBYTtBQUFBLFFBQ2Isa0JBQWtCO0FBQUEsUUFDbEIsU0FBUztBQUFBLFFBQ1QsYUFBYTtBQUFBLFFBQ2IsV0FBVztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFVBQ0wsRUFBRSxLQUFLLGdCQUFnQixPQUFPLFdBQVcsTUFBTSxZQUFZO0FBQUEsVUFDM0QsRUFBRSxLQUFLLGdCQUFnQixPQUFPLFdBQVcsTUFBTSxZQUFZO0FBQUEsVUFDM0QsRUFBRSxLQUFLLHlCQUF5QixPQUFPLFdBQVcsTUFBTSxhQUFhLFNBQVMsV0FBVztBQUFBLFFBQzNGO0FBQUEsTUFDRjtBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBLE9BQU8sRUFBRSxRQUFRLFdBQVcsYUFBYSxLQUFLO0FBQ2hELENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
