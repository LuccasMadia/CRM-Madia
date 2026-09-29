module.exports = {
  apps: [
    {
      name: "crm-madia-api",
      script: "server/index.js",
      cwd: __dirname,
    },
    {
      name: "crm-madia-web",
      script: "node_modules/vite/bin/vite.js",
      cwd: __dirname,
    },
  ],
};
