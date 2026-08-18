import { taskApi } from "../lib/web-handlers.js";

export default {
  async fetch(request) {
    return taskApi(request);
  }
};
