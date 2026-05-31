const { createApp } = require("./server/routes");
const host = process.env.HOST || "0.0.0.0";
const port = process.env.PORT || 3100;
const app = createApp();

app.listen(port, host, () => {
  console.log(`mindzoo server listening on http://${host}:${port}`);
});
