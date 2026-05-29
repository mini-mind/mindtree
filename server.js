const { createApp } = require("./server-app");
const host = process.env.HOST || "0.0.0.0";
const port = process.env.PORT || 3100;
const app = createApp();

app.listen(port, host, () => {
  console.log(`mindgraph server listening on http://${host}:${port}`);
});
