import { readinessApi } from "../lib/web-handlers.js";

export default {
  async fetch(request) {
    return readinessApi(request);
  }
};
