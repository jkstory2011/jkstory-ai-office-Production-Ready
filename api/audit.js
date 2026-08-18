import { auditApi } from "../lib/web-handlers.js";

export default {
  async fetch(request) {
    return auditApi(request);
  }
};
