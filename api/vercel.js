import { vercelApi } from "../lib/web-handlers.js";

export default {
  async fetch(request) {
    return vercelApi(request);
  }
};
